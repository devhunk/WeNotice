import type { Notice, Position } from './types'

export type TextMeasure = (text: string, kind: 'body' | 'title' | 'meta') => number
const estimate: TextMeasure = text => [...text].reduce((sum, char) => sum + (/\s/.test(char) ? 4 : char.codePointAt(0)! > 0xffff ? 18 : /[\u0000-\u00ff]/.test(char) ? 7.2 : 14), 0)
export const notificationMetrics = { margin: 20, gutter: 10, minWidth: 288, maxWidth: 460, maxHeight: 320, bodyLineHeight: 22, chromeHeight: 72 } as const

export function notificationLayout(input: string | Pick<Notice, 'title' | 'content' | 'count'>, position: Position, availableWidth = 1920, availableHeight = 1080, measure: TextMeasure = estimate) {
  const { margin, minWidth, maxWidth, chromeHeight, bodyLineHeight } = notificationMetrics
  const notice = typeof input === 'string' ? { content: input, title: '', count: 1 } : input
  let widest = 0
  for (const line of notice.content.split(/\r\n|\r|\n/)) widest = Math.max(widest, measure(line, 'body'))
  const cap = Math.max(1, Math.min(position === 'top-center' ? 420 : maxWidth, availableWidth - margin * 2))
  const metadata = measure('00:00', 'meta') + (notice.count > 1 ? measure(`${notice.count > 99 ? '99+' : notice.count} 条`, 'meta') + 6 : 0) + 32
  const header = measure(notice.title, 'title') + metadata + 112
  const desired = Math.max(minWidth + Math.max(0, widest - 130) / 2.2, Math.min(header, cap))
  const width = Math.max(1, Math.min(cap, Math.ceil(desired)))
  const maxHeight = Math.max(1, Math.min(notificationMetrics.maxHeight, availableHeight - margin * 2))
  const maxBodyLines = Math.max(1, Math.min(10, Math.floor((maxHeight - chromeHeight) / bodyLineHeight)))
  return { width, maxWidth: cap, maxHeight, maxBodyLines }
}
