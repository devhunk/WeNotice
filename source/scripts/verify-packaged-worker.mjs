import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, Script } from 'node:vm'

const require = createRequire(import.meta.url)
const card = (type, title, extra = '') => `<msg><appmsg><type>${type}</type><title>${title}</title>${extra}</appmsg></msg>`
const fixtures = [
  [card(5, '网页'), '[链接] 网页'],
  [card(33, '小程序'), '[小程序] 小程序'],
  [card(36, '另一小程序'), '[小程序] 另一小程序'],
  [card(6, '资料.pdf'), '[文件] 资料.pdf'],
  [card(5, '文章', '<url>https://mp.weixin.qq.com/s/123</url>'), '[公众号文章] 文章'],
  [card(57, '回复'), '[引用] 回复'],
  [card(999, '新卡片'), '[消息] 新卡片'],
  ['<msg><appmsg>', '[消息]']
]

// Execute the exact bundled worker's IPC path. Only the DLL boundary is fake;
// classification, native JSON parsing, normalization and worker dispatch run as shipped.
export async function verifyWorkerSource(source, filename = 'dbWorker.cjs') {
  const listeners = new Map()
  let reply
  const response = new Promise(resolve => { reply = resolve })
  const workerProcess = {
    connected: true,
    on: (event, callback) => listeners.set(event, callback),
    send: (message, callback) => { reply(message); callback?.(null) },
    exit: code => { throw new Error(`Unexpected worker exit: ${code}`) }
  }
  const context = createContext({
    process: workerProcess, Buffer, TextDecoder, setImmediate,
    require: name => {
      assert.ok(['node:fs', 'node:path', 'node:net', 'node:string_decoder'].includes(name), `Unexpected worker dependency: ${name}`)
      return require(name)
    },
    __rows: fixtures.map(([content], i) => ({ local_id: i + 1, create_time: i + 1, local_type: 49, message_content: content, is_send: 0 }))
  })
  new Script(source, { filename }).runInContext(context, { timeout: 5000 })
  // Esbuild preserves the worker's top-level adapter identifier. A changed
  // bundling contract must update this harness explicitly rather than skip checks.
  new Script(`
    adapter.config = { accountId: 'self' };
    adapter.ffi = { decode: pointer => pointer };
    adapter.api = {
      cursor: (...args) => { args[6][0] = 1; return 0 },
      batch: (_handle, _cursor, pointer, more) => { pointer[0] = JSON.stringify(__rows); more[0] = 0; return 0 },
      free: () => {}, cursorClose: () => 0
    };
  `).runInContext(context, { timeout: 5000 })
  assert.equal(typeof listeners.get('message'), 'function', 'Worker IPC handler is missing')
  listeners.get('message')({ id: 1, method: 'messages', args: ['friend', 0] })
  let timer
  const result = await Promise.race([
    response,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Packaged worker IPC timed out')), 5000) })
  ]).finally(() => clearTimeout(timer))
  assert.equal(result.id, 1)
  assert.equal(result.error, undefined, `Worker IPC failed: ${result.error}`)
  assert.equal(result.result?.length, fixtures.length)
  fixtures.forEach(([, expected], index) => {
    assert.equal(result.result[index].content, expected, `${filename}: classification case ${index + 1}`)
    assert.equal(result.result[index].sessionId, 'friend')
  })
  return fixtures.length
}

async function artifactReader(target) {
  if (!target.toLowerCase().endsWith('.asar')) return relative => readFile(resolve(target, relative), 'utf8')
  const bytes = await readFile(target)
  const tree = JSON.parse(bytes.subarray(16, 16 + bytes.readUInt32LE(12)).toString('utf8'))
  const base = 8 + bytes.readUInt32LE(4)
  return async relative => {
    let entry = tree
    for (const name of relative.split('/')) entry = entry?.files?.[name]
    assert.ok(entry && !entry.files && !entry.link, `Missing regular ASAR file: ${relative}`)
    if (entry.unpacked) return readFile(resolve(`${target}.unpacked`, relative), 'utf8')
    const start = base + Number(entry.offset)
    assert.ok(start >= base && start + entry.size <= bytes.length, `Invalid ASAR range: ${relative}`)
    return bytes.subarray(start, start + entry.size).toString('utf8')
  }
}

export async function verifyPackagedWorker(target) {
  target = resolve(target)
  const read = await artifactReader(target)
  const manifest = JSON.parse(await read('package.json'))
  assert.equal(manifest.main, 'dist-electron/main.cjs', 'Unexpected packaged application entry point')
  const main = await read(manifest.main)
  assert.match(main, /join\)\(__dirname, ["']dbWorker\.cjs["']\)/, 'Main entry must launch its adjacent packaged dbWorker')
  new Script(main, { filename: manifest.main })
  const count = await verifyWorkerSource(await read('dist-electron/dbWorker.cjs'), `${target}/dist-electron/dbWorker.cjs`)
  console.log(`Verified packaged entry point and ${count} message classifications through worker IPC: ${target}`)
  return count
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyPackagedWorker(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..'))
}
