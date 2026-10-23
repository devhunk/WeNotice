import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { verifyPackagedWorker, verifyWorkerSource } from './verify-packaged-worker.mjs'

test('current build executes classification through packaged worker IPC', async () => {
  assert.equal(await verifyPackagedWorker(fileURLToPath(new URL('..', import.meta.url))), 8)
})

test('stale type 49 classification fails even with a functioning worker IPC handler', async () => {
  const staleWorker = `
    var adapter = {};
    process.on('message', request => {
      process.send({ id: request.id, result: __rows.map(() => ({ content: '[分享]', sessionId: 'friend' })) });
    });
  `
  await assert.rejects(verifyWorkerSource(staleWorker), /classification case 1/)
})

test('worker errors cannot pass the classification check', async () => {
  const brokenWorker = `
    var adapter = {};
    process.on('message', request => process.send({ id: request.id, error: 'broken worker' }));
  `
  await assert.rejects(verifyWorkerSource(brokenWorker), /Worker IPC failed: broken worker/)
})

test('missing worker dispatch is rejected', async () => {
  await assert.rejects(verifyWorkerSource('var adapter = {};'), /Worker IPC handler is missing/)
})
