import type { Message } from '../../shared/types'

// Session unread counts cover incoming user messages, not outgoing/system rows.
// Unknown direction remains in the tail so it cannot revive an older read row.
export function unreadMessageIds(messages: Message[], unread: number): Set<string> {
  if (!Number.isSafeInteger(unread) || unread <= 0) return new Set()
  return new Set(messages.filter(m => m.outgoing !== true && !m.system)
    .sort((a, b) => a.timestamp - b.timestamp || a.sortSeq - b.sortSeq)
    .slice(-unread).map(m => m.id))
}
