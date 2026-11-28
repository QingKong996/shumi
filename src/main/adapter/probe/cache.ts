import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { HarnessId, HarnessInfo, HarnessModelInfo } from '../../../shared/harness'

const CACHE_VERSION = 3
const CACHE_DIRECTORY = join(homedir(), '.shumi')
const CACHE_PATH = join(CACHE_DIRECTORY, 'harness-cache.json')
const HARNESS_IDS = new Set<HarnessId>(['pi', 'codex'])

export type HarnessProbeCache = {
  executable: string
  stamp: string
  version: string | null
}

type HarnessCache = {
  version: typeof CACHE_VERSION
  updatedAt: string
  harnesses: HarnessInfo[]
  probes: Partial<Record<HarnessId, HarnessProbeCache>>
}

export type HarnessCacheState = {
  harnesses: HarnessInfo[]
  probes: Partial<Record<HarnessId, HarnessProbeCache>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHarnessModelInfo(value: unknown): value is HarnessModelInfo {
  return (
    isRecord(value) &&
    typeof value.provider === 'string' &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.reasoningEffort === null || typeof value.reasoningEffort === 'string') &&
    Array.isArray(value.reasoningLevels) &&
    value.reasoningLevels.every((level) => typeof level === 'string') &&
    typeof value.isDefault === 'boolean'
  )
}

function isHarnessInfo(value: unknown): value is HarnessInfo {
  return (
    isRecord(value) &&
    HARNESS_IDS.has(value.id as HarnessId) &&
    typeof value.name === 'string' &&
    typeof value.command === 'string' &&
    typeof value.installed === 'boolean' &&
    (value.version === null || typeof value.version === 'string') &&
    (value.versionPending === undefined || typeof value.versionPending === 'boolean') &&
    Array.isArray(value.models) &&
    value.models.every(isHarnessModelInfo)
  )
}

function isHarnessProbeCache(value: unknown): value is HarnessProbeCache {
  return (
    isRecord(value) &&
    typeof value.executable === 'string' &&
    typeof value.stamp === 'string' &&
    (value.version === null || typeof value.version === 'string')
  )
}

function readProbes(value: unknown): Partial<Record<HarnessId, HarnessProbeCache>> {
  if (!isRecord(value)) {
    return {}
  }

  const probes: Partial<Record<HarnessId, HarnessProbeCache>> = {}

  for (const [id, probe] of Object.entries(value)) {
    if (HARNESS_IDS.has(id as HarnessId) && isHarnessProbeCache(probe)) {
      probes[id as HarnessId] = probe
    }
  }

  return probes
}

export function readHarnessCache(): HarnessCacheState | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(CACHE_PATH, 'utf8').replace(/^\uFEFF/, ''))

    if (
      !isRecord(parsed) ||
      (parsed.version !== 1 && parsed.version !== CACHE_VERSION) ||
      !Array.isArray(parsed.harnesses) ||
      !parsed.harnesses.every(isHarnessInfo)
    ) {
      return null
    }

    return {
      harnesses: parsed.harnesses,
      probes: parsed.version === CACHE_VERSION ? readProbes(parsed.probes) : {}
    }
  } catch {
    return null
  }
}

export function writeHarnessCache(
  harnesses: HarnessInfo[],
  probes: Partial<Record<HarnessId, HarnessProbeCache>>
): void {
  try {
    mkdirSync(CACHE_DIRECTORY, { recursive: true })

    const cache: HarnessCache = {
      version: CACHE_VERSION,
      updatedAt: new Date().toISOString(),
      harnesses,
      probes
    }

    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2))
  } catch {
    return
  }
}
