import test from 'node:test'
import assert from 'node:assert/strict'
import { NoticeQueue } from '../electron/core/noticeQueue'
import { normalizeMessage, parseNativeJson } from '../electron/data/normalize'
import { MessageMonitor, type MessageSource } from '../electron/core/monitor'
import { NativeAdapter } from '../electron/data/nativeAdapter'
import { defaults, type Contact, type Message, type Notice, type Session } from '../shared/types'

const notice = (id: string, sessionId = id): Notice => ({ id, sessionId, title: sessionId, content: id, timestamp: 1000, count: 1 })
test('迟到关闭只作用于对应 ID，不关闭下一条通知', () => {
  const shown: string[] = []; const queue = new NoticeQueue(n => shown.push(n.id), () => {})
  queue.push(notice('a')); queue.push(notice('b')); assert.equal(queue.close('a'), true)
  assert.equal(queue.close('a'), false); assert.equal(queue.active?.id, 'b'); assert.deepEqual(shown, ['a', 'b'])
})
test('同会话待展示消息合并，其他会话保留顺序', () => {
  const queue = new NoticeQueue(() => {}, () => {})
  queue.push(notice('a')); queue.push(notice('b', 'group')); queue.push({ ...notice('c', 'group'), title: '项目协作群' }); queue.push(notice('d'))
  queue.close('a'); assert.equal(queue.active?.sessionId, 'group'); assert.equal(queue.active?.count, 2); assert.equal(queue.active?.content, 'c'); assert.equal(queue.active?.title, '项目协作群')
  queue.close('b'); assert.equal(queue.active?.id, 'd')
})
test('64 位 server_id 精度保留，不合并相邻消息', () => {
  const rows = parseNativeJson('[{"server_id":18446744073709551614,"create_time":1000},{"server_id":18446744073709551615,"create_time":1000}]')
  assert.equal(rows[0].server_id, '18446744073709551614')
  assert.notEqual(normalizeMessage(rows[0], 'friend', 'self').id, normalizeMessage(rows[1], 'friend', 'self').id)
})
test('不同会话的 local_id 不冲突；数字文本不被误解码', () => {
  const row = { local_id: 1, create_time: 1000, message_content: '12345678901234567890', is_send: 0 }
  assert.notEqual(normalizeMessage(row, 'a', 'self').id, normalizeMessage(row, 'b', 'self').id)
  assert.equal(normalizeMessage(row, 'a', 'self').content, row.message_content)
})
test('群消息去掉发送者前缀，自己发送的消息被正确识别', () => {
  const message = normalizeMessage({ server_id: '1', message_content: 'self:\n你好', sender_username: 'self', is_send: 0, local_type: 1 }, 'room@chatroom', 'self')
  assert.equal(message.outgoing, true); assert.equal(message.content, '你好')
})
const message = (id: string, timestamp = 1000, outgoing: boolean | null = false): Message => ({ id, sessionId: 'friend', timestamp, sortSeq: timestamp * 1000, localId: id, sender: 'friend', outgoing, content: id })
function fixture(overrides: Partial<Contact> = {}) {
  let messages: Message[] = [message('history')]
  const sessions: Session[] = [{ id: 'friend', timestamp: 1000, unread: 1, summary: 'history' }]
  const contacts: Contact = { name: '朋友', muted: false, folded: false, statusKnown: true, ...overrides }
  const source: MessageSource = { sessions: async () => sessions, messages: async () => [...messages], contact: async () => contacts }
  const emitted: Notice[] = [], errors: Error[] = []
  const monitor = new MessageMonitor(source, () => ({ ...defaults }), notice => emitted.push(notice), error => errors.push(error), () => {}, () => 1000000)
  return { monitor, source, emitted, errors, setMessages: (items: Message[]) => { messages = items }, sessions }
}
test('初始化不弹历史；同时间戳、未读数不变的新消息只弹一次', async () => {
  const f = fixture(); try {
    await f.monitor.start(); assert.equal(f.emitted.length, 0)
    f.setMessages([message('history'), message('new')]); await f.monitor.flush(); await f.monitor.flush()
    assert.deepEqual(f.emitted.map(n => n.content), ['new']); assert.equal(f.errors.length, 0)
  } finally { f.monitor.stop() }
})
test('过滤自发消息、未知方向及免打扰', async () => {
  const f = fixture(); try {
    await f.monitor.start(); f.setMessages([message('self', 1001, true), message('unknown', 1001, null), message('incoming', 1001)]); await f.monitor.flush()
    assert.deepEqual(f.emitted.map(n => n.content), ['incoming'])
  } finally { f.monitor.stop() }
  const muted = fixture({ muted: true }); try { await muted.monitor.start(); muted.setMessages([message('muted', 1001)]); await muted.monitor.flush(); assert.equal(muted.emitted.length, 0) } finally { muted.monitor.stop() }
})
test('暂停后丢弃正在等待的查询结果', async () => {
  const f = fixture(); await f.monitor.start()
  let release!: (messages: Message[]) => void
  f.source.messages = () => new Promise(resolve => { release = resolve })
  const processing = f.monitor.flush(); await new Promise(resolve => setImmediate(resolve)); f.monitor.stop(); release([message('late', 1001)])
  await processing; assert.equal(f.emitted.length, 0)
})
test('读取失败不推进基准，重试仍能发送消息', async () => {
  const f = fixture(); try {
    await f.monitor.start(); const read = f.source.messages; f.source.messages = async () => { throw new Error('temporary') }
    await f.monitor.flush(); assert.equal(f.errors.length, 1)
    f.source.messages = read; f.setMessages([message('history'), message('retry', 1001)]); await f.monitor.flush(); assert.equal(f.emitted[0].content, 'retry')
  } finally { f.monitor.stop() }
})
test('免打扰状态未知时保留消息用于稍后重试', async () => {
  const f = fixture({ statusKnown: false }); try {
    await f.monitor.start(); f.setMessages([message('later', 1001)]); await f.monitor.flush()
    assert.equal(f.errors.length, 1); assert.equal(f.emitted.length, 0)
  } finally { f.monitor.stop() }
})
test('长时间静默后未读数变化，不重新弹最后一条旧消息', async () => {
  let clock = 1000000
  const sessions: Session[] = [{ id: 'friend', timestamp: 1000, unread: 1, summary: 'history' }]
  let messages = [message('history')]
  const emitted: Notice[] = []
  const source: MessageSource = { sessions: async () => sessions, messages: async () => messages, contact: async () => ({ name: '朋友', muted: false, folded: false, statusKnown: true }) }
  const monitor = new MessageMonitor(source, () => ({ ...defaults }), n => emitted.push(n), error => { throw error }, () => {}, () => clock)
  try {
    await monitor.start(); messages = [...messages, message('new', 1001)]; sessions[0].timestamp = 1001
    await monitor.flush(); clock += 11 * 60 * 1000; await monitor.flush()
    sessions[0].unread = 0; await monitor.flush()
    assert.deepEqual(emitted.map(n => n.content), ['new'])
  } finally { monitor.stop() }
})
function nativeFixture(pages: any[][], failAt = -1) {
  const adapter = new NativeAdapter(() => {}); let page = 0, closed = 0, freed = 0
  Object.assign(adapter, { handle: 1, config: { accountId: 'self' }, ffi: { decode: (value: string) => value }, api: {
    cursor: (...args: any[]) => { args[6][0] = 2; return 0 },
    batch: (_handle: number, _cursor: number, out: any[], more: number[]) => {
      if (page === failAt) return 7
      out[0] = JSON.stringify(pages[page]); page++; more[0] = page < pages.length ? 1 : 0; return 0
    }, free: () => { freed++ }, cursorClose: () => { closed++; return 0 }
  } })
  return { adapter, stats: () => ({ page, closed, freed }) }
}
test('分页读取所有批次并释放每个返回字符串与游标', async () => {
  const f = nativeFixture([[{ server_id: '2', create_time: 1002, is_send: 0 }], [{ server_id: '1', create_time: 1001, is_send: 0 }]])
  const rows = await f.adapter.messages('friend', 1000)
  assert.deepEqual(rows.map(row => row.timestamp), [1001, 1002]); assert.deepEqual(f.stats(), { page: 2, closed: 1, freed: 2 })
})
test('批次读取失败仍关闭游标，不返回不完整消息', async () => {
  const f = nativeFixture([[{ server_id: '1' }], [{ server_id: '2' }]], 1)
  await assert.rejects(f.adapter.messages('friend', 1000), /状态码 7/)
  assert.deepEqual(f.stats(), { page: 1, closed: 1, freed: 1 })
})
