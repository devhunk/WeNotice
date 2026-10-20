import type { Appearance } from './types'
export function notificationStyle(a: Appearance): Record<string, string | number> {
  const style: Record<string, string | number> = { '--notice-avatar-size': `${a.avatarSize}px`, '--notice-avatar-radius': `${a.avatarRadius}px`, '--notice-title-size': `${a.titleSize}px`, '--notice-body-size': `${a.bodySize}px`, '--notice-radius': `${a.radius}px`, '--noti-body-lines': a.maxLines }
  if (a.theme !== 'auto') {
    const dark = a.theme === 'dark', color = a.theme === 'custom' ? a.textColor : dark ? '#eeeae2' : '#192027', background = a.theme === 'custom' ? a.background : dark ? '#292824' : '#fcfdfb'
    const rgb = [1, 3, 5].map(at => parseInt(background.slice(at, at + 2), 16))
    Object.assign(style, { '--noti-title-color': color, '--noti-body-color': color, '--noti-title-tertiary': color, '--noti-tint': `rgba(${rgb.join(',')},${a.opacity})`, '--liquid-glass-tint': `rgba(${rgb.join(',')},${a.opacity})`, '--noti-title-halo': 'none', '--noti-body-halo': 'none' })
  } else style['--liquid-glass-tint'] = `color-mix(in srgb, var(--noti-tint, rgba(252,253,251,.96)) ${a.opacity * 100}%, transparent)`
  return style
}
