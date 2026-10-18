import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DataClient } from '../electron/data/client'

const config = { accountDir: 'fixture', accountId: 'fixture', libraryPath: 'fixture.dll', key: 'a'.repeat(64) }
const fixture = `
process.on('disconnect', () => process.exit(0));
process.on('message', request => {
  const send = result => process.send({ id: request.id, result });
  if (request.method === 'open') {
    const grant = request.args[1], socket = require('net').createConnection(grant.port, '127.0.0.1');
    socket.on('connect', () => socket.end('wcdb_native_init\\t' + process.pid + '\\t0\\t' + grant.issuedAtMs + '\\t' + grant.token + '\\n'));
    socket.on('data', data => {
      if (data.toString().trim() !== 'OK') return process.exit(2);
      send({ mode: 'pipe', capabilities: ['status'] });
    });
    socket.on('error', () => process.exit(3));
  } else if (request.method === 'pid') send(process.pid);
  else if (request.method === 'crash') process.exit(4);
  else if (request.method === 'hang') return;
  else if (request.method === 'close') send(null);
  else if (request.method === 'sessions') send([{id:'fixture',timestamp:1,unread:0,summary:''}]);
});`

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'wenotice-db-process-'))
  const worker = join(root, 'fixture.cjs')
  await writeFile(worker, fixture)
  return { worker, clean: () => rm(root, { recursive: true, force: true }) }
}

test('database process authenticates, reads sessions and is reaped on close and reopen', async () => {
  const f = await setup(), events: unknown[] = [], client = new DataClient(event => events.push(event), f.worker)
  try {
    assert.equal((await client.open(config)).mode, 'pipe')
    const first = await client.call<number>('pid')
    assert.notEqual(first, process.pid)
    assert.equal((await client.sessions())[0].id, 'fixture')
    await client.close()
    assert.throws(() => process.kill(first, 0))
    await client.close()
    await client.open(config)
    assert.notEqual(await client.call<number>('pid'), first)
    assert.deepEqual(events, [])
  } finally { await client.close(); await f.clean() }
})

test('native process crash rejects pending work and permits a fresh connection', async () => {
  const f = await setup(), events: any[] = [], client = new DataClient(event => events.push(event), f.worker)
  try {
    await client.open(config)
    await assert.rejects(client.call('crash'), /子进程已退出/)
    assert.equal(events.length, 1)
    await client.open(config)
    assert.equal((await client.sessions()).length, 1)
  } finally { await client.close(); await f.clean() }
})

test('hung native process is killed on timeout and does not block reconnect', async () => {
  const f = await setup(), events: any[] = [], client = new DataClient(event => events.push(event), f.worker, 1000)
  try {
    await client.open(config)
    await assert.rejects(client.call('hang'), /超时/)
    assert.equal(events.length, 1)
    await client.open(config)
    assert.equal((await client.sessions()).length, 1)
  } finally { await client.close(); await f.clean() }
})
