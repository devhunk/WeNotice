import type { Position } from './types'
export function notificationLayout(content: string, position: Position, availableWidth = 1920, availableHeight = 1080) {
  const widest = Math.max(0, ...content.split(/\r?\n/).map(line => [...line].reduce((sum, char) => sum + (/\s/.test(char) ? 4 : char.codePointAt(0)! > 0xffff ? 19 : /[\u0000-\u00ff]/.test(char) ? 7.5 : 15), 0)))
  const min = position === 'top-center' ? 304 : 328, max = position === 'top-center' ? 408 : 456
  const width = Math.max(1, Math.min(Math.max(min, Math.min(max, Math.round(304 + Math.max(0, widest - 160) / 3))), availableWidth - 40))
  const maxBodyLines = Math.max(1, Math.min(6, Math.floor((Math.min(300, availableHeight - 40) - 78) / 24)))
  return { width, maxBodyLines }
}
