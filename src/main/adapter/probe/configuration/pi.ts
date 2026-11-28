import { join } from 'node:path'

import type { HarnessModelInfo } from '../../../../shared/harness'
import { getPiAgentDir } from '../environment'
import { getNonEmptyString, isRecord, readJsonObject } from '../files'

const PI_THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
const PI_THINKING_LEVEL_SET = new Set<string>(PI_THINKING_LEVELS)

function parseModelReference(reference: string): { provider: string; id: string } | null {
  const separatorIndex = reference.indexOf('/')

  if (separatorIndex <= 0 || separatorIndex === reference.length - 1) {
    return null
  }

  return {
    provider: reference.slice(0, separatorIndex),
    id: reference.slice(separatorIndex + 1)
  }
}

function getPiModels(
  settings: Record<string, unknown>,
  modelsStore: Record<string, unknown>,
  modelsConfig: Record<string, unknown> | null
): HarnessModelInfo[] {
  const defaultProvider = getNonEmptyString(settings.defaultProvider)
  const defaultModelId = getNonEmptyString(settings.defaultModel)
  const defaultReference =
    defaultProvider && defaultModelId ? `${defaultProvider}/${defaultModelId}` : null
  const defaultThinkingLevel = getNonEmptyString(settings.defaultThinkingLevel)
  const modelThinkingLevels = isRecord(settings.modelThinkingLevels)
    ? settings.modelThinkingLevels
    : {}
  const models = new Map<string, HarnessModelInfo>()

  const getReasoningEffort = (reference: string): string | null => {
    const modelThinkingLevel = getNonEmptyString(modelThinkingLevels[reference])

    if (modelThinkingLevel && PI_THINKING_LEVEL_SET.has(modelThinkingLevel)) {
      return modelThinkingLevel
    }

    return defaultThinkingLevel && PI_THINKING_LEVEL_SET.has(defaultThinkingLevel)
      ? defaultThinkingLevel
      : null
  }

  const addModel = (
    provider: string,
    id: string,
    name: string | null,
    reasoningLevels: string[] = []
  ): void => {
    const reference = `${provider}/${id}`
    const existing = models.get(reference)

    models.set(reference, {
      provider,
      id,
      name: name ?? existing?.name ?? id,
      reasoningEffort: getReasoningEffort(reference),
      reasoningLevels:
        reasoningLevels.length > 0 ? reasoningLevels : (existing?.reasoningLevels ?? []),
      isDefault: reference === defaultReference
    })
  }

  const addProviderModels = (providers: unknown): void => {
    if (!isRecord(providers)) {
      return
    }

    for (const [providerId, providerConfig] of Object.entries(providers)) {
      if (!isRecord(providerConfig) || !Array.isArray(providerConfig.models)) {
        continue
      }

      for (const modelConfig of providerConfig.models) {
        if (!isRecord(modelConfig)) {
          continue
        }

        const type = getNonEmptyString(modelConfig.type)

        if (type && type !== 'chat') {
          continue
        }

        const id = getNonEmptyString(modelConfig.id)

        if (!id) {
          continue
        }

        const provider = getNonEmptyString(modelConfig.provider) ?? providerId
        const thinkingLevelMap = isRecord(modelConfig.thinkingLevelMap)
          ? modelConfig.thinkingLevelMap
          : null
        const reasoningLevels =
          modelConfig.reasoning === true
            ? PI_THINKING_LEVELS.filter(
                (level) => thinkingLevelMap === null || getNonEmptyString(thinkingLevelMap[level])
              )
            : []

        addModel(provider, id, getNonEmptyString(modelConfig.name), [...reasoningLevels])
      }
    }
  }

  addProviderModels(modelsStore)
  addProviderModels(modelsConfig?.providers)

  if (defaultProvider && defaultModelId) {
    addModel(defaultProvider, defaultModelId, null)
  }

  for (const reference of Object.keys(modelThinkingLevels)) {
    const parsedReference = parseModelReference(reference)

    if (parsedReference) {
      addModel(parsedReference.provider, parsedReference.id, null)
    }
  }

  return [...models.values()].sort(
    (left, right) =>
      Number(right.isDefault) - Number(left.isDefault) ||
      left.provider.localeCompare(right.provider) ||
      left.name.localeCompare(right.name)
  )
}

export function readPiModels(): HarnessModelInfo[] {
  const agentDir = getPiAgentDir()
  const settings = readJsonObject(join(agentDir, 'settings.json')) ?? {}
  const modelsStore = readJsonObject(join(agentDir, 'models-store.json')) ?? {}
  const modelsConfig = readJsonObject(join(agentDir, 'models.json'))

  return getPiModels(settings, modelsStore, modelsConfig)
}
