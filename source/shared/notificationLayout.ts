import { defaultAppearance, type Appearance, type Notice, type Position } from './types'
export type TextMeasure = (text: string, kind: 'body' | 'title' | 'meta') => number
export const notificationMetrics = { margin: 20, gutter: 10, minWidth: 288, maxWidth: 360, topCenterMaxWidth: 344, maxHeight: 320, bodyLineHeight: 22, chromeHeight: 72 } as const
export function displayBody(content: string, appearance: Appearance) { return appearance.showBody ? content : '收到新消息' }
export function notificationLayout(input: string | Pick<Notice, 'title' | 'content' | 'count'>, position: Position, availableWidth = 1920, availableHeight = 1080, appearanceOrMeasure?: Appearance | TextMeasure, measured?: TextMeasure) {
  const appearance = typeof appearanceOrMeasure === 'object' ? appearanceOrMeasure : defaultAppearance
  const measure: TextMeasure = (typeof appearanceOrMeasure === 'function' ? appearanceOrMeasure : measured) || ((text, kind) => [...text].reduce((sum, char) => sum + (/\s/.test(char) ? 4 : char.codePointAt(0)! > 0xffff ? 18 : /[\u0000-\u00ff]/.test(char) ? 7.2 : 14), 0) * (kind === 'body' ? appearance.bodySize / 14 : kind === 'title' ? appearance.titleSize / 14 : 11 / 14))
  const notice = typeof input === 'string' ? { content: input, title: '', count: 1 } : input
  let widest = 0
  for (const line of displayBody(notice.content, appearance).split(/\r\n|\r|\n/)) widest = Math.max(widest, measure(line, 'body'))
  const fixed = appearance.widthMode === 'fixed'
  const cap = Math.max(1, Math.min(fixed ? appearance.width : position.endsWith('center') ? notificationMetrics.topCenterMaxWidth : notificationMetrics.maxWidth, availableWidth - appearance.margin * 2))
  const meta = (appearance.showTime ? measure('00:00', 'meta') + 6 : 0) + (appearance.showCount && notice.count > 1 ? measure(`${notice.count > 99 ? '99+' : notice.count} 条`, 'meta') + 6 : 0) + 32
  const chrome = (appearance.showAvatar ? appearance.avatarSize + 12 : 0) + appearance.padding * 2 + notificationMetrics.gutter * 2
  const desired = fixed ? appearance.width : Math.max(notificationMetrics.minWidth + Math.max(0, widest - 130) / 2.2, Math.min(measure(notice.title, 'title') + meta + chrome, cap))
  const width = Math.max(1, Math.min(cap, Math.ceil(desired)))
  const maxHeight = Math.max(1, Math.min(typeof appearanceOrMeasure === 'object' ? Infinity : notificationMetrics.maxHeight, availableHeight - appearance.margin * 2))
  const maxBodyLines = Math.max(1, Math.min(appearance.maxLines, Math.floor((maxHeight - appearance.padding * 2 - appearance.titleSize * 1.35 - 24) / (appearance.bodySize * 1.5))))
  return { width, maxWidth: cap, maxHeight, maxBodyLines }
}
export function notificationCoordinates(area: { x: number; y: number; width: number; height: number }, width: number, height: number, position: Position, margin: number) {
  const x = position.endsWith('center') ? area.x + (area.width - width) / 2 : position.endsWith('left') ? area.x + margin : area.x + area.width - width - margin
  const y = position.startsWith('bottom') ? area.y + area.height - height - margin : area.y + margin
  return { x: Math.round(Math.max(area.x, Math.min(x, area.x + Math.max(0, area.width - width)))), y: Math.round(Math.max(area.y, Math.min(y, area.y + Math.max(0, area.height - height)))) }
}
