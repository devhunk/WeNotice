import { randomUUID } from 'node:crypto'
import type { Contact, Message, Notice, Session, Settings } from '../../shared/types'
export interface MessageSource { sessions(): Promise<Session[]>; messages(id: string, since: number): Promise<Message[]>; contact(id: string): Promise<Contact> }
const fallbackContact = (id: string): Contact => ({ name: id, muted: false, folded: false, statusKnown: false })
export class MessageMonitor {
  private epoch = 0; private active = false; private busy = false; private pending = false
  private timer?: NodeJS.Timeout; private poll?: NodeJS.Timeout; private scheduledAt = 0
  private startedAt = 0; private watermarks = new Map<string, number>(); private seen = new Map<string, { sessionId: string; timestamp: number }>()
  private snapshots = new Map<string, string>()
  private contacts = new Map<string, { value: Contact; at: number }>()
  constructor(private source: MessageSource, private settings: () => Settings, private deliver: (notice: Notice) => void, private onError: (error: Error) => void, private onCheck: () => void = () => {}, private now: () => number = Date.now) {}
  async start() {
    this.stop(); const epoch = this.epoch; this.active = true; this.startedAt = Math.floor(this.now() / 1000)
    this.watermarks.clear(); this.seen.clear(); this.contacts.clear(); this.snapshots.clear()
    const sessions = await this.source.sessions(); if (!this.valid(epoch)) return
    // Initialization is explicitly shown as connecting: everything read here is baseline.
    for (const session of sessions) {
      if (!this.valid(epoch)) return
      this.watermarks.set(session.id, Math.max(session.timestamp, this.startedAt - 5))
      this.snapshots.set(session.id, JSON.stringify([session.timestamp, session.unread, session.summary]))
      if (session.timestamp >= this.startedAt - 5) {
        const messages = await this.source.messages(session.id, this.startedAt - 5)
        if (!this.valid(epoch)) return
        for (const message of messages) this.seen.set(message.id, { sessionId: session.id, timestamp: message.timestamp })
      }
    }
    if (!this.valid(epoch)) return
    this.poll = setInterval(() => this.request(), this.settings().pollSeconds * 1000)
    this.onCheck()
  }
  stop() { this.epoch++; this.active = false; this.pending = false; this.scheduledAt = 0; clearTimeout(this.timer); clearInterval(this.poll); this.timer = undefined; this.poll = undefined }
  private valid(epoch: number) { return this.active && epoch === this.epoch }
  request() {
    if (!this.active) return
    if (this.busy) { this.pending = true; return }
    if (!this.scheduledAt) this.scheduledAt = this.now()
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.scheduledAt = 0; void this.flush() }, Math.max(0, Math.min(350, 1000 - (this.now() - this.scheduledAt))))
  }
  async flush() {
    if (!this.active) return
    if (this.busy) { this.pending = true; return }
    const epoch = this.epoch; this.busy = true
    try {
      const sessions = await this.source.sessions(); if (!this.valid(epoch)) return
      for (const session of sessions) {
        if (!this.valid(epoch)) return
        if (session.id.toLowerCase().includes('placeholder_foldgroup')) continue
        const previous = this.watermarks.get(session.id) ?? this.startedAt - 5
        const signature = JSON.stringify([session.timestamp, session.unread, session.summary])
        if (this.snapshots.get(session.id) === signature && session.timestamp < this.now() / 1000 - 120) continue
        // Recent sessions are revisited even when timestamp/unread count did not change.
        if (session.timestamp < previous && session.timestamp < this.now() / 1000 - 120) continue
        if (session.timestamp < this.startedAt - 5) continue
        const messages = await this.source.messages(session.id, Math.max(this.startedAt - 5, previous - 5))
        if (!this.valid(epoch)) return
        const candidates = messages.filter(m => m.timestamp >= this.startedAt && !this.seen.has(m.id))
        let contact = fallbackContact(session.id)
        if (candidates.some(m => m.outgoing !== true)) {
          contact = await this.getContact(session.id)
          if (!this.valid(epoch)) return
          if (this.settings().respectMuted && !contact.statusKnown) throw new Error('无法读取会话免打扰状态。请检查组件，或在设置中关闭“遵循微信免打扰”。')
        }
        for (const message of candidates) {
          if (!this.valid(epoch)) return
          this.seen.set(message.id, { sessionId: session.id, timestamp: message.timestamp })
          if (!this.allowed(session.id, contact) || message.outgoing === true) continue
          // Unknown direction is not enough evidence to announce an incoming message.
          if (message.outgoing === null) continue
          let body = message.content
          if (session.id.includes('@chatroom') && message.sender) {
            let sender = message.sender
            try { sender = (await this.getContact(message.sender)).name } catch {}
            if (!this.valid(epoch)) return
            body = `${sender}: ${body}`
          }
          this.deliver({ id: randomUUID(), sessionId: session.id, title: contact.name, avatarUrl: contact.avatarUrl, content: body, timestamp: message.timestamp, count: 1 })
        }
        if (!this.valid(epoch)) return
        this.watermarks.set(session.id, messages.reduce((latest, message) => Math.max(latest, message.timestamp), previous))
        this.snapshots.set(session.id, signature)
      }
      // Keep IDs while their messages can reappear in the overlap query. A wall-clock
      // TTL would re-notify an old last message when only its unread count changes.
      for (const [id, value] of this.seen) if (value.timestamp < (this.watermarks.get(value.sessionId) ?? 0) - 5) this.seen.delete(id)
      this.onCheck()
    } catch (error) { if (this.valid(epoch)) this.onError(error instanceof Error ? error : new Error('消息读取失败')) }
    finally { this.busy = false; if (this.pending && this.active) { this.pending = false; this.request() } }
  }
  private allowed(id: string, contact: Contact) {
    const settings = this.settings()
    if (!settings.enabled || contact.folded || (settings.respectMuted && contact.muted)) return false
    const included = settings.filterIds.includes(id)
    return settings.filterMode === 'all' || (settings.filterMode === 'whitelist' ? included : !included)
  }
  private async getContact(id: string) {
    const cached = this.contacts.get(id)
    if (cached && this.now() - cached.at < 15000) return cached.value
    const value = await this.source.contact(id); this.contacts.set(id, { value, at: this.now() })
    if (this.contacts.size > 2000) this.contacts.delete(this.contacts.keys().next().value!)
    return value
  }
}
