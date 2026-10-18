import { build, Platform, Arch } from 'electron-builder'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const output = resolve(process.argv[2] || '../releases')
await build({
  targets: Platform.WINDOWS.createTarget('dir', Arch.x64),
  config: {
    directories: { output },
    win: { signAndEditExecutable: false },
    npmRebuild: false
  }
})

// Check content, not only whether the entry path exists. Editing an input after
// the packager stats it can otherwise produce an archive with shifted offsets.
const archive = resolve(output, 'win-unpacked/resources/app.asar')
const bytes = await readFile(archive)
const tree = JSON.parse(bytes.subarray(16, 16 + bytes.readUInt32LE(12)).toString('utf8'))
const base = 8 + bytes.readUInt32LE(4)
let verified = 0, end = 0
async function verify(node, prefix = '') {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const path = prefix ? `${prefix}/${name}` : name
    if (entry.files) { await verify(entry, path); continue }
    if (entry.link || !entry.integrity) continue
    let content
    if (entry.unpacked) content = await readFile(resolve(`${archive}.unpacked`, path))
    else {
      const offset = Number(entry.offset)
      content = bytes.subarray(base + offset, base + offset + entry.size)
      end = Math.max(end, offset + entry.size)
    }
    if (content.length !== entry.size || createHash('sha256').update(content).digest('hex') !== entry.integrity.hash) throw new Error(`Invalid ASAR content: ${path}`)
    verified++
  }
}
await verify(tree)
if (base + end !== bytes.length) throw new Error('ASAR payload length does not match its index')
console.log(`Verified ${verified} ASAR file hashes and payload length.`)
