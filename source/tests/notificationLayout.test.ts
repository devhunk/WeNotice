import test from 'node:test'
import assert from 'node:assert/strict'
import { notificationLayout } from '../shared/notificationLayout'
import { configuredAccountId } from '../shared/accountIdentity'
import { normalizeMessage } from '../electron/data/normalize'
import { validateSettings } from '../electron/settings'
import { defaults } from '../shared/types'
import { usesGlass } from '../shared/notificationAppearance'

test('toast expands for longer content and stays within the available work area', () => {
  const short = notificationLayout('好的', 'top-right'), medium = notificationLayout('请明天下午三点到会议室讨论', 'top-right'), long = notificationLayout('长消息'.repeat(100), 'top-right')
  assert.ok(short.width < medium.width && medium.width < long.width)
  assert.equal(long.width, 360)
  assert.equal(notificationLayout('长消息'.repeat(100), 'top-center').width, 344)
  const constrained = notificationLayout('长消息'.repeat(100), 'top-right', 320, 200)
  assert.ok(constrained.width <= 280)
  assert.ok(constrained.maxBodyLines < long.maxBodyLines)
})

test('header metadata contributes to width and every position respects small work areas', () => {
  const short = { title: '小林', content: '收到', count: 1 }
  const long = { ...short, title: '项目协作与设计评审讨论群', count: 120 }
  assert.ok(notificationLayout(long, 'top-right').width > notificationLayout(short, 'top-right').width)
  for (const position of ['top-right', 'bottom-right', 'top-left', 'bottom-left', 'top-center'] as const) {
    for (const width of [180, 320, 1920]) {
      const layout = notificationLayout(long, position, width, 180)
      assert.ok(layout.width > 0 && layout.width <= width - 40)
      assert.ok(layout.width <= (position === 'top-center' ? 344 : 360))
      assert.ok(layout.maxHeight <= 140)
      assert.ok(layout.maxBodyLines >= 1)
    }
  }
})

test('layout accepts actual font measurements and handles very many explicit lines', () => {
  const notice = { title: '标题', content: '[微笑]内容', count: 8 }
  const measured = notificationLayout(notice, 'top-right', 1920, 1080, (text, kind) => text.length * (kind === 'body' ? 100 : 10))
  assert.equal(measured.width, 360)
  assert.doesNotThrow(() => notificationLayout('\n'.repeat(150000), 'top-right'))
})

test('notification style survives save validation, old settings retain glass, and invalid styles reject', () => {
  assert.equal(defaults.notificationStyle, 'wechat')
  for (const style of ['wechat', 'glass'] as const) {
    assert.equal(validateSettings({ ...defaults, notificationStyle: style }).notificationStyle, style)
    assert.equal(usesGlass({ ...defaults, notificationStyle: style }), style === 'glass')
  }
  const { notificationStyle: _, ...legacy } = defaults
  assert.equal(validateSettings(legacy).notificationStyle, 'glass')
  assert.equal(usesGlass({ ...defaults, notificationStyle: 'glass', glass: false }), false)
  assert.throws(() => validateSettings({ ...defaults, notificationStyle: 'invalid' }), /通知样式/)
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
