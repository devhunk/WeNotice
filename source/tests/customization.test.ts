import test from 'node:test'
import assert from 'node:assert/strict'
import { defaults, type Notice, type Settings, type NotificationRule } from '../shared/types'
import { validateSettings, connectionChanged } from '../shared/preferences'
import { evaluateNotification, inQuietHours } from '../shared/notificationPolicy'
import { notificationCoordinates, notificationLayout } from '../shared/notificationLayout'
import { NoticeQueue } from '../electron/core/noticeQueue'
import { ForegroundGate, isWechatProcess } from '../electron/core/wechatForeground'
const settings = () => structuredClone(defaults)
const context = { sessionId: 'friend', content: '收到 HELLO 文件', muted: false, folded: false, statusKnown: true, outgoing: false as boolean | null }
const rule = (id = 'a'): NotificationRule => ({ id, name: id, enabled: true, condition: { kind: 'all', sessionIds: [], includes: [], excludes: [] }, action: { notify: true, bypassQuiet: false, bypassMuted: false, appearance: {} } })
test('旧配置迁移补默认值，保留连接字段且不共享可变对象', () => {
  const { schemaVersion, appearance, behavior, rules, quietHours, ui, ...legacy } = settings()
  const next = validateSettings({ ...legacy, accountDir: 'D:/wxid_demo_ab12', accountId: 'wxid_demo_ab12' })
  assert.equal(next.accountId, 'wxid_demo'); assert.equal(next.schemaVersion, 2); assert.equal(next.behavior.hideWhenWechatForeground, true)
  next.rules.push(rule()); assert.equal(defaults.rules.length, 0)
  assert.equal(validateSettings({ ...legacy, appearance: { avatarSize: 56 } }).appearance.titleSize, 13.5)
})
test('拒绝越界、错误类型、无效颜色、重复规则和错误时间', () => {
  for (const patch of [{ durationMs: 1 }, { appearance: { avatarSize: 200 } }, { appearance: { textColor: 'url(x)' } }, { behavior: { queueLimit: NaN } }, { rules: [rule(), rule()] }, { schemaVersion: 99 }, { enabled: 'true' }, { rules: [{ ...rule(), action: { ...rule().action, appearance: { width: 900 } } }] }, { quietHours: { enabled: true, periods: [{ id: 'x', days: [1], start: '25:00', end: '08:00' }] } }]) assert.throws(() => validateSettings({ ...settings(), ...patch }))
})
test('外观与规则保存不需要重连；连接参数或密钥变化需要重连', () => {
  const a = settings(), b = settings(); b.appearance.avatarSize = 50; b.pollSeconds = 10; b.rules = [rule()]
  assert.equal(connectionChanged(a, b), false); b.accountId = 'other'; assert.equal(connectionChanged(a, b), true); assert.equal(connectionChanged(a, a, 'a'.repeat(64)), true)
})
test('首条规则命中，关键词大小写与排除、私聊群聊、会话 ID 条件', () => {
  const s = settings(), first = rule('first'), second = rule('second'); first.condition.includes = ['hello']; first.action.appearance.bodySize = 20; second.action.notify = false; s.rules = [first, second]
  let result = evaluateNotification(s, context); assert.equal(result.rule?.id, 'first'); assert.equal(result.presentation.appearance.bodySize, 20); assert.equal(result.presentation.appearance.avatarSize, s.appearance.avatarSize)
  first.condition.excludes = ['文件']; assert.equal(evaluateNotification(s, context).rule?.id, 'second')
  first.condition.excludes = []; first.condition.kind = 'group'; assert.equal(evaluateNotification(s, context).rule?.id, 'second')
  first.condition.kind = 'private'; first.condition.sessionIds = ['other']; assert.equal(evaluateNotification(s, context).rule?.id, 'second')
})
test('跨午夜归属开始日、起点包含终点不包含、周末跨周', () => {
  const s = settings(); s.quietHours = { enabled: true, periods: [{ id: 'night', days: [6], start: '22:00', end: '08:00' }] }
  assert.equal(inQuietHours(s, new Date(2026, 9, 24, 22, 0)), true)
  assert.equal(inQuietHours(s, new Date(2026, 9, 25, 7, 59)), true)
  assert.equal(inQuietHours(s, new Date(2026, 9, 25, 8, 0)), false)
  assert.equal(inQuietHours(s, new Date(2026, 9, 23, 23, 0)), false)
})
test('重要会话例外只绕过指定免打扰，不能绕过全局、名单、前台、折叠及方向过滤', () => {
  const s = settings(), r = rule(); r.action.bypassMuted = true; r.action.bypassQuiet = true; s.rules = [r]
  s.quietHours = { enabled: true, periods: [{ id: 'night', days: [1], start: '09:00', end: '18:00' }] }
  const date = new Date(2026, 9, 19, 12)
  assert.equal(evaluateNotification(s, { ...context, muted: true, statusKnown: false }, date).allowed, true)
  assert.equal(evaluateNotification(s, context, date, true).allowed, false)
  for (const c of [{ ...context, folded: true }, { ...context, outgoing: true }, { ...context, outgoing: null }]) assert.equal(evaluateNotification(s, c, date).allowed, false)
  s.filterMode = 'blacklist'; s.filterIds = ['friend']; assert.equal(evaluateNotification(s, context, date).allowed, false)
  s.filterMode = 'all'; s.enabled = false; assert.equal(evaluateNotification(s, context, date).allowed, false)
})
test('未知免打扰状态仅在需要判断该状态时重试', () => {
  const s = settings(); assert.equal(evaluateNotification(s, { ...context, statusKnown: false }).retry, true)
  assert.equal(evaluateNotification(s, { ...context, outgoing: true, statusKnown: false }).retry, false)
  s.respectMuted = false; assert.equal(evaluateNotification(s, { ...context, statusKnown: false }).allowed, true)
})
test('前台门控只认微信进程，读取失败放行，测试通知和关闭开关例外', () => {
  assert.equal(isWechatProcess('C:\\Program Files\\Tencent\\Weixin.exe'), true)
  assert.equal(isWechatProcess('D:/WeChat.exe'), true); assert.equal(isWechatProcess('D:/FakeWeChat.exe'), false)
  let active = true; const gate = new ForegroundGate(() => active)
  assert.equal(gate.suppressed(true), true); assert.equal(gate.suppressed(true, true), false); assert.equal(gate.suppressed(false), false)
  active = false; assert.equal(gate.suppressed(true), false)
  assert.equal(new ForegroundGate(() => { throw Error('denied') }).suppressed(true), false)
})
const notice = (id: string, test = false): Notice => ({ id, sessionId: 'friend', title: id, content: id, timestamp: 1, count: 1, test })
test('切回微信清除真实活动及排队通知，不重放，手动测试仍保留', () => {
  const shown: string[] = [], queue = new NoticeQueue(n => shown.push(n.id), () => {})
  queue.push(notice('a')); queue.push(notice('b')); queue.push(notice('manual', true)); queue.clearReal()
  assert.equal(queue.active?.id, 'manual'); queue.close('manual'); assert.equal(queue.active, null); assert.deepEqual(shown, ['a', 'manual'])
  assert.equal(queue.close('a'), false)
})
test('关闭合并保留独立消息，上限缩小丢弃最早等待项', () => {
  let limit = 2; const queue = new NoticeQueue(() => {}, () => {}, () => ({ mergePending: false, queueLimit: limit }))
  queue.push(notice('a')); queue.push(notice('b')); queue.push(notice('c')); queue.push(notice('d')); limit = 1; queue.trim(); queue.close('a'); assert.equal(queue.active?.id, 'd'); assert.equal(queue.active?.count, 1)
})
test('固定宽度、超大字号、隐藏正文及负坐标屏幕保持在工作区', () => {
  const a = settings().appearance; a.widthMode = 'fixed'; a.width = 800; a.margin = 30; a.bodySize = 28
  const layout = notificationLayout('长'.repeat(2000), 'bottom-center', 500, 200, a); assert.equal(layout.width, 440); assert.ok(layout.maxBodyLines >= 1)
  a.widthMode = 'adaptive'; a.showBody = false
  assert.equal(notificationLayout('长'.repeat(2000), 'top-right', 1920, 1080, a).width, notificationLayout('短', 'top-right', 1920, 1080, a).width)
  const at = notificationCoordinates({ x: -1920, y: -200, width: 1920, height: 1080 }, 460, 100, 'bottom-center', 20)
  assert.deepEqual(at, { x: -1190, y: 760 })
})
