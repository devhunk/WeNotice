import { getEmojiPath } from 'wechat-emojis'
import type { TextMeasure } from '../../shared/notificationLayout'
import { defaultAppearance, type Appearance } from '../../shared/types'

export function createNotificationMeasure(appearance: Appearance = defaultAppearance): TextMeasure | undefined {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) return undefined
  return (text, kind) => {
    context.font = `${kind === 'title' ? '600' : '400'} ${kind === 'meta' ? 11 : kind === 'title' ? appearance.titleSize : appearance.bodySize}px "Microsoft YaHei UI", "Segoe UI", sans-serif`
    return text.split(/\[(.*?)\]/g).reduce((width, part, index) => {
      if (index % 2 && kind === 'body' && getEmojiPath(part as Parameters<typeof getEmojiPath>[0])) return width + appearance.bodySize * 1.35 + 3
      return width + context.measureText(index % 2 ? `[${part}]` : part).width
    }, 0)
  }
}
