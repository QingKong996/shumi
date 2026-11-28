import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

import type { ShumiAgentApi } from '../shared/agent/api'
import type { HarnessInfo } from '../shared/harness'

type ShumiPreloadApi = {
  harness: {
    detect: (refresh?: boolean) => Promise<HarnessInfo[]>
    onUpdated: (callback: (harnesses: HarnessInfo[]) => void) => () => void
  }
  project: {
    selectFolder: () => Promise<string | null>
  }
  agent: ShumiAgentApi
}

// Custom APIs for renderer
const api: ShumiPreloadApi = {
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
  },
  project: {
    selectFolder: (): Promise<string | null> => ipcRenderer.invoke('project:select-folder')
  },
  agent: {
    start: (input) => ipcRenderer.invoke('agent:start', input),
    send: (sessionId, input) => ipcRenderer.invoke('agent:send', sessionId, input),
    cancel: (sessionId) => ipcRenderer.invoke('agent:cancel', sessionId),
    respond: (sessionId, requestId, response) =>
      ipcRenderer.invoke('agent:respond', sessionId, requestId, response),
    setOptions: (sessionId, options) => ipcRenderer.invoke('agent:set-options', sessionId, options),
    stop: (sessionId) => ipcRenderer.invoke('agent:stop', sessionId),
    onEvent: (callback): (() => void) => {
      const listener = (_event: IpcRendererEvent, event: Parameters<typeof callback>[0]): void => {
        callback(event)
      }

      ipcRenderer.on('agent:event', listener)
      return () => ipcRenderer.removeListener('agent:event', listener)
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
