import { ElectronAPI } from '@electron-toolkit/preload'

import type { ShumiAgentApi } from '../shared/agent/api'
import type { HarnessInfo } from '../shared/harness'

type ShumiAPI = {
  harness: {
    detect: (refresh?: boolean) => Promise<HarnessInfo[]>
    onUpdated: (callback: (harnesses: HarnessInfo[]) => void) => () => void
  }
  project: {
    selectFolder: () => Promise<string | null>
  }
  agent: ShumiAgentApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ShumiAPI
  }
}
