// Based on WeFlow notificationWindow.ts; rewritten for ID-scoped delivery and queue ownership.
import { BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import type { Delivery, Notice, Settings } from '../../shared/types'
import type { GlassPanel } from '@hicccc77/electron-liquid-glass'
import { NoticeQueue } from '../core/noticeQueue'
import { notificationLayout } from '../../shared/notificationLayout'
import { glassAppearance, usesGlass } from '../../shared/notificationAppearance'

export class NotificationWindows {
  readonly queue: NoticeQueue
  private win: BrowserWindow | null = null; private panel: GlassPanel | null = null
  private native: typeof import('@hicccc77/electron-liquid-glass') | null = null
  private panelDpr = 0; private ready = false; private delivery?: Delivery; private sourceId?: string
  private sourcePromise?: Promise<void>; private idle?: NodeJS.Timeout; private watchdog?: NodeJS.Timeout
  constructor(private settings: () => Settings, private url: (route: string) => string, private clicked: (notice: Notice) => void) {
    try { const mod = require('@hicccc77/electron-liquid-glass'); if (process.platform === 'win32' && mod.isSupported()) this.native = mod } catch {}
    this.queue = new NoticeQueue(notice => { void this.show(notice).catch(() => this.queue.close(notice.id)) }, () => this.hide())
    const allowed = (event: Electron.IpcMainEvent) => this.win && event.sender === this.win.webContents && event.senderFrame === this.win.webContents.mainFrame
    ipcMain.on('notice:ready', event => { if (!allowed(event)) return; this.ready = true; if (this.delivery && this.queue.active?.id === this.delivery.notice.id) this.send() })
    ipcMain.on('notice:received', (event, id) => { if (!allowed(event) || id !== this.queue.active?.id) return; this.armWatchdog(id) })
    ipcMain.on('notice:close', (event, id) => { if (allowed(event) && typeof id === 'string') this.queue.close(id) })
    ipcMain.on('notice:click', (event, id) => { if (!allowed(event) || this.queue.active?.id !== id) return; const notice = this.queue.active; if (notice && this.queue.close(id)) this.clicked(notice) })
    ipcMain.on('notice:resize', (event, data) => {
      if (!allowed(event) || data?.id !== this.queue.active?.id || !Number.isFinite(data.width) || !Number.isFinite(data.height)) return
      const area = screen.getPrimaryDisplay().workArea
      const layout = notificationLayout(this.queue.active!, this.settings().position, area.width, area.height)
      const width = Math.max(Math.min(288, layout.maxWidth), Math.min(layout.maxWidth, Math.ceil(data.width)))
      const maxHeight = Math.max(1, Math.min(320, area.height - 40))
      const height = Math.max(1, Math.min(maxHeight, Math.ceil(data.height)))
      if (this.win) { const [w, h] = this.win.getSize(); if (w !== width || h !== height) this.win.setSize(width, height); this.position(); this.refreshBackdropCoordinates() }
    })
    ipcMain.on('notice:glassRect', (event, payload) => { if (allowed(event) && payload?.id === this.queue.active?.id) this.glassRect(payload) })
    ipcMain.on('notice:glassHide', (event, id) => { if (allowed(event) && id === this.queue.active?.id) this.panel?.hide(240) })
    const displayChanged = () => { this.sourceId = undefined; this.destroyPanel(); if (this.queue.active) { this.position(); void this.show(this.queue.active) } }
    screen.on('display-added', displayChanged); screen.on('display-removed', displayChanged); screen.on('display-metrics-changed', displayChanged)
  }
  private create() {
    if (this.win && !this.win.isDestroyed()) return this.win
    this.ready = false
    const win = new BrowserWindow({ width: 344, height: 86, type: 'toolbar', frame: false, transparent: true, hasShadow: false, show: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, webPreferences: { preload: join(__dirname, 'notificationPreload.cjs'), contextIsolation: true, nodeIntegration: false } })
    this.win = win
    if (this.native) { try { if (!this.native.setWindowCapturePolicy(win, 'dda-only')) this.native = null } catch { this.native = null } }
    if (!this.native) win.setContentProtection(true)
    win.setIgnoreMouseEvents(true, { forward: true }); win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', event => event.preventDefault())
    win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(1))
    win.webContents.on('render-process-gone', () => { this.destroy(); if (this.queue.active) void this.show(this.queue.active) })
    win.on('closed', () => { if (this.win === win) { this.win = null; this.ready = false; this.destroyPanel() } })
    void win.loadURL(this.url('/notification')).catch(() => { if (this.queue.active) this.queue.close(this.queue.active.id) })
    return win
  }
  private position() {
    if (!this.win) return
    const area = screen.getPrimaryDisplay().workArea; const [width, height] = this.win.getSize(); const p = this.settings().position
    const x = p === 'top-center' ? area.x + (area.width - width) / 2 : p.endsWith('left') ? area.x + 20 : area.x + area.width - width - 20
    const y = p.startsWith('bottom') ? area.y + area.height - height - 20 : area.y + 20
    this.win.setPosition(Math.round(x), Math.round(y))
  }
  private async source() {
    if (this.sourceId) return
    if (!this.sourcePromise) this.sourcePromise = (async () => {
      try { const display = screen.getPrimaryDisplay(); const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }); this.sourceId = (sources.find(s => s.display_id === String(display.id)) || sources[0])?.id } catch {}
    })().finally(() => { this.sourcePromise = undefined })
    await this.sourcePromise
  }
  private async show(notice: Notice) {
    clearTimeout(this.idle); const win = this.create(); const settings = this.settings()
    const area = screen.getPrimaryDisplay().workArea
    const layout = notificationLayout(notice, settings.position, area.width, area.height)
    const [, height] = win.getSize(); win.setSize(layout.width, Math.min(height, Math.max(1, area.height - 40))); this.position()
    const glass = usesGlass(settings)
    if (glass && !this.native) await this.source()
    if (this.queue.active?.id !== notice.id || win.isDestroyed()) return
    if (!glass) this.destroyPanel()
    const display = screen.getPrimaryDisplay(); const [x, y] = win.getPosition()
    this.delivery = { notice, position: settings.position, notificationStyle: settings.notificationStyle, durationMs: settings.durationMs, layout, backdrop: { native: Boolean(this.native && glass), sourceId: glass && !this.native ? this.sourceId : undefined, width: display.size.width, height: display.size.height, winX: x - display.bounds.x, winY: y - display.bounds.y } }
    if (this.ready) this.send()
    win.setIgnoreMouseEvents(false); win.showInactive(); win.setAlwaysOnTop(true, 'screen-saver'); this.armWatchdog(notice.id)
  }
  private send() { if (this.delivery && this.win && !this.win.isDestroyed()) this.win.webContents.send('notice:show', this.delivery) }
  private armWatchdog(id: string) { clearTimeout(this.watchdog); this.watchdog = setTimeout(() => this.queue.close(id), this.settings().durationMs + 10000) }
  private refreshBackdropCoordinates() {
    if (!this.delivery || !this.win) return
    const display = screen.getPrimaryDisplay(); const [x, y] = this.win.getPosition()
    const b = this.delivery.backdrop
    if (b.winX === x - display.bounds.x && b.winY === y - display.bounds.y) return
    b.winX = x - display.bounds.x; b.winY = y - display.bounds.y; this.send()
  }
  private glassRect(payload: any) {
    if (!this.native || !this.win || !this.delivery?.backdrop.native) return
    const card = payload.card; const dpr = Number(payload.dpr)
    if (!card || ![card.x, card.y, card.width, card.height, dpr].every(Number.isFinite) || card.width <= 0 || card.height <= 0 || card.width > 1000 || card.height > 1000 || dpr < 0.5 || dpr > 5) return
    const [x, y] = this.win.getPosition(); const origin = process.platform === 'win32' ? screen.dipToScreenPoint({ x, y }) : { x, y }
    const bounds = { x: Math.round(origin.x + card.x * dpr), y: Math.round(origin.y + card.y * dpr), width: Math.round(card.width * dpr), height: Math.round(card.height * dpr) }
    const bands = (Array.isArray(payload.bands) ? payload.bands : []).filter((b: any) => [b.id, b.x, b.y, b.width, b.height].every(Number.isFinite)).slice(0, 3).map((b: any) => ({ id: b.id, x: Math.round(b.x * dpr), y: Math.round(b.y * dpr), width: Math.round(b.width * dpr), height: Math.round(b.height * dpr) }))
    try {
      if (this.panelDpr !== dpr) this.destroyPanel()
      if (!this.panel) {
        this.panel = this.native.createPanel({ ...bounds, dpr, cornerRadius: glassAppearance.cornerRadius * dpr, blurSigma: 2 * dpr, displacementScale: glassAppearance.displacementScale, aberrationIntensity: glassAppearance.aberrationIntensity, saturation: glassAppearance.saturation / 100, capturePolicy: 'dda-only', anchorWindow: this.win, lumaBands: bands, onLuma: values => { if (this.win && !this.win.isDestroyed()) this.win.webContents.send('notice:luma', values) } })
        this.panelDpr = dpr
        if (!this.panel) throw new Error('原生玻璃不可用')
      } else { this.panel.setBounds(bounds); this.panel.setLumaBands(bands); this.panel.anchor(this.win) }
      this.panel.show(120)
    } catch {
      this.destroyPanel(); this.native = null; this.win.setContentProtection(true)
      if (this.queue.active) void this.show(this.queue.active)
    }
  }
  private hide() { clearTimeout(this.watchdog); this.delivery = undefined; this.panel?.hide(0); if (this.win && !this.win.isDestroyed()) { this.win.hide(); this.win.setIgnoreMouseEvents(true, { forward: true }) }; clearTimeout(this.idle); this.idle = setTimeout(() => { if (!this.queue.active) this.destroy() }, 180000) }
  private destroyPanel() { try { this.panel?.destroy() } catch {}; this.panel = null; this.panelDpr = 0 }
  destroy() { clearTimeout(this.idle); clearTimeout(this.watchdog); this.destroyPanel(); const win = this.win; this.win = null; this.ready = false; if (win && !win.isDestroyed()) win.destroy() }
  shutdown() { this.queue.clear(); this.destroy(); this.native?.shutdown() }
}
