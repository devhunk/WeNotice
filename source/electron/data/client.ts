import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import type { DbConfig, Contact, ConversationOption, Message, Session } from '../../shared/types'
import { createNativeGrant } from './nativeGrant'
import { nativeHostExecutable } from './nativeHost'
export class DataClient {
  private worker?: ChildProcess; private sequence = 0
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>()
  constructor(private onEvent: (event: any) => void, private workerPath = join(__dirname, 'dbWorker.cjs'), private timeoutMs = 30000) {}
  async open(config: DbConfig): Promise<{ capabilities: string[]; mode: 'pipe' | 'poll' }> {
    await this.close()
    // Use the component's supported host and isolate native state/crashes from
    // the application. A reconnect always starts a fresh native process.
    const worker = spawn(nativeHostExecutable(), [this.workerPath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    })
    this.worker = worker
    worker.on('message', message => {
      if (this.worker !== worker) return
      if (!message || typeof message !== 'object') return
      const response = message as any
      if (response.event) { this.onEvent(response.event); return }
      const item = this.pending.get(response.id); if (!item) return
      clearTimeout(item.timer); this.pending.delete(response.id)
      response.error ? item.reject(new Error(response.error)) : item.resolve(response.result)
    })
    worker.on('error', () => this.fail(worker, '数据库子进程异常，正在等待重连。'))
    worker.on('exit', () => this.fail(worker, '数据库子进程已退出。'))
    let grant: Awaited<ReturnType<typeof createNativeGrant>> | undefined
    try {
      grant = await createNativeGrant()
      return await this.call('open', config, grant.credentials)
    } catch (error) { await this.close(); throw error }
    finally { await grant?.dispose() }
  }
  private fail(worker: ChildProcess, detail: string) {
    if (this.worker !== worker) return
    this.worker = undefined
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error(detail)) }
    this.pending.clear(); worker.kill(); this.onEvent({ kind: 'error', detail })
  }
  call<T>(method: string, ...args: unknown[]): Promise<T> {
    const worker = this.worker; if (!worker) return Promise.reject(new Error('数据库未连接'))
    return new Promise((resolve, reject) => {
      const id = ++this.sequence
      const timer = setTimeout(() => this.fail(worker, '数据库操作超时，连接已重置。'), this.timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        worker.send({ id, method, args }, error => {
          if (error) this.fail(worker, '数据库子进程通信已断开。')
        })
      } catch { this.fail(worker, '数据库子进程通信已断开。') }
    })
  }
  sessions() { return this.call<Session[]>('sessions') }
  conversations() { return this.call<ConversationOption[]>('conversations') }
  messages(id: string, since: number) { return this.call<Message[]>('messages', id, since) }
  contact(id: string) { return this.call<Contact>('contact', id) }
  async close() {
    const worker = this.worker; if (!worker) return
    // Stop accepting responses after an intentional shutdown; no restart event.
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('连接已停止')) }
    this.pending.clear()
    try { await Promise.race([this.call('close'), new Promise(resolve => setTimeout(resolve, 1500))]) } catch {}
    if (this.worker === worker) this.worker = undefined
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('连接已停止')) }
    this.pending.clear()
    if (worker.exitCode !== null || worker.signalCode !== null) return
    await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timer); worker.off('exit', done); resolve() }
      const timer = setTimeout(() => { worker.kill(); done() }, 2000)
      worker.once('exit', done)
      worker.kill()
    })
  }
}
