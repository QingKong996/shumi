import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterAll, describe, expect, it, vi } from 'vitest'

import type { HarnessInfo } from '../../../../shared/harness'

const testEnvironment = vi.hoisted(() => ({
  home: ''
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  const fs = await import('node:fs')
  const path = await import('node:path')

  testEnvironment.home = fs.mkdtempSync(path.join(actual.tmpdir(), 'shumi-cache-test-'))

  return {
    ...actual,
    homedir: () => testEnvironment.home
  }
})

import { readHarnessCache, writeHarnessCache } from '../cache'

const cachePath = (): string => join(testEnvironment.home, '.shumi', 'harness-cache.json')
const writeRawCache = (value: string): void => {
  mkdirSync(join(testEnvironment.home, '.shumi'), { recursive: true })
  writeFileSync(cachePath(), value)
}

const harnesses: HarnessInfo[] = [
  {
    id: 'pi',
    name: 'Pi',
    command: 'pi',
    installed: true,
    version: '1.6.1',
    versionPending: false,
    models: []
  }
]

afterAll(() => {
  rmSync(testEnvironment.home, { recursive: true, force: true })
})

describe('harness cache', () => {
  it('writes and reads probe data', () => {
    writeHarnessCache(harnesses, {
      pi: {
        executable: 'C:\\bin\\pi.cmd',
        stamp: 'stamp',
        version: '1.6.1'
      }
    })

    expect(readHarnessCache()).toEqual({
      harnesses,
      probes: {
        pi: {
          executable: 'C:\\bin\\pi.cmd',
          stamp: 'stamp',
          version: '1.6.1'
        }
      }
    })
    expect(JSON.parse(readFileSync(cachePath(), 'utf8'))).toMatchObject({
      version: 2,
      harnesses
    })
  })

  it('ignores malformed cache files', () => {
    writeRawCache('{not-json')

    expect(readHarnessCache()).toBeNull()
  })

  it('reads v1 caches without probe data', () => {
    writeRawCache(JSON.stringify({ version: 1, harnesses }))

    expect(readHarnessCache()).toEqual({
      harnesses,
      probes: {}
    })
  })
})
