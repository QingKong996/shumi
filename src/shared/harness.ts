export type HarnessId = 'pi' | 'codex'

export type HarnessModelInfo = {
  provider: string
  id: string
  name: string
  reasoningEffort: string | null
  reasoningLevels: string[]
  isDefault: boolean
}

export type HarnessInfo = {
  id: HarnessId
  name: string
  command: string
  installed: boolean
  version: string | null
  versionPending?: boolean
  models: HarnessModelInfo[]
}

export function getHarnessModelValue(model: HarnessModelInfo): string {
  return model.provider ? `${model.provider}/${model.id}` : model.id
}
