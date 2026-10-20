import { contextBridge, ipcRenderer } from 'electron'
import type { NotificationAPI } from '../shared/types'
const api: NotificationAPI = {
  hover: (id, paused) => ipcRenderer.send('notice:hover', { id, paused }),
  ready: () => ipcRenderer.send('notice:ready'), received: id => ipcRenderer.send('notice:received', id), close: id => ipcRenderer.send('notice:close', id), click: id => ipcRenderer.send('notice:click', id),
  resize: (id, width, height) => ipcRenderer.send('notice:resize', { id, width, height }), glassRect: payload => ipcRenderer.send('notice:glassRect', payload), glassHide: id => ipcRenderer.send('notice:glassHide', id),
  onShow: cb => { const listener = (_: unknown, data: any) => cb(data); ipcRenderer.on('notice:show', listener); return () => ipcRenderer.removeListener('notice:show', listener) },
  onLuma: cb => { const listener = (_: unknown, data: any) => cb(data); ipcRenderer.on('notice:luma', listener); return () => ipcRenderer.removeListener('notice:luma', listener) }
}
contextBridge.exposeInMainWorld('electronAPI', { notification: api })
