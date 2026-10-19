import type { NotificationStyle, Settings } from './types'

// Shared by the native panel, renderer and settings preview.
export const glassAppearance = { cornerRadius: 14, padding: '12px 14px', displacementScale: 35, aberrationIntensity: .4, saturation: 120 } as const
export function notificationStyle(value: unknown): NotificationStyle {
  if (value === undefined) return 'glass' // Retain the appearance of saved settings from older versions.
  if (value === 'wechat' || value === 'glass') return value
  throw new Error('通知样式无效')
}
export function usesGlass(settings: Pick<Settings, 'notificationStyle' | 'glass'>) {
  return settings.notificationStyle === 'glass' && settings.glass
}
