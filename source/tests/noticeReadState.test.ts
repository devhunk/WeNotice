import test from 'node:test'
import assert from 'node:assert/strict'
import { readNoticeState } from '../electron/core/noticeReadState'
import type { Message, Notice, Session } from '../shared/types'

const notice: Notice = { id: 'toast', sessionId: 'friend', sourceMessageId: 'old', title: '', content: '', timestamp: 1000, count: 1 }
const message = (id: string, timestamp = 1000): Message => ({ id, timestamp, sessionId: 'friend', localId: id, sortSeq: timestamp, sender: 'friend', outgoing: false, content: id })
const session = (unread: number | null, timestamp = 1000): Session => ({ id: 'friend', timestamp, unread, summary: '' })
test('展示前发现会话已读，不读取正文；未知状态等待', async () => {
  let reads = 0
  for (const unread of [0, null]) {
    const state = await readNoticeState({ sessions: async () => [session(unread)], messages: async () => { reads++; return [] } }, notice)
    assert.equal(state.unread, unread === 0 ? false : null)
  }
  assert.equal(reads, 0)
})
test('即使错过已读零状态，再有新消息也不会复活排队旧通知', async () => {
  const source = { sessions: async () => [session(1, 1001)], messages: async () => [message('old'), message('new', 1001)] }
  assert.equal((await readNoticeState(source, notice)).unread, false)
  assert.equal((await readNoticeState(source, { ...notice, sourceMessageId: 'new', timestamp: 1001 })).unread, true)
})
test('显示前复核查询过程中已读，或查询快照落后时延迟', async () => {
  let calls = 0
  const source = { sessions: async () => [session(++calls === 1 ? 1 : 0)], messages: async () => [message('old')] }
  assert.equal((await readNoticeState(source, notice)).unread, false)
  source.sessions = async () => [session(1, 1002)]
  assert.equal((await readNoticeState(source, notice)).unread, null)
})
