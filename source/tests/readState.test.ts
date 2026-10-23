import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeMessage, normalizeSession } from '../electron/data/normalize'
import { MessageMonitor, type MessageSource } from '../electron/core/monitor'
import { NoticeQueue } from '../electron/core/noticeQueue'
import { unreadMessageIds } from '../electron/core/unreadMessages'
import { defaults, type Message, type Notice, type Session } from '../shared/types'

const message = (id: string, timestamp = 1000): Message => ({ id, timestamp, sessionId: 'friend', sortSeq: timestamp * 1000, localId: id, sender: 'friend', outgoing: false, content: id })
function fixture() {
  let clock = 1000000
  let rows: Message[] = [message('baseline')]
  const session: Session = { id: 'friend', timestamp: 1000, unread: 1, summary: 'fixture' }
  const emitted: Notice[] = [], errors: Error[] = [], snapshots: Session[][] = []
  const source: MessageSource = {
    sessions: async () => [{ ...session }], messages: async () => [...rows],
    contact: async () => ({ name: 'Fixture', muted: false, folded: false, statusKnown: true })
  }
  const monitor = new MessageMonitor(source, () => structuredClone(defaults), n => emitted.push(n), e => errors.push(e), () => {}, () => clock, list => snapshots.push(list.map(s => ({ ...s }))))
  return { monitor, source, session, emitted, errors, snapshots, messages: (next: Message[]) => { rows = next }, advance: (ms: number) => { clock += ms } }
}

test('未读字段明确区分零、有效计数及未知，接受组件字段别名', () => {
  for (const unread of [undefined, null, '', ' ', 'no', -1, 1.5, Infinity, NaN, true, {}, []]) {
    assert.equal(normalizeSession({ unread_count: unread }).unread, null)
  }
  assert.equal(normalizeSession({ unread_count: 0 }).unread, 0)
  assert.equal(normalizeSession({ unreadCount: '2' }).unread, 2)
  assert.equal(normalizeSession({ unreadcount: ' 3 ' }).unread, 3)
})

test('系统类型明确标识，普通应用卡片不被误认系统消息', () => {
  for (const local_type of [10000, 10002, 62 * 0x100000000 + 49]) {
    assert.equal(normalizeMessage({ local_type }, 'friend', 'self').system, true)
  }
  for (const local_type of [1, 49, 6 * 0x100000000 + 49]) {
    assert.equal(normalizeMessage({ local_type }, 'friend', 'self').system, false)
  }
})

test('未读尾部按顺序和序号选择，自发与系统消息不挤掉真实入站消息', () => {
  const incoming = { ...message('incoming'), sortSeq: 2 }
  const old = { ...message('old'), sortSeq: 1 }
  const outgoing = { ...message('outgoing'), sortSeq: 3, outgoing: true }
  const system = { ...message('system'), sortSeq: 4, system: true }
  const rows = [system, outgoing, incoming, old]
  assert.deepEqual([...unreadMessageIds(rows, 1)], ['incoming'])
  assert.deepEqual(rows.map(m => m.id), ['system', 'outgoing', 'incoming', 'old'])
  assert.equal(unreadMessageIds(rows, 0).size, 0)
})

test('同秒新入站伴随自发与系统行仍提醒一次，携带原消息ID', async () => {
  const f = fixture()
  try {
    await f.monitor.start()
    f.messages([message('baseline'), { ...message('incoming'), sortSeq: 1000001 }, { ...message('outgoing'), outgoing: true, sortSeq: 1000002 }, { ...message('system'), system: true, sortSeq: 1000003 }])
    await f.monitor.flush(); await f.monitor.flush()
    assert.deepEqual(f.emitted.map(n => n.content), ['incoming'])
    assert.equal(f.emitted[0].sourceMessageId, 'incoming')
  } finally { f.monitor.stop() }
})

test('读取消息期间变成已读，消费旧候选；下次新未读不会补弹旧消息', async () => {
  const f = fixture()
  try {
    await f.monitor.start()
    f.source.messages = async () => { f.session.unread = 0; return [message('old', 1001)] }
    await f.monitor.flush()
    assert.equal(f.emitted.length, 0)
    assert.equal(f.snapshots.at(-1)?.[0].unread, 0)
    f.session.unread = 2; f.session.timestamp = 1002
    f.source.messages = async () => [message('old', 1001), message('new', 1002)]
    await f.monitor.flush()
    assert.deepEqual(f.emitted.map(n => n.content), ['new'])
  } finally { f.monitor.stop() }
})

test('未知未读保持候选，超过近期窗口后恢复仍只提醒一次', async () => {
  const f = fixture()
  try {
    await f.monitor.start()
    f.messages([message('baseline'), message('deferred')]); f.session.unread = null
    await f.monitor.flush(); assert.equal(f.emitted.length, 0)
    f.advance(180000); f.session.unread = 1
    await f.monitor.flush(); await f.monitor.flush()
    assert.deepEqual(f.emitted.map(n => n.content), ['deferred']); assert.equal(f.errors.length, 0)
  } finally { f.monitor.stop() }
})

