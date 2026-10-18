import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Socket } from 'node:net'

export interface NativeGrant { token: string; port: number; issuedAtMs: number }

// The synchronous DLL call runs in dbWorker. Keep its loopback challenge server
// on the main thread so that the handshake can complete while that call blocks.
// Protocol matches WeFlow's wcdb_native_init grant; no WeFlow process is needed.
export async function createNativeGrant(now: () => number = Date.now, mode = 'wcdb_native_init') {
  const token = randomBytes(24).toString('hex'), issuedAtMs = now()
  const sockets = new Set<Socket>()
  let disposed = false
  const server = createServer(socket => {
    sockets.add(socket); socket.setEncoding('utf8'); socket.setTimeout(5000)
    let buffer = '', replied = false
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
    socket.on('timeout', () => socket.destroy())
    socket.on('data', chunk => {
      if (replied) return
      buffer += chunk
      if (buffer.length > 4096) { socket.destroy(); return }
      const end = buffer.indexOf('\n'); if (end < 0) return
      replied = true
      const fields = buffer.slice(0, end).trim().split('\t')
      const supplied = Buffer.from(fields[4] || '', 'utf8'), expected = Buffer.from(token, 'utf8')
      if (fields[0] !== mode) socket.end('ERR:mode_mismatch\n')
      else if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) socket.end('ERR:token_mismatch\n')
      else if (now() - issuedAtMs > 180000 || now() < issuedAtMs) socket.end('ERR:expired\n')
      else socket.end('OK\n')
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  const address = server.address()
  if (!address || typeof address === 'string') { server.close(); throw new Error('无法创建本机组件认证服务') }
  return {
    credentials: { token, port: address.port, issuedAtMs } satisfies NativeGrant,
    async dispose() {
      if (disposed) return
      disposed = true
      for (const socket of sockets) socket.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  }
}
