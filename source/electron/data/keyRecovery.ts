import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { createNativeGrant } from './nativeGrant'
import { nativeHostExecutable } from './nativeHost'

export function abortError() { return new Error('自动连接已取消') }
export async function recoverKey(dllPath: string, pid: number, dbPath: string, signal: AbortSignal, timeoutMs = 90000, workerPath = join(__dirname, 'keyWorker.cjs')): Promise<string> {
  if (signal.aborted) throw abortError()
  if (!dllPath || !existsSync(dllPath)) throw new Error('缺少 wx_key.dll，请在高级设置中指定密钥获取组件。')
  const grant = await createNativeGrant(Date.now, 'win_dll_db_scan')
  let child: ChildProcess | undefined
  try {
    if (signal.aborted) throw abortError()
    return await new Promise<string>((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1', WEFLOW_XKEY_AUTH_PORT: String(grant.credentials.port), WEFLOW_XKEY_AUTH_TOKEN: grant.credentials.token, WEFLOW_XKEY_AUTH_MODE: 'win_dll_db_scan', WEFLOW_XKEY_AUTH_TS: String(grant.credentials.issuedAtMs) }
      delete env.WEFLOW_KEYFLOW_LOG
      child = spawn(nativeHostExecutable(), [workerPath], { env, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
      let settled = false
      const finish = (error?: Error, key?: string) => {
        if (settled) return
        settled = true; clearTimeout(timer); signal.removeEventListener('abort', cancel)
        error ? reject(error) : resolve(key!)
      }
      const cancel = () => { child?.kill(); finish(abortError()) }
      const timer = setTimeout(() => { child?.kill(); finish(new Error('扫描微信密钥超时，请确认微信已登录后重试。')) }, timeoutMs)
      signal.addEventListener('abort', cancel, { once: true })
      child.on('error', () => finish(new Error('无法启动密钥扫描子进程。')))
      child.on('exit', () => finish(new Error('密钥扫描子进程异常退出。')))
      child.on('message', (message: any) => {
        if (typeof message?.key === 'string' && /^[a-f\d]{64}$/i.test(message.key)) finish(undefined, message.key)
        else finish(new Error(typeof message?.error === 'string' ? message.error.replace(/[a-f\d]{64}/gi, '[已隐藏]').slice(0, 240) : '密钥扫描未返回有效结果。'))
      })
      child.send({ dllPath, pid, dbPath }, error => { if (error) finish(new Error('无法发送密钥扫描任务。')) })
      if (signal.aborted) cancel()
    })
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = new Promise<void>(resolve => child!.once('exit', () => resolve()))
      child.kill()
      await Promise.race([closed, new Promise<void>(resolve => { const timer = setTimeout(resolve, 2000); timer.unref() })])
    }
    await grant.dispose()
  }
}
