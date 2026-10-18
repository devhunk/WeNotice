import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import electron from 'electron'
import { build } from 'esbuild'
import { cp } from 'node:fs/promises'
await cp('node_modules/wechat-emojis/assets', 'public/assets', { recursive: true })
await build({ entryPoints: { main: 'electron/main.ts', settingsPreload: 'electron/settingsPreload.ts', notificationPreload: 'electron/notificationPreload.ts', dbWorker: 'electron/data/dbWorker.ts', keyWorker: 'electron/data/keyWorker.ts' }, bundle: true, platform: 'node', target: 'node22', format: 'cjs', outdir: 'dist-electron', outExtension: { '.js': '.cjs' }, external: ['electron', 'koffi', '@hicccc77/electron-liquid-glass'] })
const server = await createServer(); await server.listen()
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, WENOTICE_DEV_URL: 'http://127.0.0.1:5173' } })
child.on('exit', async code => { await server.close(); process.exit(code ?? 0) })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill())
