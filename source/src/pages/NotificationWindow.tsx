import { useCallback, useEffect, useRef, useState } from 'react'
import NotificationContent from '../components/NotificationContent'
import LiquidGlass from '../components/LiquidGlass'
import { getLayoutRect, useNotificationAdaptiveTheme, useNotificationNativeAdaptiveTheme } from './useNotificationAdaptiveTheme'
import type { Delivery } from '../../shared/types'
import { notificationLayout } from '../../shared/notificationLayout'
import '../components/NotificationToast.scss'
import './NotificationWindow.scss'

export default function NotificationWindow() {
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [closing, setClosing] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const current = useRef<Delivery | null>(null), exitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const root = useRef<HTMLDivElement>(null)
  const api = window.electronAPI?.notification
  current.current = delivery
  useEffect(() => {
    if (!api) return
    const remove = api.onShow(data => {
      if (current.current?.notice.id !== data.notice.id) { clearTimeout(exitTimer.current); setClosing(false) }
      setDelivery(data); api.received(data.notice.id)
    })
    api.ready(); return remove
  }, [api])
  const close = useCallback((clicked = false) => {
    const item = current.current; if (!item || exitTimer.current) return
    const id = item.notice.id; setClosing(true); api?.glassHide(id)
    exitTimer.current = setTimeout(() => {
      exitTimer.current = undefined
      if (current.current?.notice.id !== id) return
      setDelivery(null); clicked ? api?.click(id) : api?.close(id)
    }, 300)
  }, [api])
  useEffect(() => {
    clearTimeout(exitTimer.current); exitTimer.current = undefined; setClosing(false)
    if (!delivery) return
    const timer = setTimeout(() => close(), delivery.durationMs)
    return () => { clearTimeout(timer); clearTimeout(exitTimer.current); exitTimer.current = undefined }
  }, [delivery?.notice.id, close])
  useEffect(() => {
    if (!delivery?.backdrop.sourceId || delivery.backdrop.native) { setStream(null); return }
    let cancelled = false; let owned: MediaStream | undefined
    navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: delivery.backdrop.sourceId, maxFrameRate: 30 } } } as unknown as MediaStreamConstraints).then(value => {
      if (cancelled || document.visibilityState === 'hidden') { value.getTracks().forEach(track => track.stop()); return }
      owned = value; setStream(value)
    }).catch(() => setStream(null))
    const stopHidden = () => { if (document.visibilityState === 'hidden') { owned?.getTracks().forEach(track => track.stop()); setStream(null) } }
    document.addEventListener('visibilitychange', stopHidden)
    return () => { cancelled = true; owned?.getTracks().forEach(track => track.stop()); document.removeEventListener('visibilitychange', stopHidden); setStream(null) }
  }, [delivery?.notice.id, delivery?.backdrop.sourceId, delivery?.backdrop.native])
  const backdrop = delivery ? { width: delivery.backdrop.width, height: delivery.backdrop.height, screenX: delivery.backdrop.winX, screenY: delivery.backdrop.winY } : undefined
  useNotificationAdaptiveTheme(stream, backdrop)
  useNotificationNativeAdaptiveTheme(Boolean(delivery?.backdrop.native))
  useEffect(() => {
    if (!delivery || !root.current) return
    const element = root.current; let frame = 0, lastSize = '', lastGlass = ''
    const report = () => {
      if (current.current?.notice.id !== delivery.notice.id) return
      const width = (delivery.layout || notificationLayout(delivery.notice.content, delivery.position)).width, height = element.offsetHeight
      const size = `${width}:${height}`
      if (size !== lastSize) { lastSize = size; api?.resize(delivery.notice.id, width, height) }
      const glass = element.querySelector<HTMLElement>('.liquid-glass')
      if (!glass || !delivery.backdrop.native) return
      const card = getLayoutRect(glass)
      const bands = [{ id: 0, x: 0, y: 0, width: card.width, height: card.height }]
      for (const [id, selector] of [[1, '.notification-header'], [2, '.notification-body']] as const) {
        const node = element.querySelector<HTMLElement>(selector); if (!node) continue
        const rect = getLayoutRect(node); bands.push({ id, x: rect.left - card.left, y: rect.top - card.top, width: rect.width, height: rect.height })
      }
      const payload = { id: delivery.notice.id, card: { x: card.left, y: card.top, width: card.width, height: card.height }, dpr: devicePixelRatio, bands }
      const key = JSON.stringify(payload); if (key !== lastGlass) { lastGlass = key; api?.glassRect(payload) }
    }
    frame = requestAnimationFrame(report); const timer = setTimeout(report, 150)
    const observer = new ResizeObserver(report); observer.observe(element)
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); observer.disconnect() }
  }, [delivery?.notice.id, delivery?.backdrop.native, delivery?.backdrop.winX, delivery?.backdrop.winY, delivery?.position, api])
  if (!delivery) return null
  const { notice } = delivery
  return <div ref={root} id="notification-current" key={notice.id} style={{ '--noti-body-lines': delivery.layout?.maxBodyLines || 6 } as React.CSSProperties} className={`notification-toast-container ${closing ? '' : 'visible'} ${!stream && !delivery.backdrop.native ? 'material-fallback' : ''}`}>
    <LiquidGlass cornerRadius={14} padding="12px 14px" blurAmount={0} saturation={120} displacementScale={35} aberrationIntensity={.4} backdropImage={backdrop} backdropStream={stream} nativeBackdrop={delivery.backdrop.native} onClick={() => close(true)}>
      <NotificationContent notice={notice} onClose={() => close()} />
    </LiquidGlass>
  </div>
}
