import test from 'node:test'
import assert from 'node:assert/strict'
import { createConnection } from 'node:net'
import { createNativeGrant, type NativeGrant } from '../electron/data/nativeGrant'

function challenge(grant: NativeGrant, mode = 'wcdb_native_init', token = grant.token, split = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(grant.port, '127.0.0.1')
    let response = ''
    socket.setEncoding('utf8'); socket.setTimeout(2000, () => socket.destroy(new Error('challenge timed out')))
    socket.on('error', reject); socket.on('data', data => { response += data })
    socket.on('end', () => resolve(response.trim()))
    socket.on('connect', () => {
      const line = `${mode}\t${process.pid}\t0\t${grant.issuedAtMs}\t${token}\r\n`
      if (split) { socket.write(line.slice(0, 8)); setImmediate(() => socket.write(line.slice(8))) }
      else socket.write(line)
    })
  })
}

test('native grant completes an actual fragmented loopback challenge and closes its port', async () => {
  const grant = await createNativeGrant()
  try { assert.equal(await challenge(grant.credentials, undefined, undefined, true), 'OK') }
  finally { await grant.dispose() }
  await assert.rejects(challenge(grant.credentials), /ECONNREFUSED/)
  await grant.dispose()
})

test('native grant rejects wrong mode, wrong token and expired grants', async () => {
  let now = 1000000
  const grant = await createNativeGrant(() => now)
  try {
    assert.equal(await challenge(grant.credentials, 'other_mode'), 'ERR:mode_mismatch')
    assert.equal(await challenge(grant.credentials, undefined, 'invalid'), 'ERR:token_mismatch')
    now += 180001
    assert.equal(await challenge(grant.credentials), 'ERR:expired')
  } finally { await grant.dispose() }
})

test('disposing a native grant closes an incomplete challenge without hanging', async () => {
  const grant = await createNativeGrant()
  const socket = createConnection(grant.credentials.port, '127.0.0.1')
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject) })
  socket.write('wcdb_')
  const closed = new Promise<void>(resolve => socket.once('close', () => resolve()))
  await grant.dispose(); await closed
  assert.equal(socket.destroyed, true)
})
