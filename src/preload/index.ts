import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

import type { HarnessInfo } from '../shared/harness'

// Custom APIs for renderer
const api = {
  harness: {
    detect: (refresh = false): Promise<HarnessInfo[]> =>
      ipcRenderer.invoke('harness:detect', refresh),
    onUpdated: (callback: (harnesses: HarnessInfo[]) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, harnesses: HarnessInfo[]): void => {
        callback(harnesses)
      }

      ipcRenderer.on('harness:updated', listener)
      return () => ipcRenderer.removeListener('harness:updated', listener)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
