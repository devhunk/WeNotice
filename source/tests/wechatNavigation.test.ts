import test from 'node:test'
import assert from 'node:assert/strict'
import { runWechatHelper, WechatNavigator, type WechatTarget, type WechatOpenResult } from '../electron/core/wechatNavigation'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import type { Notice } from '../shared/types'
const notice: Notice = { id: 'n1', sessionId: 'wxid_friend', title: '朋友', content: 'hello', timestamp: 1, count: 1 }

test('protocol activation accepts IDs without looking up contacts or sending message text', async () => {
  const calls: WechatTarget[] = []
  const navigator = new WechatNavigator(async target => { calls.push(target); return { status: 'opened', scope: 'window' } })
  for (const sessionId of ['wxid_friend', '123@chatroom', 'filehelper']) {
    assert.equal((await navigator.open({ ...notice, sessionId, title: '' })).scope, 'window')
  }
  assert.deepEqual(calls, [{ sessionId: 'wxid_friend' }, { sessionId: '123@chatroom' }, { sessionId: 'filehelper' }])
  assert.equal((await navigator.open({ ...notice, sessionId: 'bad\nvalue' })).status, 'error')
})

test('a failed activation releases navigation for the next click', async () => {
  let first = true
  const navigator = new WechatNavigator(async () => { if (first) { first = false; throw new Error('failed') }; return { status: 'opened', scope: 'window' } })
  assert.equal((await navigator.open(notice)).status, 'error')
  assert.equal((await navigator.open(notice)).status, 'opened')
})

test('a hung helper is terminated even after printing success; another launch can still complete', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wenotice-navigation-'))
  const fixture = join(directory, 'helper.cjs'), pidPath = join(directory, 'pid.txt')
  try {
    await writeFile(fixture, `const fs = require('node:fs'); let input=''; process.stdin.on('data', data=>input+=data); process.stdin.on('end',()=>{ const target=JSON.parse(input); fs.writeFileSync(process.argv[2], String(process.pid)); console.log(JSON.stringify({status:target.sessionId==='busy'?'busy':'opened',scope:'window'})); if(target.sessionId==='hang') setInterval(()=>{},1000); });`)
    const target = { sessionId: notice.sessionId }
    const hung = await runWechatHelper(process.execPath, { ...target, sessionId: 'hang' }, { args: [fixture, pidPath], timeoutMs: 1000 })
    assert.equal(hung.status, 'error')
    assert.match(hung.error!, /超时/)
    const pid = Number(await readFile(pidPath, 'utf8'))
    assert.throws(() => process.kill(pid, 0))
    const opened = await runWechatHelper(process.execPath, target, { args: [fixture, pidPath] })
    assert.equal(opened.status, 'opened')
    assert.equal(opened.scope, 'window')
    assert.equal((await runWechatHelper(process.execPath, { ...target, sessionId: 'busy' }, { args: [fixture, pidPath] })).status, 'busy')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('native helper watchdog exits while stdin is blocked, before any WeChat interaction', { skip: process.platform !== 'win32' }, async () => {
  const result = await new Promise<{ error: Error | null; stdout: string }>(resolveResult => {
    // Keep stdin open deliberately. Main cannot deserialize a target, so this
    // exercises the independent native watchdog without automating real WeChat.
    execFile(resolve('resources/launcher/WeNotice.OpenWechat.exe'), [], { windowsHide: true, timeout: 9000, encoding: 'utf8' }, (error, stdout) => resolveResult({ error, stdout }))
  })
  assert.ok(result.error)
  const response = JSON.parse(result.stdout.trim())
  assert.equal(response.status, 'error')
  assert.match(response.error, /超时/)
})
test('ordinary notification activates WeChat while test notification stays in the app', async () => {
  const calls: WechatTarget[] = []
  const navigator = new WechatNavigator(async target => { calls.push(target); return { status: 'opened' } })
  assert.equal((await navigator.open({ ...notice, test: true })).status, 'app')
  assert.equal(calls.length, 0)
  assert.equal((await navigator.open(notice)).status, 'opened')
  assert.equal(calls[0].sessionId, notice.sessionId)
})
test('navigation does not overlap activations and releases after a helper result', async () => {
  let finish!: (value: WechatOpenResult) => void
  const calls: WechatTarget[] = []
  const navigator = new WechatNavigator(async target => { calls.push(target); return new Promise(resolve => { finish = resolve }) })
  const pending = navigator.open(notice)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await navigator.open({ ...notice, sessionId: 'other' })).status, 'busy')
  assert.deepEqual(calls[0], { sessionId: notice.sessionId })
  finish({ status: 'ambiguous', error: '同名' })
  assert.equal((await pending).status, 'ambiguous')
})
