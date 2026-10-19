import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { defaults, type Delivery, type Settings } from '../shared/types'
import { glassAppearance } from '../shared/notificationAppearance'

function fixture() {
  const listeners = new Map<string, Function>()
  const panels: any[] = [], deliveries: Delivery[] = []
  let captures = 0, settings: Settings = { ...defaults }
  class Window {
    size = [344, 86]; point = [0, 0]
    webContents = { mainFrame: {}, send: (_: string, value: Delivery) => deliveries.push(value), setWindowOpenHandler() {}, on() {}, setZoomFactor() {} }
    getSize() { return this.size } setSize(w: number, h: number) { this.size = [w, h] }
    getPosition() { return this.point } setPosition(x: number, y: number) { this.point = [x, y] }
    isDestroyed() { return false } loadURL() { return Promise.resolve() }
    setContentProtection() {} setIgnoreMouseEvents() {} showInactive() {} setAlwaysOnTop() {} on() {} hide() {} destroy() {}
  }
  const display = { workArea: { x: 0, y: 0, width: 320, height: 220 }, bounds: { x: 0, y: 0 }, size: { width: 320, height: 220 } }
  const native = { isSupported: () => true, setWindowCapturePolicy: () => true, shutdown() {}, createPanel(options: any) {
    const panel = { options, destroyed: false, destroy() { this.destroyed = true }, hide() {}, show() {}, setBounds() {}, setLumaBands() {}, anchor() {} }
    panels.push(panel); return panel
  } }
  const electron = { BrowserWindow: Window, ipcMain: { on: (key: string, fn: Function) => listeners.set(key, fn) }, screen: { getPrimaryDisplay: () => display, on() {}, dipToScreenPoint: (p: any) => p }, desktopCapturer: { getSources: async () => { captures++; return [] } } }
  const code = buildSync({ entryPoints: ['electron/windows/notificationWindow.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['electron', '@hicccc77/electron-liquid-glass'] }).outputFiles[0].text
  const mod = { exports: {} as any }
  runInNewContext(code, { module: mod, exports: mod.exports, __dirname: '.', process: { platform: 'win32' }, setTimeout, clearTimeout, require: (name: string) => name === 'electron' ? electron : name === '@hicccc77/electron-liquid-glass' ? native : require(name) })
  const windows = new mod.exports.NotificationWindows(() => settings, () => 'about:blank', () => {})
  const event = () => ({ sender: windows.win.webContents, senderFrame: windows.win.webContents.mainFrame })
  const send = (name: string, value?: unknown) => listeners.get(name)!(event(), value)
  return { windows, panels, deliveries, captures: () => captures, send, update: (value: Partial<Settings>) => { settings = { ...settings, ...value } } }
}

test('WeChat style avoids capture and native panels; resize clamps measured dimensions and rejects stale IDs', () => {
  const f = fixture()
  try {
    f.windows.queue.push({ id: 'one', sessionId: 'friend', title: '好友', content: '收到', timestamp: 1, count: 1 })
    f.send('notice:ready')
    assert.equal(f.deliveries.at(-1)?.notificationStyle, 'wechat')
    assert.equal(f.deliveries.at(-1)?.backdrop.native, false)
    assert.equal(f.captures(), 0)
    f.send('notice:glassRect', { id: 'one', card: { x: 10, y: 10, width: 260, height: 80 }, dpr: 1 })
    assert.equal(f.panels.length, 0)
    f.send('notice:resize', { id: 'one', width: 9999, height: 9999 })
    assert.deepEqual([...f.windows.win.size], [280, 180])
    f.send('notice:resize', { id: 'old', width: 1, height: 1 })
    assert.deepEqual([...f.windows.win.size], [280, 180])
    f.send('notice:resize', { id: 'one', width: 270, height: 96 })
    assert.deepEqual([...f.windows.win.size], [280, 96])
  } finally { f.windows.shutdown() }
})

test('glass uses shared native parameters and switching to WeChat destroys the old panel', () => {
  const f = fixture()
  try {
    f.update({ notificationStyle: 'glass' })
    f.windows.queue.push({ id: 'glass', sessionId: 'friend', title: '好友', content: '消息', timestamp: 1, count: 1 })
    f.send('notice:ready')
    assert.equal(f.deliveries.at(-1)?.backdrop.native, true)
    f.send('notice:glassRect', { id: 'glass', card: { x: 10, y: 10, width: 260, height: 80 }, dpr: 1.5 })
    assert.equal(f.panels[0].options.cornerRadius, glassAppearance.cornerRadius * 1.5)
    assert.equal(f.panels[0].options.displacementScale, glassAppearance.displacementScale)
    assert.equal(f.panels[0].options.saturation, glassAppearance.saturation / 100)
    f.update({ notificationStyle: 'wechat' })
    f.windows.queue.close('glass')
    f.windows.queue.push({ id: 'plain', sessionId: 'friend', title: '好友', content: '消息', timestamp: 1, count: 1 })
    assert.equal(f.panels[0].destroyed, true)
    assert.equal(f.deliveries.at(-1)?.notificationStyle, 'wechat')
    assert.equal(f.deliveries.at(-1)?.backdrop.native, false)
  } finally { f.windows.shutdown() }
})
