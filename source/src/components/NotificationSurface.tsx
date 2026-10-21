import { defaultAppearance, type Appearance, type Notice, type NotificationStyle } from '../../shared/types'
import { glassAppearance } from '../../shared/notificationAppearance'
import NotificationContent from './NotificationContent'
import LiquidGlass, { type LiquidGlassBackdropImage } from './LiquidGlass'

export default function NotificationSurface({ notice, notificationStyle, appearance = defaultAppearance, glass = false, backdropImage, stream, native = false, onClick, onClose }: {
  notice: Notice; notificationStyle: NotificationStyle; appearance?: Appearance; glass?: boolean;
  backdropImage?: LiquidGlassBackdropImage; stream?: MediaStream | null; native?: boolean;
  onClick?: () => void; onClose?: () => void;
}) {
  const content = <NotificationContent notice={notice} appearance={appearance} onClose={onClose} />
  return glass && notificationStyle === 'glass'
    ? <LiquidGlass {...glassAppearance} cornerRadius={appearance.radius} padding={`${appearance.padding}px`} className="notification-surface" blurAmount={0} backdropImage={backdropImage} backdropStream={stream} nativeBackdrop={native} onClick={onClick}>{content}</LiquidGlass>
    : <div className="notification-surface notification-solid" style={{ padding: appearance.padding, borderRadius: appearance.radius }} onClick={onClick}>{content}</div>
}
