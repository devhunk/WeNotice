// Isolated Electron integration check. Uses synthetic data and a temporary userData;
// never opens the user's database, reads their settings, or activates WeChat.
import { app, BrowserWindow, ipcMain, nativeTheme, screen } from 'electron'
import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { defaults, type Notice, type PublicState } from '../shared/types'
import { validateSettings } from '../shared/preferences'
import { SettingsStore } from '../electron/settings'
import { NotificationWindows } from '../electron/windows/notificationWindow'
import { createForegroundProbe } from '../electron/core/wechatForeground'

const output = resolve(process.argv[2]), root = resolve(process.argv[3] || resolve(__dirname, '../..')), temporary = join(__dirname, 'userData')
app.setPath('userData', temporary)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
const wait = (ms = 140) => new Promise(resolveWait => setTimeout(resolveWait, ms))
let config = structuredClone(defaults), saved = 0, clicks = 0, foreground = false
const errors: string[] = [], checks: string[] = []
const fixture: PublicState = { settings: config, hasKey: true, status: { phase: 'listening', detail: '已连接本机微信，正在接收新消息', checkedAt: Date.now() }, history: [
  { id: 'one', sessionId: 'design@chatroom', title: '项目协作群 · 产品与设计', content: '明天下午一起过一下新版界面，资料已整理好。', timestamp: Date.now() / 1000, count: 3 },
  { id: 'two', sessionId: 'filehelper', title: '文件传输助手', content: '[文件] 项目资料.pdf', timestamp: Date.now() / 1000 - 120, count: 1 },
  { id: 'three', sessionId: 'friend', title: '陈同学', content: '周三的会议时间已经确认。', timestamp: Date.now() / 1000 - 260, count: 1 } ] }
