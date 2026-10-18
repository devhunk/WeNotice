import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWechatTarget, WechatNavigator, type WechatTarget, type WechatOpenResult } from '../electron/core/wechatNavigation'
import type { Notice } from '../shared/types'
const notice: Notice = { id: 'n1', sessionId: 'wxid_friend', title: '朋友', content: 'hello', timestamp: 1, count: 1 }

test('conversation target prefers WeChat alias and never searches internal wxid or room IDs', () => {
  const target = buildWechatTarget('wxid_friend', { alias: 'friend_alias', remark: '朋友', name: '朋友', nickName: '昵称' }, '朋友')
  assert.deepEqual(target.queries, ['friend_alias', '朋友', '昵称'])
  assert.deepEqual(buildWechatTarget('123@chatroom', null, '项目群').queries, ['项目群'])
  assert.ok(buildWechatTarget('filehelper', null, '').names.includes('文件传输助手'))
  assert.throws(() => buildWechatTarget('wxid_unknown', null, 'wxid_unknown'))
  assert.throws(() => buildWechatTarget('bad\nvalue', null, '朋友'))
})
test('ordinary notification opens its own conversation while test notification stays in the app', async () => {
  const calls: WechatTarget[] = []
  const navigator = new WechatNavigator(async () => ({ name: '朋友', alias: 'friend_alias', muted: false, folded: false, statusKnown: true }), async target => { calls.push(target); return { status: 'opened' } })
  assert.equal((await navigator.open({ ...notice, test: true })).status, 'app')
  assert.equal(calls.length, 0)
  assert.equal((await navigator.open(notice)).status, 'opened')
  assert.equal(calls[0].sessionId, notice.sessionId)
})
test('navigation works from the delivered name after database disconnect and does not overlap searches', async () => {
  let finish!: (value: WechatOpenResult) => void
  const calls: WechatTarget[] = []
  const navigator = new WechatNavigator(async () => { throw new Error('paused') }, async target => { calls.push(target); return new Promise(resolve => { finish = resolve }) })
  const pending = navigator.open(notice)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await navigator.open({ ...notice, sessionId: 'other' })).status, 'busy')
  assert.deepEqual(calls[0].queries, ['朋友'])
  finish({ status: 'ambiguous', error: '同名' })
  assert.equal((await pending).status, 'ambiguous')
})
