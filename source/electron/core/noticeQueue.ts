import type { Notice } from '../../shared/types'
export class NoticeQueue {
  active: Notice | null = null
  private pending: Notice[] = []
  constructor(private show: (notice: Notice) => void, private hide: () => void) {}
  push(notice: Notice) {
    // Merge waiting notices, never mutate an already delivered ID.
    const existing = this.pending.find(n => n.sessionId === notice.sessionId && !n.test && !notice.test)
    if (existing) { existing.content = notice.content; existing.timestamp = notice.timestamp; existing.count += notice.count; existing.avatarUrl = notice.avatarUrl || existing.avatarUrl }
    else { this.pending.push({ ...notice }); if (this.pending.length > 100) this.pending.shift() }
    this.next()
  }
  close(id: string): boolean {
    if (this.active?.id !== id) return false
    this.active = null; this.hide(); this.next(); return true
  }
  clear() { this.pending = []; this.active = null; this.hide() }
  private next() { if (this.active || !this.pending.length) return; this.active = this.pending.shift()!; this.show(this.active) }
}
