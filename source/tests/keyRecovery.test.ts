import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recoverKey } from '../electron/data/keyRecovery'

test('recovery uses an isolated child with actual loopback auth and kills it on cancel/timeout', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wenotice-recovery-')), worker = join(root, 'fixture.cjs'), dll = join(root, 'fixture.dll')
  await writeFile(dll, '')
  await writeFile(worker, `process.on('message', request => {
    require('fs').writeFileSync(request.dllPath + '.pid', String(process.pid));
    if (request.pid !== 1) return;
    const e = process.env, socket = require('net').createConnection(Number(e.WEFLOW_XKEY_AUTH_PORT), '127.0.0.1');
    socket.on('connect', () => socket.write(e.WEFLOW_XKEY_AUTH_MODE + '\\t0\\t0\\t' + e.WEFLOW_XKEY_AUTH_TS + '\\t' + e.WEFLOW_XKEY_AUTH_TOKEN + '\\n'));
    socket.on('data', data => { process.send(data.toString().trim() === 'OK' ? { key: 'a'.repeat(64) } : { error: 'auth failed' }); socket.end() });
  });`)
  try {
    assert.equal(await recoverKey(dll, 1, 'fixture.db', new AbortController().signal, 5000, worker), 'a'.repeat(64))
    const controller = new AbortController()
    await writeFile(dll + '.pid', '')
    const pending = recoverKey(dll, 2, 'fixture.db', controller.signal, 5000, worker)
    let pid = 0
    const deadline = Date.now() + 4000
    while (!pid && Date.now() < deadline) { pid = Number(await readFile(dll + '.pid', 'utf8')); if (!pid) await new Promise(resolve => setTimeout(resolve, 20)) }
    assert.ok(pid > 0)
    controller.abort(); await assert.rejects(pending, /取消/)
    assert.throws(() => process.kill(pid, 0))
    await assert.rejects(recoverKey(dll, 2, 'fixture.db', new AbortController().signal, 50, worker), /超时/)
    await assert.rejects(recoverKey(join(root, 'missing.dll'), 1, '', new AbortController().signal, 50, worker), /缺少 wx_key.dll/)
  } finally { assert.ok(root.startsWith(join(tmpdir(), 'wenotice-recovery-'))); await rm(root, { recursive: true, force: true }) }
})
