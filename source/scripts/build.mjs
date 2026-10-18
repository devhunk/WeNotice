import { build } from 'esbuild'
import { build as viteBuild } from 'vite'
import { mkdir, cp } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
if (process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/build-wechat-launcher.ps1'], { windowsHide: true, stdio: 'inherit' })
await cp('node_modules/wechat-emojis/assets', 'public/assets', { recursive: true })
await mkdir('dist-electron', { recursive: true })
await build({ entryPoints: { main: 'electron/main.ts', settingsPreload: 'electron/settingsPreload.ts', notificationPreload: 'electron/notificationPreload.ts', dbWorker: 'electron/data/dbWorker.ts', keyWorker: 'electron/data/keyWorker.ts' }, bundle: true, platform: 'node', target: 'node22', format: 'cjs', outdir: 'dist-electron', outExtension: { '.js': '.cjs' }, external: ['electron', 'koffi', '@hicccc77/electron-liquid-glass'], sourcemap: true })
await viteBuild()
