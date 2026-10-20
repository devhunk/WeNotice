import koffi from 'koffi'
export const isWechatProcess = (path: string) => /(?:^|[\\/])(weixin|wechat)\.exe$/i.test(path)
export function createForegroundReader(): () => boolean {
  return createForegroundProbe().read
}
export function createForegroundProbe(): { supported: boolean; read: () => boolean; processPath: () => string | null } {
  if (process.platform !== 'win32') return { supported: false, read: () => false, processPath: () => null }
  try {
    const user32 = koffi.load('user32.dll'), kernel32 = koffi.load('kernel32.dll')
    const foreground = user32.func('void * __stdcall GetForegroundWindow()')
    const owner = user32.func('uint32 __stdcall GetWindowThreadProcessId(void * hwnd, _Out_ uint32 * pid)')
    const open = kernel32.func('void * __stdcall OpenProcess(uint32 access, int32 inherit, uint32 pid)')
    const query = kernel32.func('int32 __stdcall QueryFullProcessImageNameW(void * process, uint32 flags, _Out_ void * name, _Inout_ uint32 * size)')
    const close = kernel32.func('int32 __stdcall CloseHandle(void * handle)')
    const processPath = () => {
      let handle: unknown
      try {
        const hwnd = foreground(); if (!hwnd) return null
        const pid = [0]; owner(hwnd, pid); if (!pid[0]) return null
        handle = open(0x1000, 0, pid[0]); if (!handle) return null
        const buffer = Buffer.alloc(65536), length = [32768]
        return query(handle, 0, buffer, length) ? buffer.toString('utf16le', 0, length[0] * 2) : null
      } catch { return null } finally { if (handle) close(handle) }
    }
    return { supported: true, read: () => isWechatProcess(processPath() || ''), processPath }
  } catch { return { supported: false, read: () => false, processPath: () => null } }
}
export class ForegroundGate {
  constructor(private read: () => boolean) {}
  suppressed(enabled: boolean, test = false) { if (!enabled || test) return false; try { return this.read() } catch { return false } }
}
