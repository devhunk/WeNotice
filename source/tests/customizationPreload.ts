import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('weNotice', {
  state: () => ipcRenderer.invoke('check:state'), save: (settings: unknown) => ipcRenderer.invoke('check:save', settings), displays: () => ipcRenderer.invoke('check:displays'), sessions: () => ipcRenderer.invoke('check:sessions'),
  test: () => ipcRenderer.invoke('check:test'), start: async () => {}, pause: async () => {}, choose: async () => null, detectAccounts: async () => [], cancelAutoConnect: async () => {},
  onState: () => () => {}, onAutoProgress: () => () => {}
})
