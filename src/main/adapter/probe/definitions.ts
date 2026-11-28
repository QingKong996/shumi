import type { HarnessId } from '../../../shared/harness'

export type HarnessDefinition = {
  id: HarnessId
  name: string
  command: string
  windowsPackage?: {
    prefix: string
    executable: readonly string[]
  }
}

export const HARNESS_DEFINITIONS: readonly HarnessDefinition[] = [
  {
    id: 'pi',
    name: 'Pi',
    command: 'pi'
  },
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    windowsPackage: {
      prefix: 'OpenAI.Codex_',
      executable: ['app', 'resources', 'codex.exe']
    }
  }
]
