import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

// The bundled components accept the stock Electron host, but reject a renamed
// application executable (AUTH_FAILED:auth_host_mismatch). Keep that supported
// runtime alongside the app; all component authentication remains in place.
export function nativeHostExecutable(): string {
  const stock = join(dirname(process.execPath), 'electron.exe')
  if (existsSync(stock)) return stock
  if (basename(process.execPath).toLowerCase() === 'wenotice.exe') throw new Error('运行包缺少组件宿主 electron.exe，请保留完整运行包后重试。')
  return process.execPath
}
