import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createConnection, type Socket } from 'node:net'
import { StringDecoder } from 'node:string_decoder'
import { parseNativeJson, normalizeSession, normalizeMessage } from './normalize'
import type { Contact, DbConfig, Message, Session } from '../../shared/types'
import type { NativeGrant } from './nativeGrant'
import { configuredAccountId } from '../../shared/accountIdentity'

const signatures: Record<string, string> = {
  init: 'int32 wcdb_init()', shutdown: 'int32 wcdb_shutdown()',
  policy: 'int32 wcdb_runtime_policy_version()',
  authenticate: 'int32 wcdb_authenticate(const char* token, int32 port, int64 issuedAtMs)',
  open: 'int32 wcdb_open_account(const char* path, const char* key, _Out_ int64* handle)',
  closeAccount: 'int32 wcdb_close_account(int64 handle)',
  free: 'void wcdb_free_string(void* ptr)',
  sessions: 'int32 wcdb_get_sessions(int64 handle, _Out_ void** outJson)',
  cursor: 'int32 wcdb_open_message_cursor(int64 handle, const char* sessionId, int32 batchSize, int32 ascending, int32 beginTimestamp, int32 endTimestamp, _Out_ int64* outCursor)',
  batch: 'int32 wcdb_fetch_message_batch(int64 handle, int64 cursor, _Out_ void** outJson, _Out_ int32* outHasMore)',
  cursorClose: 'int32 wcdb_close_message_cursor(int64 handle, int64 cursor)',
  contact: 'int32 wcdb_get_contact(int64 handle, const char* username, _Out_ void** outJson)',
  names: 'int32 wcdb_get_display_names(int64 handle, const char* usernamesJson, _Out_ void** outJson)',
  avatars: 'int32 wcdb_get_avatar_urls(int64 handle, const char* usernamesJson, _Out_ void** outJson)',
  status: 'int32 wcdb_get_contact_status(int64 handle, const char* usernamesJson, _Out_ void** outJson)',
  self: 'int32 wcdb_set_my_account_id(int64 handle, const char* accountId)',
  monitorStart: 'int32 wcdb_start_monitor_pipe()', monitorStop: 'void wcdb_stop_monitor_pipe()',
  pipeName: 'int32 wcdb_get_monitor_pipe_name(_Out_ void** outName)'
}
export class NativeAdapter {
  private ffi: any; private lib: any; private api: Record<string, any> = {}; private handle: number | bigint = 0;
  private dependencies: any[] = []
  private socket?: Socket; private retry?: NodeJS.Timeout; private closed = true; private initialized = false; private config!: DbConfig;
  constructor(private emit: (event: unknown) => void) {}
  open(config: DbConfig, grant?: NativeGrant) {
    config = { ...config, accountId: configuredAccountId(config.accountDir, config.accountId) }
    if (process.platform !== 'win32') throw new Error('真实数据库接入需要 Windows x64。当前环境可以构建和测试通知。')
    if (!existsSync(config.libraryPath)) throw new Error('找不到 WCDB DLL，请选择实现了 WeFlow 接口的兼容组件。')
    const db = findSessionDb(join(config.accountDir, 'db_storage'))
    if (!db) throw new Error('账号目录中未找到 db_storage 下的 session.db。')
    if (!/^[a-f\d]{64}$/i.test(config.key)) throw new Error('数据库密钥应为 64 位十六进制字符串。')
    if (basename(config.libraryPath).toLowerCase() === 'wcdb.dll') throw new Error('请选择 wcdb_api.dll；WCDB.dll 是依赖库，不提供账号读取接口。')
    this.config = config; this.ffi = require('koffi'); this.api = {}
    try {
      for (const name of ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll', 'msvcp140_1.dll', 'WCDB.dll', 'SDL2.dll']) {
        const dependency = join(dirname(config.libraryPath), name)
        if (existsSync(dependency)) this.dependencies.push(this.ffi.load(dependency))
      }
      this.lib = this.ffi.load(config.libraryPath)
      const bindingErrors: Record<string, string> = {}
      for (const [key, signature] of Object.entries(signatures)) {
        try { this.api[key] = this.lib.func(signature) }
        catch (error) { bindingErrors[key] = error instanceof Error ? error.message : String(error) }
      }
      if (!this.api.self) {
        try { this.api.self = this.lib.func('int32 wcdb_set_my_wxid(int64 handle, const char* wxid)') } catch { /* older component */ }
      }
      const required = ['init', 'shutdown', 'open', 'free', 'sessions', 'cursor', 'batch', 'cursorClose']
      const missing = required.filter(key => !this.api[key])
      if (missing.length) throw new Error(`组件接口绑定失败：${missing.map(key => `${signatures[key]}（${bindingErrors[key]}）`).join('；')}。请选择兼容的 wcdb_api.dll。`)
      if (this.api.policy) this.checkPolicy(this.api.policy())
      if (this.api.authenticate) {
        if (!grant) throw new Error('组件需要本机初始化认证，请使用更新后的 WeNotice 主程序。')
        this.check(this.api.authenticate(grant.token, grant.port, grant.issuedAtMs), '组件认证')
      }
      this.check(this.api.init(), '初始化'); this.initialized = true
      const handle = [0]; this.check(this.api.open(db, config.key, handle), '打开账号数据库')
      if (!handle[0]) throw new Error('组件返回无效账号句柄')
      this.handle = handle[0]; this.closed = false
      this.api.self?.(this.handle, config.accountId)
      const pipe = this.startMonitor()
      return { capabilities: Object.keys(this.api), mode: pipe ? 'pipe' as const : 'poll' as const }
    } catch (error) { this.close(); throw error }
  }
  private checkPolicy(code: number) {
    if (code === 1464206081) return
    if (code === -101) throw new Error('读取组件已到期（-101），请使用随修复版 WeNotice 提供的 wcdb_api.dll。')
    if (code === -105) throw new Error('读取组件的本机状态校验失败（-105），请保留状态文件并检查组件构建是否匹配。')
    if (code < 0) this.check(code, '组件运行策略检查')
    throw new Error(`组件运行策略版本不兼容（${code}）`)
  }
  private check(code: number, operation: string) { if (code !== 0) throw new Error(`${operation}失败（组件状态码 ${code}）`) }
  private decode(ptr: any): any {
    if (!ptr) return null
    try { return parseNativeJson(this.ffi.decode(ptr, 'char', -1)) } finally { this.api.free(ptr) }
  }
  private json(name: string, ...args: any[]): any {
    if (!this.api[name]) return null
    const output = [null]; const code = this.api[name](this.handle, ...args, output)
    if (code !== 0) { if (output[0]) this.api.free(output[0]); this.check(code, name) }
    return this.decode(output[0])
  }
  sessions(): Session[] {
    const rows = this.json('sessions')
    if (!Array.isArray(rows) || rows.some(r => r._error || r._info)) throw new Error('组件返回的会话列表格式不兼容。')
    return rows.map(normalizeSession).filter(s => s.id)
  }
  async messages(sessionId: string, since: number): Promise<Message[]> {
    const cursor = [0]; this.check(this.api.cursor(this.handle, sessionId, 200, 1, since, 0, cursor), '打开消息游标')
    if (!cursor[0]) throw new Error('组件返回无效消息游标')
    const messages: Message[] = []; let empty = 0
    try {
      for (let page = 0; page < 500; page++) {
        const ptr = [null], more = [0]
        const code = this.api.batch(this.handle, cursor[0], ptr, more)
        if (code !== 0) { if (ptr[0]) this.api.free(ptr[0]); this.check(code, '读取消息') }
        const rows = this.decode(ptr[0])
        if (!Array.isArray(rows)) throw new Error('组件返回的消息批次格式不兼容。')
        messages.push(...rows.map(r => normalizeMessage(r, sessionId, this.config.accountId)))
        if (!more[0]) return messages.sort((a, b) => a.timestamp - b.timestamp || a.sortSeq - b.sortSeq || a.id.localeCompare(b.id))
        empty = rows.length ? 0 : empty + 1
        if (empty > 2) throw new Error('消息游标连续返回空批次且未结束。')
        // Give the monitor pipe a turn between native calls.
        await new Promise<void>(resolve => setImmediate(resolve))
      }
      throw new Error('单次增量读取超出 100000 条；未推进处理位置，请缩小补查范围。')
    } finally { this.api.cursorClose(this.handle, cursor[0]) }
  }
  contact(id: string): Contact {
    const contact = this.api.contact ? this.json('contact', id) || {} : {}
    const ids = JSON.stringify([id]); const names = this.api.names ? this.json('names', ids) || {} : {}
    let avatarUrl: string | undefined
    try { avatarUrl = this.json('avatars', ids)?.[id] } catch { /* avatar is optional */ }
    let state: any; try { state = this.json('status', ids)?.[id] } catch { /* report unknown status */ }
    return { name: String(contact.remark || contact.Remark || names[id] || contact.nick_name || contact.nickName || contact.nickname || id), alias: typeof contact.alias === 'string' ? contact.alias : undefined, remark: typeof (contact.remark ?? contact.Remark) === 'string' ? contact.remark ?? contact.Remark : undefined, nickName: typeof (contact.nick_name ?? contact.nickName ?? contact.nickname) === 'string' ? contact.nick_name ?? contact.nickName ?? contact.nickname : undefined, avatarUrl: typeof avatarUrl === 'string' && /^(https?:|data:image\/)/.test(avatarUrl) ? avatarUrl : undefined, muted: Boolean(state?.isMuted), folded: Boolean(state?.isFolded), statusKnown: !!state }
  }
  private startMonitor(): boolean {
    if (!this.api.monitorStart || !this.api.monitorStop || !this.api.pipeName) return false
    try {
      if (this.api.monitorStart() !== 0) return false
      const ptr = [null]; this.check(this.api.pipeName(ptr), '获取监听管道')
      if (!ptr[0]) return false
      let name: string
      try { name = this.ffi.decode(ptr[0], 'char', -1) } finally { this.api.free(ptr[0]) }
      if (!name.startsWith('\\\\.\\pipe\\')) return false
      this.connectPipe(name); return true
    } catch { return false }
  }
  private connectPipe(name: string) {
    if (this.closed) return
    const socket = createConnection(name); this.socket = socket
    const decoder = new StringDecoder('utf8'); let buffer = ''
    socket.on('connect', () => this.emit({ kind: 'pipe', connected: true }))
    socket.on('data', chunk => {
      buffer += decoder.write(chunk).replace(/\0/g, '\n')
      if (buffer.length > 1024 * 1024) { buffer = ''; this.emit({ kind: 'change' }); return }
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || ''
      for (const line of lines) if (line.trim()) { try { this.emit({ kind: 'change', payload: JSON.parse(line) }) } catch { this.emit({ kind: 'change' }) } }
      try { if (buffer.trim()) { const payload = JSON.parse(buffer); buffer = ''; this.emit({ kind: 'change', payload }) } } catch { /* partial JSON */ }
    })
    socket.on('error', () => {})
    socket.on('close', () => { if (this.closed || this.socket !== socket) return; this.emit({ kind: 'pipe', connected: false }); this.retry = setTimeout(() => this.connectPipe(name), 3000) })
  }
  close() {
    this.closed = true; if (this.retry) clearTimeout(this.retry); this.socket?.destroy(); this.socket = undefined
    try {
      if (this.initialized) {
        try { this.api.monitorStop?.() }
        finally { try { if (this.handle) this.api.closeAccount?.(this.handle) } finally { this.api.shutdown?.() } }
      }
    } finally {
      this.initialized = false; this.handle = 0; this.api = {}
      try { this.lib?.unload() } finally {
        this.lib = undefined
        for (const dependency of this.dependencies.reverse()) { try { dependency.unload() } catch { /* continue releasing other libraries */ } }
        this.dependencies = []
      }
    }
  }
}
export function findSessionDb(dir: string, depth = 0): string | null {
  if (depth > 3 || !existsSync(dir)) return null
  const direct = join(dir, 'session.db'); if (existsSync(direct)) return direct
  for (const item of readdirSync(dir)) { const path = join(dir, item); if (statSync(path).isDirectory()) { const found = findSessionDb(path, depth + 1); if (found) return found } }
  return null
}
