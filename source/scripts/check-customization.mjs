import { build } from 'esbuild'
import { mkdir, rm, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
const packageDirectory = args.find(arg => !arg.startsWith('--'))
const output = resolve(args.find(arg => arg.startsWith('--output='))?.slice(9) || '../releases/WeNotice-0.2.0-customization/verification')
const temporary = resolve('dist-electron/customization-check')
const appRoot = packageDirectory ? resolve(packageDirectory, 'resources/app.asar') : resolve('.')
await mkdir(temporary, { recursive: true }); await mkdir(output, { recursive: true })
await build({ entryPoints: { main: 'tests/electronCustomizationCheck.ts', preload: 'tests/customizationPreload.ts' }, bundle: true, platform: 'node', target: 'node22', format: 'cjs', outdir: temporary, outExtension: { '.js': '.cjs' }, external: ['electron', 'koffi', '@hicccc77/electron-liquid-glass'] })
if (packageDirectory) {
  const { extractFile } = require('@electron/asar')
  const preload = extractFile(appRoot, 'dist-electron/notificationPreload.cjs')
  assert.deepEqual(preload, await readFile('dist-electron/notificationPreload.cjs'), 'Packaged preload differs from the build')
  assert.deepEqual(extractFile(appRoot, 'dist-electron/main.cjs'), await readFile('dist-electron/main.cjs'), 'Packaged main differs from the build')
  await writeFile(resolve(temporary, 'notificationPreload.cjs'), preload)
} else await copyFile('dist-electron/notificationPreload.cjs', resolve(temporary, 'notificationPreload.cjs'))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
try {
  const code = await new Promise((resolveCode, reject) => { const child = spawn(require('electron'), [resolve(temporary, 'main.cjs'), output, appRoot], { env, windowsHide: true, stdio: 'inherit' }); child.on('error', reject); child.on('exit', resolveCode) })
  if (code !== 0) throw new Error(`Customization verification failed (${code})`)
} finally { await rm(temporary, { recursive: true, force: true }) }
