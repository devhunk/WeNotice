// Read-only live check: no settings save, no chat text or key in the report.
// Bundle into dist-electron before invoking with the Electron executable.
import { app } from 'electron'
import { join, resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { SettingsStore } from '../electron/settings'
import { discoverAccounts, sessionFile, windowsDataRoots, wechatProcessIds } from '../electron/data/accountDiscovery'
import { recoverKey } from '../electron/data/keyRecovery'
import { prepareAutoConnection } from '../electron/data/autoConnection'
import { DataClient } from '../electron/data/client'

app.setName('WeNotice')
app.whenReady().then(async () => {
  const report: Record<string, unknown> = { timestamp: new Date().toISOString(), savedSettings: false, displayedMessages: false }
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 200000)
  const probe = new DataClient(() => {})
  const cancel = () => { void probe.close() }
  controller.signal.addEventListener('abort', cancel)
  try {
    const store = new SettingsStore(), root = resolve(__dirname, '..'), packaged = process.argv[2] ? resolve(process.argv[2]) : undefined
    const resources = packaged ? join(packaged, 'resources') : join(root, 'resources')
    const candidates = await discoverAccounts([store.settings.accountDir, ...await windowsDataRoots(app.getPath('documents'), app.getPath('home'))])
    report.accountsDetected = candidates.length
    const selected = candidates.find(value => value.accountDir.toLowerCase() === store.settings.accountDir.toLowerCase()) || (candidates.length === 1 ? candidates[0] : undefined)
    if (!selected) throw new Error(candidates.length ? '检测到多个账号，需要在界面选择账号后验收。' : '没有检测到微信数据库。')
    const settings = { ...store.settings, ...selected, enabled: true, libraryPath: join(resources, 'wcdb/win32/x64/wcdb_api.dll'), keyLibraryPath: join(resources, 'key/win32/x64/wx_key.dll') }
    report.packagedWorker = Boolean(packaged)
    report.keyComponentSha256 = createHash('sha256').update(readFileSync(settings.keyLibraryPath)).digest('hex')
    await prepareAutoConnection(settings, undefined, {
      sessionFile,
      processIds: async () => { const pids = await wechatProcessIds(); report.processesDetected = pids.length; return pids },
      recover: async (pid, file, signal, timeoutMs) => { const key = await recoverKey(settings.keyLibraryPath, pid, file, signal, timeoutMs, packaged ? join(resources, 'app.asar/dist-electron/keyWorker.cjs') : undefined); report.nativeKeyRecovered = true; return key },
      verify: async config => {
        const opened = await probe.open(config)
        const sessions = await probe.sessions()
        report.databaseOpened = true; report.sessionsRead = sessions.length; report.monitorMode = opened.mode
      }
    }, controller.signal, progress => { report.lastPhase = progress.phase; process.stdout.write(progress.detail + '\n') })
    report.success = true
  } catch (error) { report.success = false; report.error = error instanceof Error ? error.message.replace(/[a-f\d]{64}/gi, '[已隐藏]') : '实机检查失败' }
  finally {
    clearTimeout(timeout); controller.signal.removeEventListener('abort', cancel); await probe.close()
    const output = resolve(__dirname, '../docs/auto-connect-live.json'); await mkdir(resolve(__dirname, '../docs'), { recursive: true })
    await writeFile(output, JSON.stringify(report, null, 2)); process.stdout.write(JSON.stringify(report, null, 2) + '\n'); app.exit(report.success ? 0 : 1)
  }
})
