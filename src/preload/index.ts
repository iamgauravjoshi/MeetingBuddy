import { contextBridge, ipcRenderer } from 'electron'

const EVENTS = [
  'hotkey:record',
  'hotkey:mark',
  'meeting:detected',
  'meeting:ended',
  'meeting:changed',
  'recording:changed',
  'transcript:appended',
  'navigate:meeting'
]

contextBridge.exposeInMainWorld('mb', {
  invoke: (name: string, ...args: unknown[]) => ipcRenderer.invoke(`api:${name}`, ...args),
  applyHotkeys: () => ipcRenderer.invoke('app:applyHotkeys'),
  setRecordingState: (s: unknown) => ipcRenderer.send('recording:state', s),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    if (!EVENTS.includes(channel)) throw new Error(`Unknown event ${channel}`)
    const h = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => cb(...args)
    ipcRenderer.on(channel, h)
    return () => ipcRenderer.removeListener(channel, h)
  }
})
