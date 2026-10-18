import { NativeAdapter } from './nativeAdapter'
// Run with ELECTRON_RUN_AS_NODE. Native state and failures stay in this process.
const send = (message: unknown) => {
  if (process.connected) process.send?.(message as any, error => { if (error) process.exit(0) })
}
const adapter = new NativeAdapter(event => send({ event }))
let queue = Promise.resolve()
process.on('disconnect', () => { try { adapter.close() } finally { process.exit(0) } })
process.on('message', (request: any) => {
  queue = queue.then(async () => {
    try {
      let result: unknown
      switch (request.method) {
        case 'open': result = adapter.open(request.args[0], request.args[1]); break
        case 'sessions': result = adapter.sessions(); break
        case 'messages': result = await adapter.messages(request.args[0], request.args[1]); break
        case 'contact': result = adapter.contact(request.args[0]); break
        case 'close': adapter.close(); break
        default: throw new Error('未知数据库操作')
      }
      send({ id: request.id, result })
    } catch (error) { send({ id: request.id, error: error instanceof Error ? error.message.replace(/[a-f\d]{64}/gi, '[已隐藏]') : '数据库操作失败' }) }
  })
})
