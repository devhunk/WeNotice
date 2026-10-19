import { getEmojiPath } from 'wechat-emojis'
import type { TextMeasure } from '../../shared/notificationLayout'

export function createNotificationMeasure(): TextMeasure | undefined {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return undefined
  return (text, kind) => {
    context.font = `${kind === 'title' ? '500' : '400'} ${kind === 'meta' ? 11 : 14}px "Microsoft YaHei UI", "Segoe UI", sans-serif`
    return text.split(/\[(.*?)\]/g).reduce((width, part, index) => {
      if (index % 2 && kind === 'body' && getEmojiPath(part as Parameters<typeof getEmojiPath>[0])) return width + 20
      return width + context.measureText(index % 2 ? `[${part}]` : part).width
    }, 0)
  }
}
