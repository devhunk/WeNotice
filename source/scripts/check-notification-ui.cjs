if (!process.versions.electron) {
  const { mkdtempSync, rmSync } = require('node:fs')
  const { tmpdir } = require('node:os')
  const { join } = require('node:path')
  const temporary = mkdtempSync(join(tmpdir(), 'wenotice-ui-'))
  const child = require('node:child_process').spawn(require('electron'), [__filename, '--qa-profile=' + temporary], { stdio: 'inherit', windowsHide: true })
  child.on('error', error => { console.error(error); rmSync(temporary, { recursive: true, force: true }); process.exitCode = 1 })
  child.on('exit', code => { rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); process.exitCode = code ?? 1 })
} else {
// Deterministic renderer smoke test. No account access or desktop capture.
const { app, BrowserWindow, ipcMain, screen } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const assert = require('node:assert/strict')
const { buildSync } = require('esbuild')
const root = resolve(__dirname, '..')
const output = resolve(root, '../archive/pr1-ui-check')
const temporary = process.argv.find(arg => arg.startsWith('--qa-profile=')).slice('--qa-profile='.length)
app.setPath('userData', join(temporary, 'profile'))
app.disableHardwareAcceleration()
const exportsFile = join(temporary, 'shared.cjs')
buildSync({ stdin: { contents: "export { defaults } from './shared/types'; export { presentation } from './shared/notificationPolicy'; export { notificationLayout, notificationMetrics } from './shared/notificationLayout'", resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: exportsFile })
const { defaults, presentation, notificationLayout, notificationMetrics } = require(exportsFile)
const results = [], errors = []
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const geometry = `(() => {
  const root = document.querySelector('.notification-toast-container');
  const card = root.querySelector('.notification-surface');
  const body = root.querySelector('.notification-body');
  const title = root.querySelector('.notification-title');
  const close = root.querySelector('.notification-close');
  const rect = node => { const r = node.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom }; };
  return { root:rect(root),card:rect(card),body:rect(body),title:rect(title),close:rect(close),bodyScrollHeight:body.scrollHeight,
    background:getComputedStyle(card).backgroundColor,titleColor:getComputedStyle(title).color,
    radius:getComputedStyle(card).borderRadius,content:body.textContent,
    overflow:document.documentElement.scrollWidth > window.innerWidth };
})()`
async function screenshot(win, name) {
  await pause(220)
  writeFileSync(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
}
function create(options) {
  const win = new BrowserWindow({ show: false, frame: false, useContentSize: true, ...options, webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, ...options.webPreferences } })
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  win.webContents.on('render-process-gone', (_event, details) => errors.push('renderer: ' + details.reason))
  return win
}
async function toast(name, content, style = 'wechat', options = {}) {
  const notice = { id: name, sessionId: 'fixture', title: options.title || '文件传输助手', content, timestamp: 1781682600, count: options.count || 1 }
  const layout = notificationLayout(notice, 'top-right', options.availableWidth || 1920, options.availableHeight || 1080)
  const win = create({ width: layout.width, height: 320, transparent: true, webPreferences: { preload: join(root, 'dist-electron/notificationPreload.cjs') } })
  let resizeCount = 0, clickCount = 0, closeCount = 0
  const ready = event => { if (event.sender === win.webContents) event.sender.send('notice:show', { ...presentation({ ...defaults, notificationStyle: style }), notice, layout, notificationStyle: style, position: 'top-right', durationMs: 30000, backdrop: { native: false, width: 1920, height: 1080, winX: 0, winY: 0 } }) }
  const resized = (event, data) => { if (event.sender === win.webContents) { resizeCount++; win.setContentSize(Math.ceil(data.width), Math.ceil(data.height)) } }
  const clicked = event => { if (event.sender === win.webContents) clickCount++ }
  const closed = event => { if (event.sender === win.webContents) closeCount++ }
  ipcMain.on('notice:ready', ready); ipcMain.on('notice:resize', resized); ipcMain.on('notice:click', clicked); ipcMain.on('notice:close', closed)
  try {
    await win.loadFile(join(root, 'dist/index.html'), { hash: '/notification' })
    await pause(450)
    const data = await win.webContents.executeJavaScript(geometry)
    assert.ok(resizeCount > 0 && resizeCount < 8, 'resize must converge')
    assert.ok(data.root.width <= layout.maxWidth && data.root.height <= layout.maxHeight)
    assert.ok(data.card.bottom <= data.root.height + 1, 'card should fit window')
    assert.ok(!data.overflow, 'no horizontal window overflow')
    assert.ok(data.close.right <= data.card.right + 1, 'close button should fit')
    if (style === 'wechat') { assert.match(data.background, /(?:255, 255, 255|srgb 1 1 1)/); assert.equal(data.radius, defaults.appearance.radius + 'px'); assert.equal(data.titleColor, 'rgba(0, 0, 0, 0.9)') } else assert.equal(data.radius, '14px')
    await screenshot(win, name)
    await win.webContents.executeJavaScript("document.querySelector('.notification-close').click()")
    await pause(340)
    assert.equal(closeCount, 1); assert.equal(clickCount, 0)
    results.push({ name, ...data, resizeCount })
    return data
  } finally {
    ipcMain.removeListener('notice:ready', ready); ipcMain.removeListener('notice:resize', resized); ipcMain.removeListener('notice:click', clicked); ipcMain.removeListener('notice:close', closed)
    win.destroy()
  }
}
async function settings() {
  const preload = join(temporary, 'settings-preload.cjs')
  writeFileSync(preload, `const { contextBridge } = require('electron'); let value = ${JSON.stringify({ settings: defaults, hasKey: false, status: { phase: 'idle', detail: '测试预览' }, history: [] })}; contextBridge.exposeInMainWorld('weNotice', { state: async () => value, save: async settings => (value = {...value, settings}), onState: () => () => {}, onAutoProgress: () => () => {}, displays: async () => [], test: async () => {} });`)
  const win = create({ width: 1040, height: 900, webPreferences: { preload } })
  try {
    await win.loadFile(join(root, 'dist/index.html'), { hash: '/settings' })
    await win.webContents.executeJavaScript("[...document.querySelectorAll('nav button')].find(x=>x.textContent==='通知外观').click()")
    await pause(100)
    const select = async (label, value) => {
      await win.webContents.executeJavaScript(`(() => { const select = document.querySelector('select[aria-label="${label}"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(value)}); select.dispatchEvent(new Event('change',{bubbles:true})); })()`)
      await pause(150)
    }
    await screenshot(win, 'settings-wechat')
    const wechat = await win.webContents.executeJavaScript(geometry)
    await select('预览消息', 'long')
    await screenshot(win, 'settings-wechat-long')
    await select('通知样式', 'glass')
    await screenshot(win, 'settings-glass')
    const glassRadius = await win.webContents.executeJavaScript("getComputedStyle(document.querySelector('.notification-surface')).borderRadius")
    assert.equal(glassRadius, defaults.appearance.radius + 'px')
    await win.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(x=>x.textContent==='保存设置').click()")
    await pause(100)
    assert.equal(await win.webContents.executeJavaScript("window.weNotice.state().then(x=>x.settings.notificationStyle)"), 'glass')
    await select('通知样式', 'wechat')
    await win.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(x=>x.textContent==='保存设置').click()")
    await pause(100)
    assert.equal(await win.webContents.executeJavaScript("window.weNotice.state().then(x=>x.settings.notificationStyle)"), 'wechat')
    win.setContentSize(850, 790)
    await screenshot(win, 'settings-wechat-850')
    assert.equal(await win.webContents.executeJavaScript('document.documentElement.scrollWidth > innerWidth'), false)
    results.push({ name: 'settings', wechat, glassRadius, saveRoundtrip: true })
  } finally { win.destroy() }
}
async function positioning() {
  const moduleFile = join(temporary, 'notification-window.cjs')
  require('node:fs').copyFileSync(join(root, 'dist-electron/notificationPreload.cjs'), join(temporary, 'notificationPreload.cjs'))
  await require('esbuild').build({ entryPoints: [join(root, 'electron/windows/notificationWindow.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: moduleFile, external: ['electron', '@hicccc77/electron-liquid-glass'], plugins: [{ name: 'resolve-koffi', setup(build) { build.onResolve({ filter: /^koffi$/ }, () => ({ path: require.resolve('koffi'), external: true })) } }] })
  const { NotificationWindows } = require(moduleFile)
  let currentSettings = { ...defaults, notificationStyle: 'wechat' }
  const windows = new NotificationWindows(() => currentSettings, route => require('node:url').pathToFileURL(join(root, 'dist/index.html')).href + '#' + route, () => {}, () => false)
  try {
    for (const position of ['top-right', 'bottom-right', 'top-left', 'bottom-left', 'top-center', 'bottom-center']) {
      currentSettings = { ...currentSettings, position }
      for (const [kind, content] of [['long', '较长通知内容'.repeat(35)], ['short', '收到']]) {
        const id = `position-${position}-${kind}`
        windows.queue.push({ id, sessionId: 'fixture', title: '位置测试', content, timestamp: 1781682600, count: 1 })
        await pause(500)
        const win = windows.win, bounds = win.getBounds(), area = screen.getPrimaryDisplay().workArea
        const data = await win.webContents.executeJavaScript(geometry)
        const edges = { left: bounds.x + data.card.x - area.x, right: area.x + area.width - bounds.x - data.card.right, top: bounds.y + data.card.y - area.y, bottom: area.y + area.height - bounds.y - data.card.bottom }
        assert.equal(bounds.width, Math.ceil(data.root.width), 'native window must shrink to the rendered toast width')
        // Fractional custom line heights may round twice through physical pixels on Windows at 150% DPI.
        assert.ok(Math.abs(bounds.height - Math.ceil(data.root.height)) <= 1, 'native window must shrink to within one DIP of the rendered toast height')
        assert.equal(win.isResizable(), false, 'toast must remain non-resizable after measurement')
        const margin = notificationMetrics.margin + notificationMetrics.gutter
        assert.ok(Math.abs(edges[position.startsWith('bottom') ? 'bottom' : 'top'] - margin) <= 2, 'vertical card margin must stay constant')
        if (position.endsWith('center')) assert.ok(Math.abs(edges.left - edges.right) <= 1, 'short and long toasts must stay centered')
        else assert.ok(Math.abs(edges[position.endsWith('left') ? 'left' : 'right'] - margin) <= 2, 'horizontal card margin must stay constant')
        console.log(JSON.stringify({ id, bounds, card: data.card, edges }))
        results.push({ name: id, bounds, card: data.card, edges })
        windows.queue.close(id)
      }
    }
  } finally { windows.shutdown() }
}
app.whenReady().then(async () => {
  mkdirSync(output, { recursive: true })
  try {
    const short = await toast('wechat-short', '好的，收到。')
    const medium = await toast('wechat-medium', '文件已收到，记得查看最新的项目资料。')
    const long = await toast('wechat-long', '明天下午三点开会，请带好项目资料。[微笑]\n地点：三楼会议室\n议程：设计方案确认、开发进度同步、下周任务安排。\n如有其他需要讨论的问题，请提前发到群里。', 'wechat', { count: 8 })
    assert.ok(short.root.width < medium.root.width && medium.root.width < long.root.width)
    assert.ok(short.root.height < long.root.height)
    await toast('wechat-overflow', '这是一条超长消息[微笑]'.repeat(100), 'wechat', { title: '产品与研发协作设计讨论群', count: 123 })
    await toast('wechat-small-screen', 'https://example.com/' + 'long-path-'.repeat(80), 'wechat', { title: '长标题测试会话名称', count: 99, availableWidth: 320, availableHeight: 200 })
    await toast('glass-fallback', '玻璃不可用时自动回退普通材质。', 'glass')
    await settings()
    await positioning()
    assert.deepEqual(errors, [])
    writeFileSync(join(output, 'results.json'), JSON.stringify({ results, errors }, null, 2))
    console.log(JSON.stringify({ checks: results.length, output, errors }))
  } catch (error) { console.error(error); process.exitCode = 1 }
  finally { app.exit(process.exitCode || 0) }
})
app.on('window-all-closed', () => {})

}
