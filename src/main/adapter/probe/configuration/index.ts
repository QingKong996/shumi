import type { HarnessId, HarnessModelInfo } from '../../../../shared/harness'
import { readCodexModels } from './codex'
import { readPiModels } from './pi'

export type HarnessConfiguration = {
  models: HarnessModelInfo[]
}

export function readHarnessConfiguration(id: HarnessId): HarnessConfiguration {
  switch (id) {
    case 'pi':
      return { models: readPiModels() }
    case 'codex':
      return { models: readCodexModels() }
  }
}
