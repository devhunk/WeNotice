import type { Position } from './types'
export function notificationLayout(content: string, position: Position, availableWidth = 1920, availableHeight = 1080) {
  const widest = Math.max(0, ...content.split(/\r?\n/).map(line => [...line].reduce((sum, char) => sum + (/\s/.test(char) ? 4 : char.codePointAt(0)! > 0xffff ? 18 : /[\u0000-\u00ff]/.test(char) ? 7.2 : 14), 0)))
  const min = position === 'top-center' ? 320 : 336, max = position === 'top-center' ? 420 : 460
  const width = Math.max(1, Math.min(Math.max(min, Math.min(max, Math.round(min + Math.max(0, widest - 140) / 2.6))), availableWidth - 40))
  const maxBodyLines = Math.max(1, Math.min(6, Math.floor((Math.min(320, availableHeight - 40) - 76) / 20)))
  return { width, maxBodyLines }
}
