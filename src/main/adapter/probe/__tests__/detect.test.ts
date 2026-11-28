import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { HarnessId, HarnessInfo } from '../../../../shared/harness'

const dependencies = vi.hoisted(() => ({
  findInitialCommand: vi.fn(),
  findCommandResolution: vi.fn(),
  readCommandVersionMetadata: vi.fn(),
  readVersion: vi.fn(),
  readHarnessConfiguration: vi.fn(),
  readHarnessCache: vi.fn(),
  writeHarnessCache: vi.fn(),
  resetEffectivePathCache: vi.fn()
}))

vi.mock('../resolution', () => ({
  findInitialCommand: dependencies.findInitialCommand,
  findCommandResolution: dependencies.findCommandResolution
}))

vi.mock('../version', () => ({
  readCommandVersionMetadata: dependencies.readCommandVersionMetadata,
  readVersion: dependencies.readVersion
}))

vi.mock('../configuration', () => ({
  readHarnessConfiguration: dependencies.readHarnessConfiguration
}))

vi.mock('../cache', () => ({
  readHarnessCache: dependencies.readHarnessCache,
  writeHarnessCache: dependencies.writeHarnessCache
}))

vi.mock('../windows', () => ({
  resetEffectivePathCache: dependencies.resetEffectivePathCache
}))

import { detectHarnesses } from '../detect'

function createCommandResolution(executable: string): {
  executable: string
  stamp: string
  versionCommand: {
    executable: string
    args: string[]
  }
} {
  return {
    executable,
    stamp: `${executable}-stamp`,
    versionCommand: {
      executable,
      args: ['--version']
    }
  }
}

function getModels(harnessId: HarnessId): HarnessInfo['models'] {
  return [
    {
      provider: harnessId,
      id: 'default-model',
      name: `${harnessId} model`,
      reasoningEffort: null,
      isDefault: true
    }
  ]
}

function getLatestHarnesses(callback: ReturnType<typeof vi.fn>): HarnessInfo[] {
  return callback.mock.calls.at(-1)?.[0] as HarnessInfo[]
}

beforeEach(() => {
  vi.resetAllMocks()
  dependencies.readHarnessCache.mockReturnValue(null)
  dependencies.readHarnessConfiguration.mockImplementation((harnessId: HarnessId) => ({
    models: getModels(harnessId)
  }))
})

describe('detectHarnesses', () => {
  it('returns initial results and fills versions asynchronously', async () => {
    dependencies.findInitialCommand.mockImplementation((definition: { id: HarnessId }) =>
      createCommandResolution(`${definition.id}-command`)
    )
    dependencies.readCommandVersionMetadata.mockReturnValue(null)
    const versionResolvers = new Map<string, (version: string) => void>()
    dependencies.readVersion.mockImplementation(
      (command: { executable: string }) =>
        new Promise((resolve) => {
          versionResolvers.set(command.executable, resolve)
        })
    )
    const onUpdated = vi.fn()

    const initial = await detectHarnesses(false, onUpdated)

    expect(initial).toHaveLength(2)
    expect(initial.every((harness) => harness.installed)).toBe(true)
    expect(initial.every((harness) => harness.versionPending)).toBe(true)
    expect(initial.every((harness) => harness.models.length === 1)).toBe(true)
    expect(initial.every((harness) => !('windowsPackage' in harness))).toBe(true)

    versionResolvers.get('pi-command')?.('1.6.1')
    versionResolvers.get('codex-command')?.('0.171.0')

    await vi.waitFor(() => {
      expect(getLatestHarnesses(onUpdated)?.every((harness) => harness.version)).toBe(true)
    })

    const settled = getLatestHarnesses(onUpdated)

    expect(settled.find((harness) => harness.id === 'pi')).toMatchObject({
      installed: true,
      version: '1.6.1',
      versionPending: false
    })
    expect(settled.find((harness) => harness.id === 'codex')).toMatchObject({
      installed: true,
      version: '0.171.0',
      versionPending: false
    })
    expect(dependencies.writeHarnessCache).toHaveBeenCalled()
  })

  it('uses metadata versions without running version commands', async () => {
    dependencies.findInitialCommand.mockImplementation((definition: { id: HarnessId }) =>
      createCommandResolution(`${definition.id}-command`)
    )
    dependencies.readCommandVersionMetadata.mockImplementation((harnessId: HarnessId) =>
      harnessId === 'pi' ? '1.6.1' : '0.171.0'
    )

    const harnesses = await detectHarnesses(true)

    expect(harnesses.map((harness) => harness.version)).toEqual(['1.6.1', '0.171.0'])
    expect(dependencies.readVersion).not.toHaveBeenCalled()
    expect(dependencies.resetEffectivePathCache).toHaveBeenCalledOnce()
    expect(dependencies.writeHarnessCache).toHaveBeenCalledOnce()
  })

  it('publishes not-installed results when fallback discovery fails', async () => {
    dependencies.findInitialCommand.mockReturnValue(null)
    dependencies.findCommandResolution.mockResolvedValue(null)
    const onUpdated = vi.fn()

    const initial = await detectHarnesses(false, onUpdated)

    expect(initial.every((harness) => !harness.installed)).toBe(true)
    expect(initial.every((harness) => harness.versionPending === false)).toBe(true)

    await vi.waitFor(() => {
      expect(onUpdated).toHaveBeenCalledTimes(2)
    })

    const settled = getLatestHarnesses(onUpdated)

    expect(settled.every((harness) => !harness.installed)).toBe(true)
    expect(settled.every((harness) => harness.version === null)).toBe(true)
    expect(dependencies.readCommandVersionMetadata).not.toHaveBeenCalled()
  })
})
