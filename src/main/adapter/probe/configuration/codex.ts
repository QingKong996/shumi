import { isAbsolute, join, resolve } from 'node:path'

import type { HarnessModelInfo } from '../../../../shared/harness'
import { expandHomePath, getCodexHome } from '../environment'
import {
  getNonEmptyString,
  isRecord,
  readJsonObject,
  readJsonValue,
  readTomlObject
} from '../files'

function resolveConfiguredPath(baseDir: string, path: string): string {
  const expandedPath = expandHomePath(path)

  return isAbsolute(expandedPath) ? expandedPath : resolve(baseDir, expandedPath)
}

function getCodexCatalogEntries(catalog: unknown): Record<string, unknown>[] {
  const entries =
    isRecord(catalog) && Array.isArray(catalog.models)
      ? catalog.models
      : Array.isArray(catalog)
        ? catalog
        : []

  return entries.filter(isRecord)
}

function getReasoningLevels(entry: Record<string, unknown>): string[] {
  if (!Array.isArray(entry.supported_reasoning_levels)) {
    return []
  }

  return [
    ...new Set(
      entry.supported_reasoning_levels.flatMap((level) => {
        const effort = isRecord(level) ? getNonEmptyString(level.effort) : null

        return effort ? [effort] : []
      })
    )
  ]
}

function getCodexModels(config: Record<string, unknown>, codexHome: string): HarnessModelInfo[] {
  const configuredModel = getNonEmptyString(config.model)
  const configuredReasoningEffort = getNonEmptyString(config.model_reasoning_effort)
  const catalogPath = getNonEmptyString(config.model_catalog_json)
  const catalogEntries = catalogPath
    ? getCodexCatalogEntries(readJsonValue(resolveConfiguredPath(codexHome, catalogPath)))
    : []
  const entries =
    catalogEntries.length > 0
      ? catalogEntries
      : getCodexCatalogEntries(readJsonValue(join(codexHome, 'models_cache.json')))
  const models = new Map<string, HarnessModelInfo>()

  const addModel = (
    slug: string,
    name: string | null,
    reasoningEffort: string | null,
    reasoningLevels: string[] = []
  ): void => {
    const separatorIndex = slug.indexOf('/')
    const hasProvider = separatorIndex > 0 && separatorIndex < slug.length - 1
    const existing = models.get(slug)

    models.set(slug, {
      provider: hasProvider ? slug.slice(0, separatorIndex) : '',
      id: hasProvider ? slug.slice(separatorIndex + 1) : slug,
      name: name ?? existing?.name ?? slug,
      reasoningEffort:
        slug === configuredModel ? (configuredReasoningEffort ?? reasoningEffort) : reasoningEffort,
      reasoningLevels:
        reasoningLevels.length > 0 ? reasoningLevels : (existing?.reasoningLevels ?? []),
      isDefault: slug === configuredModel
    })
  }

  for (const entry of entries) {
    const slug = getNonEmptyString(entry.slug) ?? getNonEmptyString(entry.id)

    if (!slug) {
      continue
    }

    addModel(
      slug,
      getNonEmptyString(entry.display_name) ?? getNonEmptyString(entry.name),
      getNonEmptyString(entry.default_reasoning_level),
      getReasoningLevels(entry)
    )
  }

  if (configuredModel) {
    addModel(configuredModel, null, configuredReasoningEffort)
  }

  return [...models.values()].sort(
    (left, right) =>
      Number(right.isDefault) - Number(left.isDefault) ||
      left.provider.localeCompare(right.provider) ||
      left.name.localeCompare(right.name)
  )
}

export function readCodexModels(): HarnessModelInfo[] {
  const codexHome = getCodexHome()
  const config =
    readTomlObject(join(codexHome, 'config.toml')) ?? readJsonObject(join(codexHome, 'config.json'))

  return config ? getCodexModels(config, codexHome) : []
}
