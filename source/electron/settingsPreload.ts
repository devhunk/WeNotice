import { contextBridge, ipcRenderer } from 'electron'
import type { SettingsAPI } from '../shared/types'
const api: SettingsAPI = {
  displays: () => ipcRenderer.invoke('app:displays'),
  detectAccounts: directory => ipcRenderer.invoke('app:detectAccounts', directory),
  autoConnect: settings => ipcRenderer.invoke('app:autoConnect', settings), cancelAutoConnect: () => ipcRenderer.invoke('app:cancelAutoConnect'),
  onAutoProgress: cb => { const listener = (_: unknown, progress: any) => cb(progress); ipcRenderer.on('app:autoProgress', listener); return () => ipcRenderer.removeListener('app:autoProgress', listener) },
  state: () => ipcRenderer.invoke('app:state'), save: (settings, key) => ipcRenderer.invoke('app:save', settings, key),
  choose: kind => ipcRenderer.invoke('app:choose', kind), start: () => ipcRenderer.invoke('app:start'), pause: () => ipcRenderer.invoke('app:pause'), test: () => ipcRenderer.invoke('app:test'),
  onState: cb => { const listener = (_: unknown, state: any) => cb(state); ipcRenderer.on('app:stateChanged', listener); return () => ipcRenderer.removeListener('app:stateChanged', listener) }
}
contextBridge.exposeInMainWorld('weNotice', api)
