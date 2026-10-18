import test from 'node:test'
import assert from 'node:assert/strict'
import { notificationLayout } from '../shared/notificationLayout'
import { configuredAccountId } from '../shared/accountIdentity'
import { normalizeMessage } from '../electron/data/normalize'

test('toast expands for longer content and stays within the available work area', () => {
  const short = notificationLayout('好的', 'top-right'), medium = notificationLayout('请大家明天下午三点准时到会议室讨论设计方案', 'top-right'), long = notificationLayout('长消息'.repeat(100), 'top-right')
  assert.ok(short.width < medium.width && medium.width < long.width)
  assert.equal(long.width, 460)
  assert.ok(notificationLayout('长消息'.repeat(100), 'top-center').width <= 420)
  const constrained = notificationLayout('长消息'.repeat(100), 'top-right', 320, 200)
  assert.ok(constrained.width <= 280)
  assert.ok(constrained.maxBodyLines < long.maxBodyLines)
})
test('directory suffix is removed only when the account ID was copied from that same account directory', () => {
  assert.equal(configuredAccountId('C:/xwechat_files/wxid_example_2a25', 'wxid_example_2a25'), 'wxid_example')
  assert.equal(configuredAccountId('C:/xwechat_files/wxid_example_2a25', 'wxid_custom_1234'), 'wxid_custom_1234')
  assert.equal(configuredAccountId('C:/xwechat_files/wxid_example_2a25', 'wxid_example'), 'wxid_example')
})
test('own messages are outgoing despite a false derived flag, including group prefixes and legacy sender IDs', () => {
  const self = configuredAccountId('C:/xwechat_files/wxid_example_2a25', 'wxid_example_2a25')
  assert.equal(normalizeMessage({ sender_username: 'accountId_wxid_example', computed_is_send: 0, message_content: 'hello' }, 'friend', self).outgoing, true)
  assert.equal(normalizeMessage({ computed_is_send: 0, is_send: 1, message_content: 'hello' }, 'friend', self).outgoing, true)
  assert.equal(normalizeMessage({ computed_is_send: 0, message_content: 'wxid_example:\nhello' }, 'room@chatroom', self).outgoing, true)
  assert.equal(normalizeMessage({ real_sender_id: 'wxid_example', computed_is_send: 0, message_content: 'hello' }, 'friend', self).outgoing, true)
  assert.equal(normalizeMessage({ sender_username: 'wxid_friend', is_send: 0, message_content: 'hello' }, 'friend', self).outgoing, false)
  assert.equal(normalizeMessage({ message_content: 'hello' }, 'friend', self).outgoing, null)
})
