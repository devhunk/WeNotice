// Launched with ELECTRON_RUN_AS_NODE in a separate process. Never logs key data.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

process.on('disconnect', () => process.exit(0))
let started = false
process.on('message', (request: { dllPath: string; pid: number; dbPath: string }) => {
  if (started) return
  started = true
  let library: any
  const dependencies: any[] = []
  let buffer: Buffer | undefined
  let result: { key?: string; error?: string }
  try {
    const ffi = require('koffi')
    for (const name of ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll']) {
      const file = join(dirname(request.dllPath), name)
      if (existsSync(file)) dependencies.push(ffi.load(file))
    }
    library = ffi.load(request.dllPath)
    const recover = library.func('bool RecoverDbKey(uint32 targetPid, const char* dbPath, _Out_ char *keyBuffer, int bufferSize)')
    buffer = Buffer.alloc(128)
    const ok = recover(request.pid, request.dbPath, buffer, buffer.length)
    const key = buffer.toString('utf8').split('\0')[0].trim()
    if (!ok || !/^[a-f\d]{64}$/i.test(key)) {
      // Native errors can contain arbitrary diagnostic data; keep raw errors in
      // this process and expose only a bounded category to the application.
      let native = ''
      try { native = String(library.func('const char* GetLastErrorMsg()')() || '') } catch {}
      result = { error: /auth_host_mismatch/i.test(native) ? '密钥组件不支持当前宿主，请保留完整运行包及随包的 electron.exe 后重试。' : /denied|拒绝|权限|打开目标进程失败/i.test(native) ? '权限不足，无法读取微信进程；请以与微信匹配的权限启动 WeNotice。' : '当前微信进程未找到可验证的密钥，请完成登录后重试，或检查组件与微信版本是否兼容。' }
    } else result = { key: key.toLowerCase() }
  } catch { result = { error: '密钥组件加载或接口调用失败，请检查 wx_key.dll 及其运行库。' } }
  finally {
    buffer?.fill(0)
    try { library?.unload() } catch {}
    for (const dependency of dependencies.reverse()) { try { dependency.unload() } catch {} }
  }
  process.send?.(result, () => process.exit(0))
})
