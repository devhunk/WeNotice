// Based on WeFlow notificationWindow.ts; rewritten for ID-scoped delivery and queue ownership.
import { BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import type { Delivery, Notice, Settings } from '../../shared/types'
import type { GlassPanel } from '@hicccc77/electron-liquid-glass'
import { NoticeQueue } from '../core/noticeQueue'
import { notificationLayout, notificationCoordinates } from '../../shared/notificationLayout'
import { evaluateNotification, noticeContext, presentation } from '../../shared/notificationPolicy'
import { createForegroundReader, ForegroundGate } from '../core/wechatForeground'
import { glassAppearance } from '../../shared/notificationAppearance'

export class NotificationWindows {
  readonly queue: NoticeQueue
  private win: BrowserWindow | null = null; private panel: GlassPanel | null = null
  private native: typeof import('@hicccc77/electron-liquid-glass') | null = null
  private panelDpr = 0; private ready = false; private delivery?: Delivery; private sourceId?: string
  private sourcePromise?: Promise<void>; private sourceDisplayId?: number; private idle?: NodeJS.Timeout; private watchdog?: NodeJS.Timeout
  private foreground: ForegroundGate; private foregroundTimer?: NodeJS.Timeout; private hovering = false; private panelRadius = -1; private showVersion = 0
  constructor(private settings: () => Settings, private url: (route: string) => string, private clicked: (notice: Notice) => void, readForeground = createForegroundReader()) {
    this.foreground = new ForegroundGate(readForeground)
    try { const mod = require('@hicccc77/electron-liquid-glass'); if (process.platform === 'win32' && mod.isSupported()) this.native = mod } catch {}
    this.queue = new NoticeQueue(notice => { void this.show(notice).catch(() => this.queue.close(notice.id)) }, () => this.hide(), () => this.settings().behavior)
    const allowed = (event: Electron.IpcMainEvent) => this.win && event.sender === this.win.webContents && event.senderFrame === this.win.webContents.mainFrame
    ipcMain.on('notice:ready', event => { if (!allowed(event)) return; this.ready = true; if (this.delivery && this.queue.active?.id === this.delivery.notice.id) this.send() })
    ipcMain.on('notice:received', (event, id) => { if (!allowed(event) || id !== this.queue.active?.id || this.hovering) return; this.armWatchdog(id) })
    ipcMain.on('notice:hover', (event, data) => {
      if (!allowed(event) || data?.id !== this.queue.active?.id || typeof data.paused !== 'boolean' || !this.delivery?.behavior.pauseOnHover) return
      this.hovering = data.paused; clearTimeout(this.watchdog); if (!this.hovering) this.armWatchdog(data.id)
    })
    ipcMain.on('notice:close', (event, id) => { if (allowed(event) && typeof id === 'string') this.queue.close(id) })
    ipcMain.on('notice:click', (event, id) => { if (!allowed(event) || this.queue.active?.id !== id) return; const notice = this.queue.active; if (notice && this.queue.close(id)) this.clicked(notice) })
    ipcMain.on('notice:resize', (event, data) => {
      if (!allowed(event) || data?.id !== this.queue.active?.id || !Number.isFinite(data.width) || !Number.isFinite(data.height)) return
      if (!this.delivery) return
      const area = this.display().workArea, a = this.delivery.appearance
      const layout = notificationLayout(this.queue.active!, this.delivery.position, area.width, area.height, a)
      const width = a.widthMode === 'fixed' ? layout.width : Math.max(Math.min(288, layout.maxWidth), Math.min(layout.maxWidth, Math.ceil(data.width)))
      const maxHeight = layout.maxHeight
      const height = Math.max(1, Math.min(maxHeight, Math.ceil(data.height)))
      if (this.win) { this.resize(width, height); this.position(); this.refreshBackdropCoordinates() }
    })
    ipcMain.on('notice:glassRect', (event, payload) => { if (allowed(event) && payload?.id === this.queue.active?.id) this.glassRect(payload) })
    ipcMain.on('notice:glassHide', (event, id) => { if (allowed(event) && id === this.queue.active?.id) this.panel?.hide(240) })
    const displayChanged = () => { this.sourceId = undefined; this.sourceDisplayId = undefined; this.destroyPanel(); if (this.queue.active) { this.position(); void this.show(this.queue.active) } }
    screen.on('display-added', displayChanged); screen.on('display-removed', displayChanged); screen.on('display-metrics-changed', displayChanged)
  }
  enqueue(notice: Notice) {
    if (this.foreground.suppressed(this.settings().behavior.hideWhenWechatForeground, notice.test)) { this.queue.clearReal(); return }
    this.queue.push(notice)
  }
  preferencesChanged() { this.queue.trim(); this.checkForeground() }
  private checkForeground() {
    if (this.foreground.suppressed(this.settings().behavior.hideWhenWechatForeground)) this.queue.clearReal()
  }
  private display() { const id = this.delivery?.appearance.displayId ?? this.settings().appearance.displayId; return screen.getAllDisplays().find(d => String(d.id) === id) || screen.getPrimaryDisplay() }
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
    const area = this.display().workArea; const [width, height] = this.win.getSize()
    const { x, y } = notificationCoordinates(area, width, height, this.delivery?.position ?? this.settings().position, this.delivery?.appearance.margin ?? this.settings().appearance.margin)
    this.win.setPosition(x, y)
  }
  private resize(width: number, height: number) {
    const win = this.win; if (!win) return
    const [w, h] = win.getSize(); if (w === width && h === height) return
    const resizable = win.isResizable()
    try { if (!resizable) win.setResizable(true); win.setSize(width, height) }
    finally { if (!resizable && !win.isDestroyed()) win.setResizable(false) }
  }
  private async source() {
    if (this.sourceId) return
    if (!this.sourcePromise) this.sourcePromise = (async () => {
      try { const display = this.display(); const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }); this.sourceId = sources.find(s => s.display_id === String(display.id))?.id; this.sourceDisplayId = display.id } catch {}
    })().finally(() => { this.sourcePromise = undefined })
    await this.sourcePromise
  }
  private async show(notice: Notice): Promise<void> {
    const version = ++this.showVersion, settings = this.settings()
    const previous = this.delivery?.notice.id === notice.id && this.delivery.layout ? this.delivery : undefined
    const policy = evaluateNotification(settings, noticeContext(notice))
    if (!notice.test && ((!previous && !policy.allowed) || this.foreground.suppressed(settings.behavior.hideWhenWechatForeground))) { this.queue.close(notice.id); return }
    clearTimeout(this.idle); const win = this.create()
    const resolved = previous ? { appearance: previous.appearance, behavior: previous.behavior, position: previous.position, durationMs: previous.durationMs, glass: previous.glass, notificationStyle: previous.notificationStyle } : notice.test ? presentation(settings) : policy.presentation
    this.delivery = { ...resolved, notice, backdrop: { native: false, width: 1, height: 1, winX: 0, winY: 0 } }
    const display = this.display(), area = display.workArea
    const layout = notificationLayout(notice, resolved.position, area.width, area.height, resolved.appearance)
    const [, height] = win.getSize(); this.resize(layout.width, Math.min(height, layout.maxHeight)); this.position()
    if (this.sourceDisplayId !== display.id) this.sourceId = undefined
    if (resolved.glass && !this.native) { await this.source(); if (version === this.showVersion && this.sourceDisplayId !== display.id) { this.sourceId = undefined; await this.source() } }
    if (version !== this.showVersion || this.queue.active?.id !== notice.id || win.isDestroyed()) return
    if (this.settings() !== settings && !previous) { this.delivery = undefined; return this.show(notice) }
    if (this.foreground.suppressed(this.settings().behavior.hideWhenWechatForeground, notice.test)) { this.queue.clearReal(); return }
    if (!resolved.glass) this.destroyPanel()
    const [x, y] = win.getPosition()
    this.delivery = { ...resolved, notice, layout, backdrop: { native: Boolean(this.native && resolved.glass), sourceId: resolved.glass && !this.native ? this.sourceId : undefined, width: display.size.width, height: display.size.height, winX: x - display.bounds.x, winY: y - display.bounds.y } }
    if (this.ready) this.send()
    win.setIgnoreMouseEvents(false); win.showInactive(); win.setAlwaysOnTop(true, 'screen-saver'); this.armWatchdog(notice.id)
    clearInterval(this.foregroundTimer); this.foregroundTimer = setInterval(() => this.checkForeground(), 250)
  }
  private send() { if (this.delivery && this.win && !this.win.isDestroyed()) this.win.webContents.send('notice:show', this.delivery) }
  private armWatchdog(id: string) { clearTimeout(this.watchdog); this.watchdog = setTimeout(() => this.queue.close(id), (this.delivery?.durationMs ?? this.settings().durationMs) + 10000) }
  private refreshBackdropCoordinates() {
    if (!this.delivery || !this.win) return
    const display = this.display(); const [x, y] = this.win.getPosition()
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
      const radius = this.delivery.appearance.radius
      if (this.panelDpr !== dpr || this.panelRadius !== radius) this.destroyPanel()
      if (!this.panel) {
        this.panel = this.native.createPanel({ ...bounds, dpr, cornerRadius: radius * dpr, blurSigma: 2 * dpr, displacementScale: glassAppearance.displacementScale, aberrationIntensity: glassAppearance.aberrationIntensity, saturation: glassAppearance.saturation / 100, capturePolicy: 'dda-only', anchorWindow: this.win, lumaBands: bands, onLuma: values => { if (this.win && !this.win.isDestroyed()) this.win.webContents.send('notice:luma', values) } })
        this.panelDpr = dpr
        this.panelRadius = radius
        if (!this.panel) throw new Error('原生玻璃不可用')
      } else { this.panel.setBounds(bounds); this.panel.setLumaBands(bands); this.panel.anchor(this.win) }
      this.panel.show(120)
    } catch {
      this.destroyPanel(); this.native = null; this.win.setContentProtection(true)
      if (this.queue.active) void this.show(this.queue.active)
    }
  }
  private hide() { this.showVersion++; clearInterval(this.foregroundTimer); this.hovering = false; clearTimeout(this.watchdog); this.delivery = undefined; this.panel?.hide(0); if (this.win && !this.win.isDestroyed()) { this.win.hide(); this.win.setIgnoreMouseEvents(true, { forward: true }) }; clearTimeout(this.idle); this.idle = setTimeout(() => { if (!this.queue.active) this.destroy() }, 180000) }
  private destroyPanel() { try { this.panel?.destroy() } catch {}; this.panel = null; this.panelDpr = 0 }
  destroy() { this.showVersion++; clearInterval(this.foregroundTimer); clearTimeout(this.idle); clearTimeout(this.watchdog); this.destroyPanel(); const win = this.win; this.win = null; this.ready = false; if (win && !win.isDestroyed()) win.destroy() }
  shutdown() { this.queue.clear(); this.destroy(); this.native?.shutdown() }
}
