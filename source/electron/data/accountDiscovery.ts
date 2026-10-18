import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AccountCandidate } from '../../shared/types'

const exec = promisify(execFile)
export function inferAccountId(directory: string): string {
  return basename(directory).replace(/_[a-z\d]{4}$/i, '')
}
export async function sessionFile(directory: string): Promise<string | null> {
  for (const relative of ['db_storage/session/session.db', 'db_storage/session.db']) {
    const file = join(directory, relative)
    try { if ((await stat(file)).isFile()) return file } catch { /* incomplete account */ }
  }
  return null
}

// Search bounded, known roots only. Junctions are skipped and duplicate paths
// collapse case-insensitively. Finding a directory is not proof of login.
export async function discoverAccounts(roots: string[]): Promise<AccountCandidate[]> {
  const found = new Map<string, AccountCandidate>(), seen = new Set<string>()
  let visited = 0
  async function visit(directory: string, depth: number) {
    const absolute = resolve(directory), identity = absolute.toLowerCase()
    if (seen.has(identity) || visited >= 1200) return
    seen.add(identity); visited++
    const db = await sessionFile(absolute)
    if (db) {
      const info = await stat(db).catch(() => null)
      if (info) found.set(identity, { accountDir: absolute, accountId: inferAccountId(absolute), modifiedAt: info.mtimeMs })
      return
    }
    if (!depth) return
    const entries = await readdir(absolute, { withFileTypes: true }).catch(() => [])
    for (const item of entries) {
      if (item.isDirectory() && !item.isSymbolicLink() && !['node_modules', 'db_storage', 'FileStorage', 'msg', 'cache'].includes(item.name)) await visit(join(absolute, item.name), depth - 1)
    }
  }
  for (const root of roots.filter(Boolean)) {
    let directory = root.replace(/[\\/]+$/, '')
    if (/\.db$/i.test(directory)) directory = dirname(directory)
    if (basename(directory).toLowerCase() === 'session') directory = dirname(directory)
    if (basename(directory).toLowerCase() === 'db_storage') directory = dirname(directory)
    await visit(directory, 2)
  }
  return [...found.values()].sort((a, b) => b.modifiedAt - a.modifiedAt || a.accountDir.localeCompare(b.accountDir))
}

export async function windowsDataRoots(documents: string, home: string, env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const roots = [join(documents, 'xwechat_files'), join(documents, 'WeChat Files'), join(home, 'xwechat_files')]
  if (process.platform !== 'win32') return roots
  // FileSavePath is data, never interpolated into a shell command.
  try {
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; @('HKCU:\\Software\\Tencent\\WeChat','HKCU:\\Software\\Tencent\\Weixin') | ForEach-Object { (Get-ItemProperty -LiteralPath $_ -Name FileSavePath -ErrorAction SilentlyContinue).FileSavePath } | ConvertTo-Json -Compress"], { windowsHide: true, timeout: 5000, encoding: 'utf8' })
    const parsed = stdout.trim() ? JSON.parse(stdout) : []
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      const value = typeof item === 'string' ? item.trim() : ''
      if (value && value !== 'MyDocument:') {
        const expanded = value.replace(/%([^%]+)%/g, (_, name) => env[name] || env[name.toUpperCase()] || `%${name}%`)
        roots.push(expanded, join(expanded, 'xwechat_files'), join(expanded, 'WeChat Files'))
      }
    }
  } catch { /* optional registry setting */ }
  for (const client of ['WeChat', 'Weixin']) {
    try {
      const value = (await readFile(join(env.APPDATA || '', 'Tencent', client, 'All Users', 'config', '3ebffe94.ini'), 'utf8')).replace(/^\uFEFF/, '').trim()
      if (value && !/[\0\r\n]/.test(value) && value !== 'MyDocument:') roots.push(value, join(value, 'xwechat_files'), join(value, 'WeChat Files'))
    } catch { /* optional client configuration */ }
  }
  for (const drive of 'CDEFGHIJKLMNOPQRSTUVWXYZ') roots.push(`${drive}:\\xwechat_files`, `${drive}:\\WeChat Files`)
  return roots
}

export async function wechatProcessIds(): Promise<number[]> {
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $p=@(Get-Process -Name Weixin,WeChat -ErrorAction SilentlyContinue); $w=@($p | Where-Object { $_.MainWindowHandle -ne 0 }); if ($w.Count) { $p=$w }; @($p | Select-Object -ExpandProperty Id) | ConvertTo-Json -Compress"], { windowsHide: true, timeout: 10000, maxBuffer: 65536, encoding: 'utf8' })
  const parsed = stdout.trim() ? JSON.parse(stdout) : []
  return (Array.isArray(parsed) ? parsed : [parsed]).filter((id): id is number => Number.isSafeInteger(id) && id > 0).slice(0, 8)
}
