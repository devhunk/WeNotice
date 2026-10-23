// Read-only native check. Outputs counts only; never writes credentials, IDs,
// message contents or application settings. Run with stock Electron.
import { app, safeStorage } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { DataClient } from '../electron/data/client'
import { configuredAccountId } from '../shared/accountIdentity'
import { sessionKind } from '../shared/sessionPolicy'

const root = resolve(process.argv[2]), output = resolve(process.argv[3])
const profile = join(dirname(output), 'live-probe-profile')
mkdirSync(profile, { recursive: true }); app.setPath('userData', profile)
app.whenReady().then(async () => {
  const settingsPath = join(app.getPath('appData'), 'WeNotice', 'settings.json')
  const packaged = existsSync(join(root, 'resources/app.asar'))
  const worker = packaged ? join(root, 'resources/app.asar/dist-electron/dbWorker.cjs') : join(root, 'dist-electron/dbWorker.cjs')
  const probe = new DataClient(() => {}, worker)
  const report: Record<string, unknown> = { realDatabase: true, settingsWritten: false, realIncomingAndReadTested: false }
  let stage = 'read-settings'
  try {
    const original = await readFile(settingsPath), saved = JSON.parse(original.toString('utf8')), settings = saved.settings
    const key = safeStorage.decryptString(Buffer.from(saved.encryptedKey, 'base64'))
    stage = 'open-database'
    const opened = await probe.open({ accountDir: settings.accountDir, accountId: configuredAccountId(settings.accountDir, settings.accountId), key, libraryPath: join(root, 'resources/wcdb/win32/x64/wcdb_api.dll') })
    report.mode = opened.mode
    stage = 'read-sessions'
    const sessions = await probe.sessions()
    report.sessionCount = sessions.length
    report.knownReadStates = sessions.filter(item => item.unread !== null).length
    report.readSessions = sessions.filter(item => item.unread === 0).length
    report.unreadSessions = sessions.filter(item => item.unread !== null && item.unread > 0).length
    report.officialSessions = sessions.filter(item => sessionKind(item.id) === 'official').length
    stage = 'read-conversation-directory'
    const started = Date.now(), options = await probe.conversations()
    report.directoryMilliseconds = Date.now() - started
    report.directoryCount = options.length
    report.namedConversations = options.filter(item => item.name !== item.id || item.remark).length
    report.aggregateOptions = options.filter(item => item.kind === 'aggregate').length
    stage = 'verify-settings-unchanged'
    report.settingsUnchanged = createHash('sha256').update(original).digest('hex') === createHash('sha256').update(await readFile(settingsPath)).digest('hex')
    report.success = report.settingsUnchanged && report.aggregateOptions === 0 && sessions.length > 0 && report.knownReadStates === sessions.length
  } catch { report.success = false; report.failedStage = stage }
  finally {
    await probe.close()
    await writeFile(output, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report)); app.exit(report.success ? 0 : 1)
  }
})