test('复核时会话暂时缺失不消费候选，恢复后可继续处理', async () => {
  const f = fixture()
  try {
    await f.monitor.start(); f.messages([message('new')])
    let reads = 0; f.source.sessions = async () => ++reads === 2 ? [] : [{ ...f.session }]
    await f.monitor.flush(); assert.equal(f.emitted.length, 0)
    await f.monitor.flush(); assert.deepEqual(f.emitted.map(n => n.content), ['new'])
  } finally { f.monitor.stop() }
})

test('新未读只覆盖末尾入站消息，不复活较早已经读过的候选', async () => {
  const f = fixture()
  try {
    await f.monitor.start(); f.session.timestamp = 1002
    f.messages([message('previous-read', 1001), message('latest-unread', 1002)])
    await f.monitor.flush()
    assert.deepEqual(f.emitted.map(n => n.content), ['latest-unread'])
  } finally { f.monitor.stop() }
})

test('会话快照已指向查询批次之后的新消息时等待补查，不能误报旧尾部', async () => {
  const f = fixture()
  try {
    await f.monitor.start(); f.session.timestamp = 1002
    f.messages([message('previous-read', 1001)]); await f.monitor.flush()
    assert.equal(f.emitted.length, 0)
    f.messages([message('previous-read', 1001), message('latest', 1002)]); await f.monitor.flush()
    assert.deepEqual(f.emitted.map(n => n.content), ['latest'])
  } finally { f.monitor.stop() }
})

test('未知方向的最新消息占据未读尾部，不把更早已读消息误作未读', async () => {
  const f = fixture()
  try {
    await f.monitor.start(); f.session.timestamp = 1002
    f.messages([message('previous-read', 1001), { ...message('unknown', 1002), outgoing: null }])
    await f.monitor.flush(); assert.equal(f.emitted.length, 0)
  } finally { f.monitor.stop() }
})

test('旧会话未读变化仍发布撤销快照，启动历史和公众号聚合不读取提醒', async () => {
  const f = fixture()
  try {
    f.session.id = 'brandsessionholder'
    let queried = 0; f.source.messages = async () => { queried++; return [message('history')] }
    await f.monitor.start(); await f.monitor.flush(); assert.equal(queried, 0)
    f.advance(180000); f.session.unread = 0; await f.monitor.flush()
    assert.equal(f.snapshots.at(-1)?.[0].unread, 0); assert.equal(f.emitted.length, 0)
  } finally { f.monitor.stop() }
})

test('暂停丢弃尚未返回的已读复核，不发布过期快照', async () => {
  const f = fixture()
  try {
    await f.monitor.start(); f.messages([message('new')])
    let reads = 0, release!: (rows: Session[]) => void
    f.source.sessions = async () => ++reads === 2 ? new Promise(resolve => { release = resolve }) : [{ ...f.session }]
    const work = f.monitor.flush(); await new Promise(resolve => setImmediate(resolve))
    const count = f.snapshots.length; f.monitor.stop(); release([{ ...f.session, unread: 0 }]); await work
    assert.equal(f.snapshots.length, count); assert.equal(f.emitted.length, 0)
  } finally { f.monitor.stop() }
})

test('撤销会话先清理等待项，避免同会话闪现，其他会话与测试通知保留', () => {
  const shown: string[] = []
  const queue = new NoticeQueue(n => shown.push(n.id), () => {}, () => ({ mergePending: false, queueLimit: 100 }))
  const notice = (id: string, sessionId = 'friend', test = false): Notice => ({ id, sessionId, test, title: id, content: id, timestamp: 1, count: 1 })
  queue.push(notice('active')); queue.push(notice('pending')); queue.push(notice('other', 'other')); queue.push(notice('test', 'friend', true))
  queue.removeSessions(new Set(['friend']))
  assert.deepEqual(shown, ['active', 'other']); assert.equal(queue.close('active'), false)
  queue.close('other'); assert.equal(queue.active?.id, 'test')
  queue.removeSessions(new Set(['friend'])); assert.equal(queue.active?.id, 'test')
  queue.close('test'); assert.equal(queue.active, null)
})

test('等待通知合并时原消息ID随最新正文更新', () => {
  const queue = new NoticeQueue(() => {}, () => {})
  const notice = (id: string, sessionId: string): Notice => ({ id, sourceMessageId: `source-${id}`, sessionId, title: id, content: id, timestamp: 1, count: 1 })
  queue.push(notice('active', 'other')); queue.push(notice('first', 'friend')); queue.push(notice('latest', 'friend'))
  queue.close('active')
  assert.equal(queue.active?.content, 'latest'); assert.equal(queue.active?.sourceMessageId, 'source-latest')
})
