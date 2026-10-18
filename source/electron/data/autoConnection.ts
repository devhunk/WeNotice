import type { AutoProgress, DbConfig, Settings } from '../../shared/types'
import { abortError } from './keyRecovery'

export interface AutoDependencies {
  sessionFile(directory: string): Promise<string | null>;
  processIds(): Promise<number[]>;
  recover(pid: number, dbPath: string, signal: AbortSignal, timeoutMs: number): Promise<string>;
  verify(config: DbConfig, signal: AbortSignal): Promise<void>;
}
export async function prepareAutoConnection(settings: Settings, cached: DbConfig | undefined, deps: AutoDependencies, signal: AbortSignal, progress: (value: AutoProgress) => void): Promise<DbConfig> {
  const check = () => { if (signal.aborted) throw abortError() }
  check()
  if (!settings.enabled) throw new Error('请先开启新消息通知。')
  if (!settings.accountDir || !settings.accountId) throw new Error('请先检测并选择微信账号。')
  const dbPath = await deps.sessionFile(settings.accountDir)
  check()
  if (!dbPath) throw new Error('所选账号中没有找到 session.db，请确认微信已登录并生成数据库。')
  const base = { accountDir: settings.accountDir, accountId: settings.accountId, libraryPath: settings.libraryPath }
  if (cached && cached.accountDir.toLowerCase() === base.accountDir.toLowerCase() && cached.accountId === base.accountId) {
    progress({ phase: 'verifying', detail: '正在验证已保存的数据库密钥…' })
    try { await deps.verify({ ...base, key: cached.key }, signal); check(); return { ...base, key: cached.key } }
    catch { check() /* stale key: reacquire, without replacing the saved key yet */ }
  }
  progress({ phase: 'scanning', detail: '正在查找已登录的微信进程…' })
  const pids = await deps.processIds()
  check()
  if (!pids.length) throw new Error('未找到微信进程，请先启动并登录微信。')
  const deadline = Date.now() + 180000
  let lastError = new Error('没有找到可验证的数据库密钥。')
  for (const pid of pids) {
    check()
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw new Error('自动获取密钥超时，请完成微信登录后重试。')
    progress({ phase: 'scanning', detail: `正在从微信进程 ${pid} 获取密钥，可随时取消…` })
    try {
      const key = await deps.recover(pid, dbPath, signal, Math.min(90000, remaining))
      check()
      if (!/^[a-f\d]{64}$/i.test(key)) throw new Error('组件返回的密钥格式无效。')
      const config = { ...base, key }
      progress({ phase: 'verifying', detail: '正在实际打开数据库并验证会话读取…' })
      await deps.verify(config, signal); check()
      return config
    } catch (error) { check(); lastError = error instanceof Error ? error : lastError }
  }
  throw lastError
}
