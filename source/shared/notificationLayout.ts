import { defaultAppearance, type Appearance, type Position } from './types'
export function displayBody(content: string, appearance: Appearance) { return appearance.showBody ? content : '收到新消息' }
export function notificationLayout(content: string, position: Position, availableWidth = 1920, availableHeight = 1080, appearance: Appearance = defaultAppearance) {
  content = displayBody(content, appearance)
  const scale = appearance.bodySize / 13
  const widest = Math.max(0, ...content.split(/\r?\n/).map(line => [...line].reduce((sum, char) => sum + (/\s/.test(char) ? 4 : char.codePointAt(0)! > 0xffff ? 18 : /[\u0000-\u00ff]/.test(char) ? 7.2 : 14) * scale, 0)))
  const center = position.endsWith('center'), min = center ? 320 : 336, max = center ? 420 : 460
  const desired = appearance.widthMode === 'fixed' ? appearance.width : Math.max(min, Math.min(max, Math.round(min + Math.max(0, widest - 140) / 2.6)))
  const width = Math.max(1, Math.min(desired, availableWidth - appearance.margin * 2))
  const maxHeight = Math.max(1, availableHeight - appearance.margin * 2)
  const maxBodyLines = Math.max(1, Math.min(appearance.maxLines, Math.floor((maxHeight - appearance.padding * 2 - appearance.titleSize * 1.35 - 24) / (appearance.bodySize * 1.5))))
  return { width, maxBodyLines }
}
export function notificationCoordinates(area: { x: number; y: number; width: number; height: number }, width: number, height: number, position: Position, margin: number) {
  const x = position.endsWith('center') ? area.x + (area.width - width) / 2 : position.endsWith('left') ? area.x + margin : area.x + area.width - width - margin
  const y = position.startsWith('bottom') ? area.y + area.height - height - margin : area.y + margin
  return { x: Math.round(Math.max(area.x, Math.min(x, area.x + Math.max(0, area.width - width)))), y: Math.round(Math.max(area.y, Math.min(y, area.y + Math.max(0, area.height - height)))) }
}
