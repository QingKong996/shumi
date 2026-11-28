import { readFileSync } from 'node:fs'

import { parse } from 'smol-toml'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function readJsonValue(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
}

export function readJsonObject(path: string): Record<string, unknown> | null {
  const parsed = readJsonValue(path)

  return isRecord(parsed) ? parsed : null
}

export function readTomlObject(path: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))

    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}
