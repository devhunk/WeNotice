import type { Notice, Session } from '../../shared/types'
import type { MessageSource } from './monitor'
import { unreadMessageIds } from './unreadMessages'

export interface NoticeReadState { sessions: Session[]; unread: boolean | null }
export async function readNoticeState(source: Pick<MessageSource, 'sessions' | 'messages'>, notice: Notice): Promise<NoticeReadState> {
  let sessions = await source.sessions()
  let session = sessions.find(item => item.id === notice.sessionId)
  if (session?.unread == null) return { sessions, unread: null }
  if (session.unread === 0) return { sessions, unread: false }
  // Legacy/synthetic notifications have no source ID. Real new deliveries must
  // still belong to the unread tail: the user may have read and received another
  // message while this notice waited, without us observing the intermediate zero.
  if (!notice.sourceMessageId) return { sessions, unread: true }
  const messages = await source.messages(notice.sessionId, Math.max(0, notice.timestamp - 5))
  sessions = await source.sessions()
  session = sessions.find(item => item.id === notice.sessionId)
  if (session?.unread == null) return { sessions, unread: null }
  if (session.unread === 0) return { sessions, unread: false }
  if (session.timestamp > messages.reduce((latest, message) => Math.max(latest, message.timestamp), 0)
    || !messages.some(message => message.id === notice.sourceMessageId)) return { sessions, unread: null }
  return { sessions, unread: unreadMessageIds(messages, session.unread).has(notice.sourceMessageId) }
}
