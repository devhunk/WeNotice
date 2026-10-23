import { defaults, defaultAppearance, defaultBehavior, type Appearance, type Settings, type NotificationRule } from './types'
import { configuredAccountId } from './accountIdentity'
import { notificationStyle } from './notificationAppearance'

export const positions = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const
export const appearanceRanges = { avatarSize: [20, 80], avatarRadius: [0, 40], titleSize: [10, 28], bodySize: [10, 28], radius: [0, 40], padding: [6, 32], width: [240, 800], maxLines: [1, 20], margin: [0, 100], opacity: [.1, 1] } as const
const record = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('设置格式错误')
  return value as Record<string, any>
}
const choice = <T extends string>(value: unknown, values: readonly T[], label: string): T => { if (!values.includes(value as T)) throw new Error(`${label}无效`); return value as T }
const boolean = (value: unknown, label: string) => { if (typeof value !== 'boolean') throw new Error(`${label}必须是开关`); return value }
const number = (value: unknown, min: number, max: number, label: string) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label}必须在 ${min}–${max} 之间`); return value }
const string = (value: unknown, max: number, label: string) => { if (typeof value !== 'string' || value.length > max) throw new Error(`${label}格式错误`); return value.trim() }
const strings = (value: unknown, maxCount: number, label: string) => {
  if (!Array.isArray(value) || value.length > maxCount) throw new Error(`${label}过多或格式错误`)
  return [...new Set(value.map(x => string(x, 256, label)).filter(Boolean))]
}
export function validateAppearance(input: unknown, partial = false): Appearance | Partial<Appearance> {
  const raw = record(input), result: Record<string, any> = {}
  for (const key of Object.keys(defaultAppearance) as (keyof Appearance)[]) {
    if (partial && raw[key] === undefined) continue
    const value = raw[key]
    if (key in appearanceRanges) { const [min, max] = appearanceRanges[key as keyof typeof appearanceRanges]; result[key] = number(value, min, max, key); if (key === 'maxLines') result[key] = Math.round(result[key]) }
    else if (key.startsWith('show')) result[key] = boolean(value, key)
    else if (key === 'theme') result[key] = choice(value, ['auto', 'light', 'dark', 'custom'], '通知主题')
    else if (key === 'widthMode') result[key] = choice(value, ['adaptive', 'fixed'], '宽度模式')
    else if (key === 'displayId') result[key] = string(value, 64, '屏幕')
    else { if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw new Error('颜色必须是六位十六进制色值'); result[key] = value }
  }
  return result as unknown as Appearance
}
export function validateRule(input: unknown): NotificationRule {
  const raw = record(input), c = record(raw.condition), a = record(raw.action)
  return { id: string(raw.id, 128, '规则 ID'), name: string(raw.name, 100, '规则名称'), enabled: boolean(raw.enabled, '启用规则'),
    condition: { kind: choice(c.kind, ['all', 'private', 'group'], '会话类型'), sessionIds: strings(c.sessionIds, 2000, '会话名单'), includes: strings(c.includes, 100, '包含词'), excludes: strings(c.excludes, 100, '排除词') },
    action: { notify: boolean(a.notify, '提醒'), bypassQuiet: boolean(a.bypassQuiet, '时段例外'), bypassMuted: boolean(a.bypassMuted, '微信免打扰例外'), appearance: validateAppearance(a.appearance, true),
      ...(a.position === undefined ? {} : { position: choice(a.position, positions, '位置') }), ...(a.durationMs === undefined ? {} : { durationMs: Math.round(number(a.durationMs, 2000, 30000, '显示时长')) }) } }
}
export function validateSettings(input: unknown): Settings {
  const saved = record(input)
  if (saved.schemaVersion !== undefined && saved.schemaVersion !== 2) throw new Error('不支持的配置版本')
  const raw = { ...structuredClone(defaults), ...saved }, ui = { ...defaults.ui, ...record(raw.ui) }, appearance = { ...defaultAppearance, ...record(raw.appearance) }, behavior = { ...defaultBehavior, ...record(raw.behavior) }, quiet = record(raw.quietHours)
  const paths = Object.fromEntries((['accountDir', 'accountId', 'libraryPath', 'keyLibraryPath'] as const).map(key => [key, string(raw[key], 4096, key)])) as Pick<Settings, 'accountDir' | 'accountId' | 'libraryPath' | 'keyLibraryPath'>
  paths.accountId = configuredAccountId(paths.accountDir, paths.accountId)
  if (!Array.isArray(raw.rules) || raw.rules.length > 200 || !Array.isArray(quiet.periods) || quiet.periods.length > 100) throw new Error('规则或时段过多')
  const rules = raw.rules.map(validateRule)
  if (rules.some(r => !r.id) || new Set(rules.map(r => r.id)).size !== rules.length) throw new Error('规则 ID 不可为空或重复')
  const periods = quiet.periods.map((input: unknown) => {
    const p = record(input)
    if (!Array.isArray(p.days) || p.days.length > 7 || p.days.some((d: unknown) => !Number.isInteger(d) || Number(d) < 0 || Number(d) > 6)) throw new Error('免打扰星期无效')
    if (![p.start, p.end].every(t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || p.start === p.end) throw new Error('免打扰起止时间必须有效且不同')
    return { id: string(p.id, 128, '时段 ID'), days: [...new Set<number>(p.days)], start: p.start as string, end: p.end as string }
  })
  if (periods.some(p => !p.id) || new Set(periods.map(p => p.id)).size !== periods.length) throw new Error('时段 ID 不可为空或重复')
  return { ...paths, schemaVersion: 2, notificationStyle: notificationStyle(saved.notificationStyle), enabled: boolean(raw.enabled, '新消息通知'), launchAtLogin: boolean(raw.launchAtLogin, '开机启动'), respectMuted: boolean(raw.respectMuted, '微信免打扰'), glass: boolean(raw.glass, '玻璃'),
    position: choice(raw.position, positions, '位置'), filterMode: choice(raw.filterMode, ['all', 'whitelist', 'blacklist'], '接收范围'), filterIds: strings(raw.filterIds, 2000, '会话名单'), durationMs: Math.round(number(raw.durationMs, 2000, 30000, '显示时长')), pollSeconds: Math.round(number(raw.pollSeconds, 2, 60, '补查间隔')),
    ui: { theme: choice(ui.theme, ['system', 'light', 'dark'], '界面主题'), sidebarCollapsed: boolean(ui.sidebarCollapsed, '折叠侧栏') }, appearance: validateAppearance(appearance) as Appearance,
    behavior: { hideWhenWechatForeground: boolean(behavior.hideWhenWechatForeground, '微信前台时隐藏'), pauseOnHover: boolean(behavior.pauseOnHover, '悬停暂停'), clickAction: choice(behavior.clickAction, ['open', 'close'], '点击操作'), mergePending: boolean(behavior.mergePending, '合并消息'), queueLimit: Math.round(number(behavior.queueLimit, 1, 500, '队列上限')), historyLimit: Math.round(number(behavior.historyLimit, 1, 1000, '历史上限')) },
    officialAllowIds: strings(raw.officialAllowIds, 2000, '公众号放行名单'),
    rules, quietHours: { enabled: boolean(quiet.enabled, '时段免打扰'), periods } }
}
export function connectionChanged(before: Settings, after: Settings, key?: string) {
  return Boolean(key) || (['accountDir', 'accountId', 'libraryPath', 'keyLibraryPath'] as const).some(k => before[k] !== after[k])
}
