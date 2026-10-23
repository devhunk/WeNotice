import test from 'node:test'
import assert from 'node:assert/strict'
import { defaults } from '../shared/types'
import { sessionKind } from '../shared/sessionPolicy'
import { evaluateNotification } from '../shared/notificationPolicy'
import { validateSettings } from '../shared/preferences'
import { NativeAdapter } from '../electron/data/nativeAdapter'

const context = (sessionId: string) => ({ sessionId, content: '[公众号文章] 新文章', outgoing: false as const, muted: false, folded: false, statusKnown: true })
test('公众号默认屏蔽，明确放行仍遵循其他限制；好友转发文章不屏蔽', () => {
  const settings = structuredClone(defaults)
  assert.equal(evaluateNotification(settings, context('gh_sample')).allowed, false)
  assert.equal(evaluateNotification(settings, context('friend')).allowed, true)
  assert.equal(evaluateNotification(settings, context('group@chatroom')).allowed, true)
  settings.officialAllowIds = ['gh_sample', 'brandsessionholder']
  assert.equal(evaluateNotification(settings, context('gh_sample')).allowed, true)
  assert.equal(evaluateNotification(settings, context('brandsessionholder')).allowed, false)
  assert.equal(evaluateNotification(settings, { ...context('gh_sample'), muted: true }).allowed, false)
  settings.filterMode = 'blacklist'; settings.filterIds = ['gh_sample']
  assert.equal(evaluateNotification(settings, context('gh_sample')).allowed, false)
  settings.filterMode = 'all'; settings.enabled = false
  assert.equal(evaluateNotification(settings, context('gh_sample')).allowed, false)
})
test('业务容器精确识别，不按service子串误伤普通联系人', () => {
  for (const id of ['brandsessionholder', 'brandservicesessionholder', 'placeholder_foldgroup', 'something@placeholder']) assert.equal(sessionKind(id), 'aggregate')
  assert.equal(sessionKind('friend_service_x'), 'private')
  assert.equal(sessionKind('gh_example'), 'official')
})
test('旧设置兼容，公众号放行名单去重并持久化验证', () => {
  const old: any = structuredClone(defaults); delete old.officialAllowIds
  assert.deepEqual(validateSettings(old).officialAllowIds, [])
  const settings = validateSettings({ ...old, officialAllowIds: [' gh_a ', 'gh_a', 'gh_b'] })
  assert.deepEqual(settings.officialAllowIds, ['gh_a', 'gh_b'])
  assert.deepEqual(validateSettings(JSON.parse(JSON.stringify(settings))).officialAllowIds, settings.officialAllowIds)
  assert.throws(() => validateSettings({ ...old, officialAllowIds: 'gh_a' }))
})
test('只读会话目录批量加载名称头像，保留备注，过滤聚合并容忍可选元数据失败', async () => {
  const adapter = new NativeAdapter(() => {})
  const calls: string[] = []
  Object.assign(adapter, {
    sessions: () => [
      { id: 'friend', timestamp: 2 }, { id: 'gh_sample', timestamp: 1 }, { id: 'brandsessionholder', timestamp: 3 }, { id: 'friend', timestamp: 2 }
    ],
    json: (name: string, value: string) => {
      calls.push(name)
      if (name === 'names') return { friend: '备注', gh_sample: '公众号' }
      if (name === 'avatars') return { friend: 'https://example.org/avatar.png', gh_sample: 'file:///secret' }
      if (name === 'contact' && value === 'friend') return { nick_name: '昵称', remark: '备注' }
      throw new Error('optional metadata unavailable')
    }
  })
  const list = await adapter.conversations()
  assert.deepEqual(list.map(item => item.id), ['friend', 'gh_sample'])
  assert.equal(list[0].name, '昵称'); assert.equal(list[0].remark, '备注')
  assert.equal(list[0].avatarUrl, 'https://example.org/avatar.png')
  assert.equal(list[1].kind, 'official'); assert.equal(list[1].avatarUrl, undefined)
  assert.equal(calls.includes('status'), false)
})
test('群聊名称忽略内部ID并采用显示名称，无有效名称时不暴露chatroom标识', async () => {
  const adapter = new NativeAdapter(() => {})
  Object.assign(adapter, {
    api: { contact: true, names: true, avatars: true, status: true },
    sessions: () => [{ id: '123@chatroom', timestamp: 2 }, { id: '456@chatroom', timestamp: 1 }],
    json: (name: string, value: string) => {
      const ids = name === 'contact' ? [value] : JSON.parse(value)
      if (name === 'names') return { '123@chatroom': '项目协作群', '456@chatroom': '456@chatroom' }
      if (name === 'contact') return ids[0] === '123@chatroom' ? { remark: '123@chatroom', nick_name: 'wxid_group' } : { remark: '456@chatroom' }
      if (name === 'status') return Object.fromEntries(ids.map((id: string) => [id, { isMuted: false, isFolded: false }]))
      return {}
    }
  })
  const list = await adapter.conversations()
  assert.deepEqual(list.map(item => item.name), ['项目协作群', '群聊'])
  assert.equal(adapter.contact('123@chatroom').name, '项目协作群')
  assert.equal(adapter.contact('456@chatroom').name, '群聊')
})
test('私聊联系人仍优先使用备注', () => {
  const adapter = new NativeAdapter(() => {})
  Object.assign(adapter, {
    api: { contact: true, names: true },
    json: (name: string) => name === 'contact' ? { remark: '项目负责人', nick_name: '昵称' } : name === 'names' ? { friend: '通讯录名称' } : {}
  })
  assert.equal(adapter.contact('friend').name, '项目负责人')
})
