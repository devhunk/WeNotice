import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareAutoConnection, type AutoDependencies } from '../electron/data/autoConnection'
import { defaults, type DbConfig } from '../shared/types'

const settings = { ...defaults, accountDir: 'D:/xwechat_files/wxid_one_ab12', accountId: 'wxid_one', libraryPath: 'reader.dll' }
const cached: DbConfig = { ...settings, key: 'a'.repeat(64) }
const deps = (patch: Partial<AutoDependencies> = {}): AutoDependencies => ({ sessionFile: async () => 'session.db', processIds: async () => [10], recover: async () => 'b'.repeat(64), verify: async () => {}, ...patch })

test('verified cached key avoids process scanning, but is verified against the requested reader', async () => {
  let verified: DbConfig | undefined
  const result = await prepareAutoConnection(settings, cached, deps({ verify: async config => { verified = config }, processIds: async () => { throw new Error('must not scan') } }), new AbortController().signal, () => {})
  assert.equal(result.key, cached.key); assert.equal(verified?.libraryPath, settings.libraryPath)
})

test('stale cached key is reacquired and validated; another account never tries that cached key', async () => {
  const seen: string[] = []
  const dependency = deps({ verify: async config => { seen.push(config.key); if (config.key === cached.key) throw new Error('stale') } })
  const result = await prepareAutoConnection(settings, cached, dependency, new AbortController().signal, () => {})
  assert.equal(result.key, 'b'.repeat(64)); assert.deepEqual(seen, [cached.key, result.key])
  seen.length = 0
  await prepareAutoConnection(settings, { ...cached, accountDir: 'other' }, dependency, new AbortController().signal, () => {})
  assert.deepEqual(seen, ['b'.repeat(64)])
})

test('multiple processes are tried only until a key actually opens the database', async () => {
  const tried: number[] = []
  const result = await prepareAutoConnection(settings, undefined, deps({ processIds: async () => [11, 12, 13], recover: async pid => { tried.push(pid); return String(pid === 11 ? 'c' : 'd').repeat(64) }, verify: async config => { if (config.key[0] === 'c') throw new Error('wrong account') } }), new AbortController().signal, () => {})
  assert.deepEqual(tried, [11, 12]); assert.equal(result.key[0], 'd')
})

test('missing database, logged-out client, malformed result and failed verification reject before saving', async () => {
  const signal = new AbortController().signal
  await assert.rejects(prepareAutoConnection(settings, undefined, deps({ sessionFile: async () => null }), signal, () => {}), /session.db/)
  await assert.rejects(prepareAutoConnection(settings, undefined, deps({ processIds: async () => [] }), signal, () => {}), /未找到微信进程/)
  await assert.rejects(prepareAutoConnection(settings, undefined, deps({ recover: async () => 'bad' }), signal, () => {}), /格式无效/)
  await assert.rejects(prepareAutoConnection(settings, undefined, deps({ verify: async () => { throw new Error('cannot open') } }), signal, () => {}), /cannot open/)
  assert.equal(cached.key, 'a'.repeat(64))
})

test('cancellation during verification never returns a key to the save step', async () => {
  const controller = new AbortController()
  await assert.rejects(prepareAutoConnection(settings, undefined, deps({ verify: async () => { controller.abort() } }), controller.signal, () => {}), /取消/)
})