const url = (route: string) => pathToFileURL(join(root, 'dist/index.html')).href + '#' + route
let windows: NotificationWindows | undefined
app.whenReady().then(async () => {
  await mkdir(output, { recursive: true }); await mkdir(temporary, { recursive: true })
  const legacy = { ...config } as any
  for (const key of ['schemaVersion', 'appearance', 'behavior', 'ui', 'rules', 'quietHours']) delete legacy[key]
  await writeFile(join(temporary, 'settings.json'), JSON.stringify({ settings: legacy, encryptedKey: 'synthetic-encrypted-fixture' }))
  const store = new SettingsStore(); store.save({ ...store.settings, appearance: { ...store.settings.appearance, avatarSize: 55 } })
  const persisted = await readFile(join(temporary, 'settings.json'), 'utf8')
  assert.throws(() => store.save({ ...store.settings, durationMs: 0 })); assert.equal(await readFile(join(temporary, 'settings.json'), 'utf8'), persisted)
  assert.equal(JSON.parse(await readFile(join(temporary, 'settings.json'), 'utf8')).encryptedKey, 'synthetic-encrypted-fixture')
  assert.equal(JSON.parse(await readFile(join(temporary, 'settings.json.pre-0.2.0.bak'), 'utf8')).settings.schemaVersion, undefined)
  checks.push('disk migration backup and encrypted-key preservation')
  ipcMain.handle('check:state', () => ({ ...fixture, settings: config }))
  ipcMain.handle('check:save', (_, value) => { config = validateSettings(value); saved++; return { ...fixture, settings: config } })
  ipcMain.handle('check:displays', () => screen.getAllDisplays().map(d => ({ id: String(d.id), label: d.label || '测试屏幕' })))
  ipcMain.handle('check:test', () => {})
  const win = new BrowserWindow({ width: 1120, height: 800, show: false, skipTaskbar: true, webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  await win.loadURL(url('/settings')); win.showInactive(); await wait(500)
  const js = (code: string) => win.webContents.executeJavaScript(code)
  const click = async (label: string) => { await js(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === ${JSON.stringify(label)} || x.textContent.trim() === ${JSON.stringify(label)}); if (!b) throw Error('Missing button: ' + ${JSON.stringify(label)}); b.click() })()`); await wait() }
  const input = async (label: string, value: string) => { await js(`(() => { const e = document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']'); if (!e) throw Error('Missing control'); const setter = Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set; setter.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) })()`); await wait() }
  const shot = async (name: string) => { await wait(160); await writeFile(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()) }
  const noOverflow = async () => { assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true) }
  await noOverflow(); await shot('overview-light')
  await input('主界面主题', 'dark'); assert.equal(await js('document.documentElement.dataset.theme'), 'dark'); await shot('overview-dark')
  await input('主界面主题', 'system'); nativeTheme.themeSource = 'light'; await wait(); assert.equal(await js('document.documentElement.dataset.theme'), 'light')
  nativeTheme.themeSource = 'dark'; await wait(500); assert.equal(await js('document.documentElement.dataset.theme'), 'dark'); checks.push('light, dark and live system theme switching')
  await input('主界面主题', 'light'); await click('微信连接'); await shot('connection-light')
  await click('通知外观'); await input('头像大小', '56'); assert.equal(await js("getComputedStyle(document.querySelector('.preview-notice .notice-avatar')).width"), '56px')
  await input('通知主题', 'dark'); await shot('appearance-light'); await click('保存设置'); assert.equal(config.appearance.avatarSize, 56); assert.equal(config.appearance.theme, 'dark'); checks.push('preview style and validated save')
  await click('通知行为'); await shot('behavior-light'); assert.equal(await js("document.querySelector('[aria-label=\"微信在前台时隐藏通知\"]').checked"), true)
  await click('通知规则'); await click('添加规则'); await js("document.querySelector('.rule-editor input').value"); await shot('rules-light'); await click('复制 新规则'); assert.equal(await js("document.querySelectorAll('.rule-list-row').length"), 2); await click('撤销更改'); assert.equal(await js("document.querySelectorAll('.rule-list-row').length"), 0); checks.push('rules add, copy and discard')
  await click('折叠导航'); assert.equal(await js("document.querySelector('.app-shell').classList.contains('sidebar-collapsed')"), true); await click('展开导航'); checks.push('sidebar collapse and expansion')
  win.setSize(850, 640); await click('通知外观'); await noOverflow(); await shot('appearance-850x640')
  await input('主界面主题', 'dark'); await click('通知规则'); await noOverflow(); await shot('rules-dark-850x640'); checks.push('850x640 responsive layout without horizontal overflow')

  const notice = (id: string, test = false): Notice => ({ id, sessionId: 'friend', title: '通知集成测试', content: '真实 Electron 窗口中的合成测试消息。', timestamp: Date.now() / 1000, count: 1, test })
  config = structuredClone(defaults); config.glass = false; config.appearance.theme = 'light'
  windows = new NotificationWindows(() => config, route => url(route), () => { clicks++ }, () => foreground)
  const activeId = () => windows!.queue.active?.id
  const actual = () => BrowserWindow.getAllWindows().find(w => w !== win && w.webContents.getURL().includes('/notification'))!
  foreground = true; windows.enqueue(notice('suppressed')); assert.equal(windows.queue.active, null)
  foreground = false; windows.enqueue(notice('active')); await wait(600); assert.equal(activeId(), 'active'); assert.equal(actual().isVisible(), true)
  assert.equal(await actual().webContents.executeJavaScript("Boolean(document.querySelector('#notification-current'))"), true)
  await writeFile(join(output, 'desktop-notification.png'), (await actual().webContents.capturePage()).toPNG())
  windows.enqueue(notice('pending')); foreground = true; await wait(350); assert.equal(windows.queue.active, null); assert.equal(actual().isVisible(), false)
  foreground = false; await wait(350); assert.equal(windows.queue.active, null); checks.push('foreground suppression before enqueue, active close, queue purge and no replay')
  foreground = true; windows.enqueue(notice('manual', true)); await wait(350); assert.equal(activeId(), 'manual'); assert.equal(actual().isVisible(), true); windows.queue.clear(); foreground = false; checks.push('manual test bypasses foreground suppression')
  config.behavior.hideWhenWechatForeground = false; foreground = true; windows.enqueue(notice('switch-off')); await wait(350); assert.equal(activeId(), 'switch-off'); windows.queue.clear(); foreground = false
  config.behavior.pauseOnHover = true; config.behavior.clickAction = 'close'; config.durationMs = 2000
  windows.enqueue(notice('hover')); await wait(350)
  await actual().webContents.executeJavaScript("document.querySelector('#notification-current').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))")
  await wait(2200); assert.equal(activeId(), 'hover')
  await actual().webContents.executeJavaScript("document.querySelector('#notification-current').dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))")
  await wait(2300); assert.equal(windows.queue.active, null); checks.push('hover pauses dismissal and resumes remaining lifetime')
  config.appearance.widthMode = 'fixed'; config.appearance.width = 800; config.appearance.bodySize = 28; config.appearance.titleSize = 28; config.appearance.maxLines = 20; config.appearance.avatarSize = 80; config.position = 'bottom-center'; config.durationMs = 30000
  windows.enqueue({ ...notice('large'), content: '很长的消息内容'.repeat(250) }); await wait(350)
  const area = screen.getPrimaryDisplay().workArea, bounds = actual().getBounds(); assert.ok(bounds.width <= area.width && bounds.height <= area.height); assert.ok(bounds.x >= area.x && bounds.y >= area.y)
  await writeFile(join(output, 'desktop-notification-large.png'), (await actual().webContents.capturePage()).toPNG()); checks.push('large fonts and long content constrained to work area')
  await actual().webContents.executeJavaScript("document.querySelector('.notification-surface').click()"); await wait(400); assert.equal(windows.queue.active, null); assert.equal(clicks, 0); checks.push('click-to-close does not open chat')
  config.appearance.width = 240; config.appearance.padding = 32; config.appearance.showAvatar = true
  windows.enqueue({ ...notice('narrow'), count: 123, title: '特别长的联系人名称'.repeat(10) }); await wait(350)
  assert.equal(await actual().webContents.executeJavaScript('document.documentElement.scrollWidth <= innerWidth'), true); windows.queue.clear(); checks.push('minimum card width with maximum avatar, padding and font size')
  const probe = createForegroundProbe(); assert.equal(probe.supported, true); assert.equal(typeof probe.processPath(), 'string'); assert.equal(typeof probe.read(), 'boolean'); checks.push('real Win32 foreground process queried successfully; foreground cases use injected state')
  assert.deepEqual(errors, [])
  await writeFile(join(output, 'checks.json'), JSON.stringify({ version: '0.2.0', success: true, checks, saved, rendererErrors: errors, syntheticData: true, packagedRenderer: root.endsWith('app.asar'), displayScaleFactors: screen.getAllDisplays().map(d => d.scaleFactor), realWechatIncomingTested: false }, null, 2))
  console.log(JSON.stringify({ success: true, checks: checks.length, screenshots: output }))
  windows.shutdown(); win.destroy(); app.exit(0)
}).catch(async error => { console.error(error); await writeFile(join(output, 'checks.json'), JSON.stringify({ success: false, error: String(error), checks, rendererErrors: errors }, null, 2)); windows?.shutdown(); app.exit(1) })
