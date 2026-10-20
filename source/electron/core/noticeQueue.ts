import type { Notice } from '../../shared/types'
export class NoticeQueue {
  active: Notice | null = null
  private pending: Notice[] = []
  constructor(private show: (notice: Notice) => void, private hide: () => void, private options = () => ({ mergePending: true, queueLimit: 100 })) {}
  push(notice: Notice) {
    // Merge waiting notices, never mutate an already delivered ID.
    const existing = this.options().mergePending && this.pending.find(n => n.sessionId === notice.sessionId && !n.test && !notice.test)
    if (existing) { existing.content = notice.content; existing.context = notice.context; existing.timestamp = notice.timestamp; existing.count += notice.count; existing.avatarUrl = notice.avatarUrl || existing.avatarUrl }
    else this.pending.push({ ...notice })
    this.trim()
    this.next()
  }
  close(id: string): boolean {
    if (this.active?.id !== id) return false
    this.active = null; this.hide(); this.next(); return true
  }
  clear() { this.pending = []; this.active = null; this.hide() }
  trim() { while (this.pending.length > this.options().queueLimit) this.pending.shift() }
  clearReal() { this.pending = this.pending.filter(n => n.test); if (this.active && !this.active.test) { this.active = null; this.hide(); this.next() } }
  private next() { if (this.active || !this.pending.length) return; this.active = this.pending.shift()!; this.show(this.active) }
}
