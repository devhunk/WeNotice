import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Notice } from '../../shared/types'
import { renderTextWithEmoji } from '../utils/renderTextWithEmoji'

export function NoticeAvatar({ src, name, className = '' }: { src?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  return src && !failed
    ? <img className={`notice-avatar ${className}`} src={src} alt="" onError={() => setFailed(true)} />
    : <div className={`notice-avatar placeholder ${className}`} aria-hidden="true">{[...name][0] || '微'}</div>
}

// Keep the settings preview and desktop toast text layout in sync.
export default function NotificationContent({ notice, onClose }: { notice: Notice; onClose?: () => void }) {
  return <div className="notification-content">
    <div className="notification-avatar"><NoticeAvatar src={notice.avatarUrl} name={notice.title} /></div>
    <div className="notification-header">
      <span className="notification-title">{notice.title}</span>
      <div className="notification-meta">
        {notice.count > 1 && <span className="notification-count" aria-label={`${notice.count} 条新消息`}>{notice.count > 99 ? '99+' : notice.count} 条</span>}
        <time className="notification-time" dateTime={new Date(notice.timestamp * 1000).toISOString()}>{new Date(notice.timestamp * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
      </div>
      {onClose ? <button className="notification-close" aria-label="关闭通知" onClick={event => { event.stopPropagation(); onClose() }}><X size={13} /></button> : <span className="notification-close" aria-hidden="true"><X size={13} /></span>}
    </div>
    <div className="notification-body">{renderTextWithEmoji(notice.content, 19)}</div>
  </div>
}
