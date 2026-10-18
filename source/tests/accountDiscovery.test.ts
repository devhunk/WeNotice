import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverAccounts, inferAccountId } from '../electron/data/accountDiscovery'

test('discovers nested/flat accounts in Chinese spaced paths, rejects empty skeletons and deduplicates roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wenotice-accounts-'))
  try {
    const first = join(root, '中文 数据', 'wxid_first_ab12'), second = join(root, '中文 数据', 'custom_user_cd34')
    for (const directory of [join(first, 'db_storage', 'session'), join(second, 'db_storage'), join(root, '中文 数据', 'empty', 'db_storage')]) await mkdir(directory, { recursive: true })
    await writeFile(join(first, 'db_storage', 'session', 'session.db'), 'fixture')
    await writeFile(join(second, 'db_storage', 'session.db'), 'fixture')
    const values = await discoverAccounts([root, join(root, '中文 数据'), first, join(first, 'db_storage', 'session', 'session.db')])
    assert.equal(values.length, 2)
    assert.deepEqual(new Set(values.map(value => value.accountId)), new Set(['wxid_first', 'custom_user']))
    assert.equal(inferAccountId('wxid_long_identifier'), 'wxid_long_identifier')
  } finally { assert.ok(root.startsWith(join(tmpdir(), 'wenotice-accounts-'))); await rm(root, { recursive: true, force: true }) }
})
