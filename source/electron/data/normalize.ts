import { decompress } from 'fzstd'
import type { Message, Session } from '../../shared/types'
import { accountIdentity } from '../../shared/accountIdentity'
import { messageSummary } from './messageSummary'

export function parseNativeJson(json: string): any {
  // Preserve 64-bit message IDs before JSON.parse rounds them.
  return JSON.parse(json.replace(/("(?:server_id|svr_id|msg_svr_id)"\s*:\s*)(-?\d{16,})(?=\s*[,}])/g, '$1"$2"'))
}
const str = (v: unknown): string => v == null ? '' : String(v)
export const seconds = (v: unknown): number => { const n = Number(v) || 0; return n > 1e11 ? Math.floor(n / 1000) : Math.floor(n) }
function binary(data: Uint8Array): string {
  const b = Buffer.from(data)
  if (b.length >= 4 && b.readUInt32LE() === 0xfd2fb528) return Buffer.from(decompress(b)).toString('utf8')
  return new TextDecoder('utf-8', { fatal: true }).decode(b)
}
function decode(raw: unknown): string {
  if (!raw) return ''
  try {
    if (raw instanceof Uint8Array) return binary(raw)
    if (typeof raw === 'object' && (raw as any).type === 'Buffer') return binary(Uint8Array.from((raw as any).data))
    if (typeof raw !== 'string') return ''
    // Do not decode arbitrary plain words or numeric messages as base64/hex.
    if (/^(28b52ffd)/i.test(raw) && /^[\da-f]+$/i.test(raw)) return binary(Buffer.from(raw, 'hex'))
    if (/^KLUv\//.test(raw)) return binary(Buffer.from(raw, 'base64'))
    return raw
  } catch { return '[无法解码的消息]' }
}
export function normalizeSession(row: any): Session {
  const rawUnread = row.unread_count ?? row.unreadCount ?? row.unreadcount
  const value = typeof rawUnread === 'number' || (typeof rawUnread === 'string' && /^\d+$/.test(rawUnread.trim())) ? Number(rawUnread) : NaN
  const unread = Number.isSafeInteger(value) && value >= 0 ? value : null
  return { id: str(row.username ?? row.user_name ?? row.userName ?? row.usrName ?? row.UsrName ?? row.talker ?? row.talker_id), timestamp: seconds(row.last_timestamp ?? row.lastTimestamp ?? row.last_msg_time ?? row.sort_timestamp), unread, summary: str(row.summary ?? row.digest ?? row.last_msg) }
}
export function normalizeMessage(row: any, sessionId: string, selfId: string): Message {
  const content = decode(row.compress_content) || decode(row.message_content ?? row.content)
  const realSender = row.real_sender_id ?? row.realSenderId
  const sender = str(row.sender_username ?? row.senderUsername) || (typeof realSender === 'string' && !/^\d+$/.test(realSender) ? realSender : '') || content.match(/^([^\s:<>]+):\n/)?.[1] || ''
  const flags = [row.computed_is_send, row.is_send, row.isSend].filter(flag => flag != null && flag !== '' && [0, 1].includes(Number(flag))).map(Number)
  const self = Boolean(sender && selfId && accountIdentity(sender) === accountIdentity(selfId))
  // Any explicit outgoing indication wins over a derived incoming flag.
  const outgoing = self || flags.includes(1) ? true : flags.includes(0) ? false : sender ? false : null
  const timestamp = seconds(row.create_time ?? row.createTime ?? row.msg_time)
  const localId = str(row.local_id ?? row.localId)
  const serverId = str(row.server_id ?? row.svr_id ?? row.msg_svr_id)
  const scope = str(row._db_path ?? row.db_path ?? row.db_name)
  const table = str(row.table_name ?? row._table_name)
  const sortSeq = Number(row.sort_seq ?? row.sortSeq) || timestamp * 1000
  const type = Number(row.local_type ?? row.localType) || 1
  const baseType = type % 0x100000000, subtype = Math.floor(type / 0x100000000)
  const system = baseType === 10000 || baseType === 10002 || (baseType === 49 && subtype === 62)
  const identity = serverId && serverId !== '0' ? ['server', serverId] : ['local', scope, table, localId, timestamp, sortSeq, sender, type]
  return { id: JSON.stringify([sessionId, ...identity]), sessionId, timestamp, sortSeq, localId, sender, outgoing: outgoing as boolean | null, system, content: messageSummary(content, type, sessionId).slice(0, 2000) }
}
