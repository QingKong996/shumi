import { ElectronAPI } from '@electron-toolkit/preload'

import type { HarnessInfo } from '../shared/harness'

type ShumiAPI = {
  harness: {
    detect: (refresh?: boolean) => Promise<HarnessInfo[]>
    onUpdated: (callback: (harnesses: HarnessInfo[]) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ShumiAPI
  }
}
