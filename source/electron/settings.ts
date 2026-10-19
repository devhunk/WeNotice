import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { defaults, type Settings, type DbConfig } from '../shared/types'
import { configuredAccountId } from '../shared/accountIdentity'
import { notificationStyle } from '../shared/notificationAppearance'
const positions = ['top-right', 'bottom-right', 'top-left', 'bottom-left', 'top-center']
export function validateSettings(input: unknown): Settings {
  if (!input || typeof input !== 'object') throw new Error('设置格式错误')
  const raw = input as Settings
  for (const key of ['accountDir', 'accountId', 'libraryPath', 'keyLibraryPath'] as const) if (typeof raw[key] !== 'string' || raw[key].length > 4096) throw new Error('账号或组件路径格式错误')
  if (!positions.includes(raw.position) || !['all', 'whitelist', 'blacklist'].includes(raw.filterMode)) throw new Error('通知设置无效')
  if (!Array.isArray(raw.filterIds) || raw.filterIds.length > 2000 || raw.filterIds.some(id => typeof id !== 'string' || id.length > 256)) throw new Error('会话名单格式错误')
  if (![raw.enabled, raw.launchAtLogin, raw.respectMuted, raw.glass].every(v => typeof v === 'boolean')) throw new Error('开关设置格式错误')
  if (!Number.isFinite(raw.durationMs) || raw.durationMs < 2000 || raw.durationMs > 30000) throw new Error('显示时长必须在 2–30 秒之间')
  if (!Number.isFinite(raw.pollSeconds) || raw.pollSeconds < 2 || raw.pollSeconds > 60) throw new Error('补查间隔必须在 2–60 秒之间')
  return { accountDir: raw.accountDir.trim(), accountId: configuredAccountId(raw.accountDir.trim(), raw.accountId.trim()), libraryPath: raw.libraryPath.trim(), keyLibraryPath: raw.keyLibraryPath.trim(), enabled: raw.enabled, launchAtLogin: raw.launchAtLogin, respectMuted: raw.respectMuted, glass: raw.glass, notificationStyle: notificationStyle(raw.notificationStyle), position: raw.position, filterMode: raw.filterMode, filterIds: [...new Set(raw.filterIds.map(x => x.trim()).filter(Boolean))], durationMs: Math.round(raw.durationMs), pollSeconds: Math.round(raw.pollSeconds) }
}
export class SettingsStore {
  settings = { ...defaults }; private encryptedKey = ''; private path: string
  constructor() {
    const directory = app.getPath('userData'); mkdirSync(directory, { recursive: true }); this.path = join(directory, 'settings.json')
    if (existsSync(this.path)) { try { const saved = JSON.parse(readFileSync(this.path, 'utf8')); this.settings = validateSettings({ ...defaults, ...saved.settings, notificationStyle: notificationStyle(saved.settings?.notificationStyle) }); this.encryptedKey = typeof saved.encryptedKey === 'string' ? saved.encryptedKey : '' } catch { /* show fresh settings instead of failing app launch */ } }
    const bundled = join(app.isPackaged ? process.resourcesPath : app.getAppPath() + '/resources', 'wcdb', 'win32', 'x64', 'wcdb_api.dll')
    const previous = this.settings.libraryPath.replace(/\\/g, '/').toLowerCase()
    // Upgrade the known 0.1.0 WeFlow path; retain deliberately selected custom providers.
    if (existsSync(bundled) && (!previous || !existsSync(this.settings.libraryPath) || previous.includes('/weflow/resources/resources/wcdb/'))) this.settings.libraryPath = bundled
    const bundledKey = join(app.isPackaged ? process.resourcesPath : app.getAppPath() + '/resources', 'key', 'win32', 'x64', 'wx_key.dll')
    if (existsSync(bundledKey) && (!this.settings.keyLibraryPath || !existsSync(this.settings.keyLibraryPath))) this.settings.keyLibraryPath = bundledKey
  }
  get hasKey() { return Boolean(this.encryptedKey) }
  save(input: unknown, key?: string) {
    const settings = validateSettings(input); let encryptedKey = this.encryptedKey
    if (key !== undefined && key !== '') {
      if (typeof key !== 'string' || !/^[a-f\d]{64}$/i.test(key.trim())) throw new Error('密钥必须是 64 位十六进制字符串')
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统密钥存储不可用，密钥未保存。')
      encryptedKey = safeStorage.encryptString(key.trim()).toString('base64')
    }
    const temporary = this.path + '.tmp'
    writeFileSync(temporary, JSON.stringify({ settings, encryptedKey }, null, 2), { mode: 0o600 }); renameSync(temporary, this.path)
    this.settings = settings; this.encryptedKey = encryptedKey
  }
  connection(): DbConfig {
    if (!this.encryptedKey || !safeStorage.isEncryptionAvailable()) throw new Error('请先配置数据库密钥。')
    let key: string
    try { key = safeStorage.decryptString(Buffer.from(this.encryptedKey, 'base64')) } catch { throw new Error('密钥无法在当前 Windows 用户下解密，请重新填写。') }
    const { accountDir, accountId, libraryPath } = this.settings
    if (!accountDir || !accountId || !libraryPath) throw new Error('请先配置账号目录、账号 ID 和 WCDB DLL。')
    return { accountDir, accountId: configuredAccountId(accountDir, accountId), libraryPath, key }
  }
}
