// Invoke with ELECTRON_RUN_AS_NODE=1 using the packaged executable.
// Only report metadata; do not save settings, keys or chat content.
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { wechatProcessIds, sessionFile } from '../electron/data/accountDiscovery'
import { recoverKey } from '../electron/data/keyRecovery'
import { DataClient } from '../electron/data/client'

async function main() {
const resources = resolve(process.argv[2])
const output = resolve(process.argv[3])
const probe = new DataClient(() => {}, join(resources, 'app.asar/dist-electron/dbWorker.cjs'))
const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 200000)
const report: Record<string, any> = { timestamp: new Date().toISOString(), savedSettings: false, displayedMessages: false, attempts: [] }
try {
  const settings = JSON.parse(await readFile(join(process.env.APPDATA!, 'WeNotice/settings.json'), 'utf8')).settings
  const dbPath = await sessionFile(settings.accountDir)
  if (!dbPath) throw new Error('No session.db in configured account')
  const pids = await wechatProcessIds()
  report.processesDetected = pids.length
  for (const pid of pids) {
    try {
      const key = await recoverKey(join(resources, 'key/win32/x64/wx_key.dll'), pid, dbPath, controller.signal, 30000, join(resources, 'app.asar/dist-electron/keyWorker.cjs'))
      report.nativeKeyRecovered = true
      const config = { accountDir: settings.accountDir, accountId: settings.accountId, key, libraryPath: join(resources, 'wcdb/win32/x64/wcdb_api.dll') }
      const result = await probe.open(config)
      report.databaseOpened = true; report.sessionsRead = (await probe.sessions()).length; report.monitorMode = result.mode
      await probe.close()
      await probe.open(config)
      report.reopenSessionsRead = (await probe.sessions()).length
      report.success = true
      break
    } catch (error) { report.attempts.push({ pid, error: String(error).replace(/[a-f\d]{64}/gi, '[redacted]') }) }
    finally { await probe.close() }
    if (controller.signal.aborted) break
  }
  if (!report.success) report.success = false
} catch (error) { report.success = false; report.error = String(error).replace(/[a-f\d]{64}/gi, '[redacted]') }
finally {
  clearTimeout(timer); await probe.close()
  await writeFile(output, JSON.stringify(report, null, 2))
  process.exit(report.success ? 0 : 1)
}
}
void main()
