import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { SettingsStore, validateSettings } from './settings'
import { discoverAccounts, windowsDataRoots, wechatProcessIds, sessionFile } from './data/accountDiscovery'
import { recoverKey, abortError } from './data/keyRecovery'
import { prepareAutoConnection } from './data/autoConnection'
import { DataClient } from './data/client'
import { MessageMonitor } from './core/monitor'
import { NotificationWindows } from './windows/notificationWindow'
import { WechatNavigator, runWechatHelper } from './core/wechatNavigation'
import type { AutoProgress, DbConfig, Notice, PublicState, Status } from '../shared/types'

app.setName('WeNotice')
const single = app.requestSingleInstanceLock()
if (!single) app.quit()
let settingsWindow: BrowserWindow | null = null, tray: Tray | null = null
let store: SettingsStore, windows: NotificationWindows, db: DataClient, monitor: MessageMonitor | null = null
let wechat: WechatNavigator
let status: Status = { phase: 'idle', detail: '配置账号后开始监听' }, history: Notice[] = []
let quitting = false, epoch = 0, reconnectTimer: NodeJS.Timeout | undefined, recoveryDelay = 3000
let operations = Promise.resolve()
let autoController: AbortController | undefined, autoProgress: AutoProgress | null = null
const serialized = <T>(work: () => Promise<T>): Promise<T> => { const next = operations.then(work, work); operations = next.then(() => {}, () => {}); return next }
const url = (route: string) => `${process.env.WENOTICE_DEV_URL || pathToFileURL(join(__dirname, '../dist/index.html')).href}#${route}`
const state = (): PublicState => ({ settings: store.settings, hasKey: store.hasKey, status, history, autoProgress })
function progress(value: AutoProgress | null) {
  autoProgress = value
  if (value) status = { phase: 'connecting', detail: value.detail }
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('app:autoProgress', value)
  publish()
}
const requireNoAutoConnect = () => { if (autoController) throw new Error('自动连接正在进行，请先取消或等待完成。') }
function publish() { if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('app:stateChanged', state()); updateTray() }
function updateTray() {
  if (!tray) return
  tray.setToolTip(`WeNotice · ${status.detail.slice(0, 80)}`)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 WeNotice', click: showSettings },
    { label: status.phase === 'listening' ? '暂停监听' : '开始监听', enabled: !autoController, click: () => { if (!autoController) void serialized(status.phase === 'listening' ? pause : start) } },
    { label: '测试通知', click: testNotice }, { type: 'separator' }, { label: '退出', click: () => app.quit() }
  ]))
}
function showSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return }
  const win = new BrowserWindow({ title: 'WeNotice', width: 1040, height: 790, minWidth: 850, minHeight: 640, backgroundColor: '#f7f8fa', autoHideMenuBar: true, webPreferences: { preload: join(__dirname, 'settingsPreload.cjs'), contextIsolation: true, nodeIntegration: false } })
  settingsWindow = win; win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); win.webContents.on('will-navigate', event => event.preventDefault())
  win.on('closed', () => { if (settingsWindow === win) settingsWindow = null })
  void win.loadURL(url('/settings'))
}
async function pause() {
  epoch++; clearTimeout(reconnectTimer); reconnectTimer = undefined; monitor?.stop(); monitor = null; windows.queue.clear()
  await db.close(); status = { phase: 'paused', detail: '监听已暂停' }; publish()
}
function notify(notice: Notice) { history = [notice, ...history].slice(0, 100); windows.queue.push(notice); publish() }
function testNotice() { notify({ id: randomUUID(), sessionId: '__test__', title: 'WeNotice', content: '通知已准备好。收到微信新消息时，将在这里提醒你。', timestamp: Math.floor(Date.now() / 1000), count: 1, test: true }) }
async function openNoticeConversation(notice: Notice) {
  const result = await wechat.open(notice)
  if (result.status === 'app') { showSettings(); return }
  if (result.status === 'opened' || result.status === 'busy') return
  await dialog.showMessageBox({ type: 'info', title: '打开微信会话', message: result.error || '未能确认目标会话，请在微信搜索结果中选择。' })
}
function errorStatus(error: unknown) { status = { ...status, phase: 'error', detail: error instanceof Error ? error.message : '连接失败' }; publish() }
function scheduleReconnect(error: Error) {
  if (!monitor || quitting) return
  errorStatus(error); if (reconnectTimer) return
  const captured = epoch
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined
    void serialized(async () => {
      if (captured !== epoch || !monitor || quitting) return
      try {
        const result = await db.open(store.connection())
        if (captured !== epoch) return
        status = { phase: 'listening', detail: '已重新连接，正在补查新消息', ...result }; recoveryDelay = 3000; publish(); monitor.request()
      } catch (error) { recoveryDelay = Math.min(30000, recoveryDelay * 2); scheduleReconnect(error instanceof Error ? error : new Error('重连失败')) }
    })
  }, recoveryDelay)
}
async function start(signal?: AbortSignal) {
  await pause(); const captured = epoch
  const cancel = () => { monitor?.stop(); void db.close() }
  signal?.addEventListener('abort', cancel, { once: true })
  status = { phase: 'connecting', detail: '正在检查组件并建立消息基准…' }; publish()
  try {
    if (signal?.aborted) throw abortError()
    if (!store.settings.enabled) throw new Error('请先在通知设置中开启通知。')
    const result = await db.open(store.connection())
    if (signal?.aborted) throw abortError()
    if (store.settings.respectMuted && !result.capabilities.includes('status')) throw new Error('组件缺少免打扰状态接口。请更换组件，或关闭“遵循微信免打扰”。')
    monitor = new MessageMonitor(db, () => store.settings, notify, scheduleReconnect, () => {
      if (status.phase === 'listening') { status = { ...status, checkedAt: Date.now() }; publish() }
    })
    await monitor.start(); if (signal?.aborted) throw abortError(); if (captured !== epoch) return
    status = { phase: 'listening', detail: result.mode === 'pipe' ? '消息监听已启动，定时补查已开启' : '组件无实时管道，正在定时检查新消息', ...result, checkedAt: Date.now() }; recoveryDelay = 3000; publish()
  } catch (error) { monitor?.stop(); monitor = null; await db.close(); errorStatus(error) }
  finally { signal?.removeEventListener('abort', cancel) }
}
app.on('second-instance', () => { if (store) showSettings() })
app.whenReady().then(async () => {
  if (!single) return
  app.setAppUserModelId('app.wenotice.desktop'); store = new SettingsStore()
  windows = new NotificationWindows(() => store.settings, url, notice => { void openNoticeConversation(notice).catch(() => {}) })
  db = new DataClient(event => {
    if (event.kind === 'change') monitor?.request()
    if (event.kind === 'error') scheduleReconnect(new Error(event.detail))
    if (event.kind === 'pipe' && status.phase === 'listening') { status = { ...status, detail: event.connected ? '实时管道已连接，定时补查已开启' : '实时管道重连中，定时补查继续运行' }; publish() }
  })
  const launcher = join(app.isPackaged ? process.resourcesPath : app.getAppPath() + '/resources', 'launcher', 'WeNotice.OpenWechat.exe')
  wechat = new WechatNavigator(id => db.contact(id), target => runWechatHelper(launcher, target))
  // Generate a small RGBA tray icon locally; no external artwork dependency.
  const pixels = Buffer.alloc(32 * 32 * 4)
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const at = (y * 32 + x) * 4; const dot = (x - 16) ** 2 + (y - 16) ** 2 < 210; pixels[at] = 31; pixels[at + 1] = 118; pixels[at + 2] = 86; pixels[at + 3] = dot ? 255 : 0; if (dot && ((x >= 13 && x <= 18 && y >= 8 && y <= 20) || ((x - 15) ** 2 + (y - 24) ** 2 < 4))) pixels.fill(255, at, at + 3) }
  tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 32, height: 32 })); tray.on('double-click', showSettings); updateTray()
  const guard = (event: Electron.IpcMainInvokeEvent) => { if (!settingsWindow || event.sender !== settingsWindow.webContents || event.senderFrame !== settingsWindow.webContents.mainFrame) throw new Error('不允许的窗口请求') }
  ipcMain.handle('app:state', event => { guard(event); return state() })
  ipcMain.handle('app:save', (event, settings, key) => {
    guard(event); requireNoAutoConnect(); return serialized(async () => {
      const restart = status.phase === 'listening'; store.save(settings, key)
      app.setLoginItemSettings({ openAtLogin: store.settings.launchAtLogin, args: ['--background'] })
      await pause(); if (restart && store.settings.enabled) await start(); publish(); return state()
    })
  })
  ipcMain.handle('app:choose', async (event, kind) => {
    guard(event); if (kind !== 'directory' && kind !== 'library') throw new Error('选择类型错误')
    const result = await dialog.showOpenDialog(settingsWindow!, kind === 'directory' ? { properties: ['openDirectory'] } : { properties: ['openFile'], filters: [{ name: '兼容组件', extensions: ['dll'] }] }); return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('app:detectAccounts', async (event, directory) => {
    guard(event)
    if (directory !== undefined && (typeof directory !== 'string' || directory.length > 4096)) throw new Error('账号目录无效')
    return discoverAccounts([directory || '', store.settings.accountDir, ...await windowsDataRoots(app.getPath('documents'), app.getPath('home'))])
  })
  ipcMain.handle('app:cancelAutoConnect', event => { guard(event); autoController?.abort() })
  ipcMain.handle('app:autoConnect', (event, input) => {
    guard(event); requireNoAutoConnect()
    const settings = validateSettings(input), controller = new AbortController()
    autoController = controller
    return serialized(async () => {
      try {
        await pause()
        const signal = controller.signal
        let cached: DbConfig | undefined
        try { cached = store.connection() } catch { /* first setup */ }
        const config = await prepareAutoConnection(settings, cached, {
          sessionFile, processIds: wechatProcessIds,
          recover: (pid, file, signal, timeoutMs) => recoverKey(settings.keyLibraryPath, pid, file, signal, timeoutMs),
          verify: async (config, signal) => {
            const probe = new DataClient(() => {})
            const cancel = () => { void probe.close() }
            signal.addEventListener('abort', cancel, { once: true })
            try {
              if (signal.aborted) throw abortError()
              const result = await probe.open(config)
              if (settings.respectMuted && !result.capabilities.includes('status')) throw new Error('读取组件缺少免打扰状态接口。')
              await probe.sessions()
              if (signal.aborted) throw abortError()
            } finally { signal.removeEventListener('abort', cancel); await probe.close() }
          }
        }, signal, progress)
        if (signal.aborted) throw abortError()
        progress({ phase: 'saving', detail: '验证成功，正在加密保存并启动监听…' })
        store.save(settings, config.key)
        app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, args: ['--background'] })
        await start(signal)
        if (signal.aborted) { await pause(); throw abortError() }
        if (status.phase !== 'listening') throw new Error(status.detail)
        return state()
      } catch (error) {
        if (controller.signal.aborted) { await pause(); status = { phase: 'paused', detail: '自动连接已取消' } }
        else errorStatus(error)
        throw new Error(controller.signal.aborted ? '自动连接已取消' : error instanceof Error ? error.message.replace(/[a-f\d]{64}/gi, '[已隐藏]') : '自动连接失败')
      } finally { autoController = undefined; progress(null) }
    }).then(() => state())
  })
  ipcMain.handle('app:start', event => { guard(event); requireNoAutoConnect(); return serialized(start) })
  ipcMain.handle('app:pause', event => { guard(event); requireNoAutoConnect(); return serialized(pause) })
  ipcMain.handle('app:test', event => { guard(event); testNotice() })
  if (!process.argv.includes('--background') || !store.hasKey) showSettings()
  if (store.hasKey && store.settings.enabled) await serialized(start)
})
app.on('window-all-closed', () => { /* Tray owns lifetime, including notification idle destruction. */ })
app.on('before-quit', event => {
  if (quitting) return
  event.preventDefault(); quitting = true; autoController?.abort(); epoch++; clearTimeout(reconnectTimer); monitor?.stop(); windows?.shutdown(); tray?.destroy(); tray = null
  const force = setTimeout(() => app.exit(0), 3000)
  void db?.close().finally(() => { clearTimeout(force); app.exit(0) })
})
