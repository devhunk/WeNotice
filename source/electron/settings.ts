import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaults, type Settings, type DbConfig } from '../shared/types'
import { configuredAccountId } from '../shared/accountIdentity'
import { validateSettings } from '../shared/preferences'
export { validateSettings } from '../shared/preferences'
export class SettingsStore {
  settings = structuredClone(defaults); loadWarning = ''; private encryptedKey = ''; private path: string
  constructor() {
    const directory = app.getPath('userData'); mkdirSync(directory, { recursive: true }); this.path = join(directory, 'settings.json')
    if (existsSync(this.path)) {
      try {
        const saved = JSON.parse(readFileSync(this.path, 'utf8'))
        if (saved.settings?.schemaVersion !== 2 && !existsSync(this.path + '.pre-0.2.0.bak')) copyFileSync(this.path, this.path + '.pre-0.2.0.bak')
        this.encryptedKey = typeof saved.encryptedKey === 'string' ? saved.encryptedKey : ''
        this.settings = validateSettings(saved.settings)
      } catch {
        const backup = this.path + '.invalid.bak'
        if (!existsSync(backup)) copyFileSync(this.path, backup)
        this.loadWarning = '本地设置无法读取，原文件已备份。请检查并重新配置连接。'
      }
    }
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
    this.settings = settings; this.encryptedKey = encryptedKey; this.loadWarning = ''
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
