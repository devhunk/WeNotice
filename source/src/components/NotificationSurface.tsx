import type { Notice, NotificationStyle } from '../../shared/types'
import { glassAppearance } from '../../shared/notificationAppearance'
import NotificationContent from './NotificationContent'
import LiquidGlass, { type LiquidGlassBackdropImage } from './LiquidGlass'

export default function NotificationSurface({ notice, notificationStyle, glass = false, backdropImage, stream, native = false, onClick, onClose }: {
  notice: Notice; notificationStyle: NotificationStyle; glass?: boolean;
  backdropImage?: LiquidGlassBackdropImage; stream?: MediaStream | null; native?: boolean;
  onClick?: () => void; onClose?: () => void;
}) {
  const content = <NotificationContent notice={notice} onClose={onClose} />
  return glass && notificationStyle === 'glass'
    ? <LiquidGlass {...glassAppearance} className="notification-surface" blurAmount={0} backdropImage={backdropImage} backdropStream={stream} nativeBackdrop={native} onClick={onClick}>{content}</LiquidGlass>
    : <div className="notification-surface notification-solid" onClick={onClick}>{content}</div>
}
