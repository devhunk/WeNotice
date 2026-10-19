import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Notice } from '../../shared/types'

export interface WechatTarget { sessionId: string }
export interface WechatOpenResult { status: 'opened' | 'app' | 'busy' | 'ambiguous' | 'not-found' | 'error'; scope?: 'window' | 'conversation'; error?: string }
const clean = (value: unknown) => typeof value === 'string' && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : ''
export function runWechatHelper(helperPath: string, target: WechatTarget, options: { timeoutMs?: number; args?: string[] } = {}): Promise<WechatOpenResult> {
  if (!existsSync(helperPath)) return Promise.resolve({ status: 'error', error: '运行包缺少微信会话跳转组件。' })
  return new Promise(resolve => {
    const child = execFile(helperPath, options.args || [], { windowsHide: true, timeout: options.timeoutMs ?? 8000, maxBuffer: 16384, encoding: 'utf8' }, (error, stdout) => {
      if (error?.killed) { resolve({ status: 'error', error: '打开微信会话超时，已停止跳转组件，请在微信中选择会话。' }); return }
      try {
        const result = JSON.parse(stdout.trim())
        if (['opened', 'busy', 'ambiguous', 'not-found', 'error'].includes(result.status)) {
          resolve({ status: result.status, scope: result.scope === 'window' ? 'window' : undefined, error: typeof result.error === 'string' ? result.error.slice(0, 240) : undefined }); return
        }
      } catch { /* no valid helper response */ }
      resolve({ status: 'error', error: error?.killed ? '打开微信会话超时，请确认微信已登录。' : '微信会话跳转组件未返回有效结果。' })
    })
    child.on('error', () => {})
    child.stdin?.on('error', () => {})
    child.stdin?.end(JSON.stringify(target))
  })
}
export class WechatNavigator {
  private busy = false
  constructor(private run: (target: WechatTarget) => Promise<WechatOpenResult>) {}
  async open(notice: Notice): Promise<WechatOpenResult> {
    if (notice.test || notice.sessionId === '__test__') return { status: 'app' }
    if (this.busy) return { status: 'busy' }
    this.busy = true
    try {
      const sessionId = clean(notice.sessionId)
      if (!sessionId) throw new Error('无效会话')
      // Client activation needs no database access, contact search or UIA.
      return await this.run({ sessionId })
    } catch { return { status: 'error', error: '无法打开该微信会话，请确认微信已登录。' } }
    finally { this.busy = false }
  }
}
