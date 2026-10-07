import { contextBridge, ipcRenderer } from 'electron'
import { MAIN_EVENTS } from '@shared/types'

const EVENTS: readonly string[] = MAIN_EVENTS

contextBridge.exposeInMainWorld('mb', {
  invoke: (name: string, ...args: unknown[]) => ipcRenderer.invoke(`api:${name}`, ...args),
  applyHotkeys: () => ipcRenderer.invoke('app:applyHotkeys'),
  setRecordingState: (s: unknown) => ipcRenderer.send('recording:state', s),
  quitReady: () => ipcRenderer.send('app:quit-ready'),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    if (!EVENTS.includes(channel)) throw new Error(`Unknown event ${channel}`)
    const h = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => cb(...args)
    ipcRenderer.on(channel, h)
    return () => ipcRenderer.removeListener(channel, h)
  }
})
