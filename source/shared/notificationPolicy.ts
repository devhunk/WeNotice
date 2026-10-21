import { usesGlass } from './notificationAppearance'
import type { Contact, Notice, NotificationRule, Presentation, Settings } from './types'
export interface RuleContext { sessionId: string; content: string; muted: boolean; folded: boolean; statusKnown: boolean; outgoing: boolean | null }
export function matchingRule(settings: Settings, context: RuleContext) {
  const group = context.sessionId.includes('@chatroom'), text = context.content.toLocaleLowerCase()
  return settings.rules.find(rule => {
    const c = rule.condition
    const ids = c.sessionIds.map(x => x.trim()).filter(Boolean), includes = c.includes.map(x => x.trim()).filter(Boolean), excludes = c.excludes.map(x => x.trim()).filter(Boolean)
    return rule.enabled && (c.kind === 'all' || (c.kind === 'group') === group) && (!ids.length || ids.includes(context.sessionId)) && (!includes.length || includes.some(w => text.includes(w.toLocaleLowerCase()))) && !excludes.some(w => text.includes(w.toLocaleLowerCase()))
  })
}
export function inQuietHours(settings: Settings, date = new Date()) {
  const day = date.getDay(), minute = date.getHours() * 60 + date.getMinutes(), minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
  return settings.quietHours.enabled && settings.quietHours.periods.some(p => {
    const start = minutes(p.start), end = minutes(p.end)
    return start < end ? p.days.includes(day) && minute >= start && minute < end : (p.days.includes(day) && minute >= start) || (p.days.includes((day + 6) % 7) && minute < end)
  })
}
export function presentation(settings: Settings, rule?: NotificationRule): Presentation {
  return { appearance: { ...settings.appearance, ...rule?.action.appearance }, behavior: { ...settings.behavior }, durationMs: rule?.action.durationMs ?? settings.durationMs, position: rule?.action.position ?? settings.position, glass: usesGlass(settings), notificationStyle: settings.notificationStyle }
}
export function evaluateNotification(settings: Settings, context: RuleContext, date = new Date(), foreground = false) {
  const rule = matchingRule(settings, context), result = presentation(settings, rule)
  let reason = ''
  if (!settings.enabled) reason = '全局通知已关闭'
  else if (context.outgoing !== false) reason = '自发消息或消息方向未知'
  else if (context.folded) reason = '折叠会话'
  else if ((settings.filterMode === 'whitelist' && !settings.filterIds.includes(context.sessionId)) || (settings.filterMode === 'blacklist' && settings.filterIds.includes(context.sessionId))) reason = '会话名单拦截'
  else if (foreground && settings.behavior.hideWhenWechatForeground) reason = '微信当前在前台'
  else if (rule && !rule.action.notify) reason = '匹配规则关闭提醒'
  else if (settings.respectMuted && !rule?.action.bypassMuted && !context.statusKnown) reason = '无法读取会话免打扰状态'
  else if (settings.respectMuted && context.muted && !rule?.action.bypassMuted) reason = '微信免打扰'
  else if (inQuietHours(settings, date) && !rule?.action.bypassQuiet) reason = '当前处于免打扰时段'
  return { allowed: !reason, reason: reason || '允许提醒', rule, presentation: result, retry: reason === '无法读取会话免打扰状态' }
}
export function noticeContext(notice: Notice): RuleContext {
  return { sessionId: notice.sessionId, content: notice.context?.rawContent ?? notice.content, muted: notice.context?.muted ?? false, folded: notice.context?.folded ?? false, statusKnown: notice.context?.statusKnown ?? true, outgoing: notice.context?.outgoing ?? false }
}
export function messageContext(sessionId: string, content: string, contact: Contact, outgoing: boolean | null): RuleContext { return { sessionId, content, ...contact, outgoing } }
