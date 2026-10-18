import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Contact, Notice } from '../../shared/types'

export interface WechatTarget { sessionId: string; names: string[]; queries: string[] }
export interface WechatOpenResult { status: 'opened' | 'app' | 'busy' | 'ambiguous' | 'not-found' | 'error'; error?: string }
const clean = (value: unknown) => typeof value === 'string' && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : ''
const unique = (values: unknown[]) => [...new Set(values.map(clean).filter(Boolean))]
export function buildWechatTarget(sessionId: string, contact: Partial<Contact> | null, displayName: string): WechatTarget {
  const id = clean(sessionId)
  if (!id || id === '__test__') throw new Error('无效的微信会话。')
  const names = unique([contact?.remark, contact?.name, contact?.nickName, displayName, contact?.alias]).filter(name => name !== id)
  if (id === 'filehelper') names.unshift('文件传输助手')
  const searchableId = !id.startsWith('wxid_') && !id.includes('@') ? id : ''
  const queries = unique([contact?.alias, searchableId, ...names])
  if (!queries.length) throw new Error('无法取得该会话的联系人或群名称。')
  return { sessionId: id, names: unique([...names, searchableId]), queries }
}
export function runWechatHelper(helperPath: string, target: WechatTarget): Promise<WechatOpenResult> {
  if (!existsSync(helperPath)) return Promise.resolve({ status: 'error', error: '运行包缺少微信会话跳转组件。' })
  return new Promise(resolve => {
    const child = execFile(helperPath, [], { windowsHide: true, timeout: 20000, maxBuffer: 16384, encoding: 'utf8' }, (error, stdout) => {
      try {
        const result = JSON.parse(stdout.trim())
        if (['opened', 'ambiguous', 'not-found', 'error'].includes(result.status)) {
          resolve({ status: result.status, error: typeof result.error === 'string' ? result.error.slice(0, 240) : undefined }); return
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
  constructor(private getContact: (id: string) => Promise<Contact>, private run: (target: WechatTarget) => Promise<WechatOpenResult>) {}
  async open(notice: Notice): Promise<WechatOpenResult> {
    if (notice.test || notice.sessionId === '__test__') return { status: 'app' }
    if (this.busy) return { status: 'busy' }
    this.busy = true
    try {
      const contact = await this.getContact(notice.sessionId).catch(() => null)
      return await this.run(buildWechatTarget(notice.sessionId, contact, notice.title))
    } catch { return { status: 'error', error: '无法打开该微信会话，请确认微信已登录。' } }
    finally { this.busy = false }
  }
}
