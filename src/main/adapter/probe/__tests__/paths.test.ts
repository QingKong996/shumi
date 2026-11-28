import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createTemporaryDirectory, writeExecutable } from './helpers'
import { findCommandOnPath, isRunnableFile } from '../paths'

const temporaryDirectories: Array<() => void> = []

afterEach(() => {
  for (const cleanup of temporaryDirectories.splice(0)) {
    cleanup()
  }
})

describe('path discovery', () => {
  it('recognizes files and rejects directories', () => {
    const temporaryDirectory = createTemporaryDirectory()
    temporaryDirectories.push(temporaryDirectory.cleanup)
    const commandPath = join(
      temporaryDirectory.path,
      process.platform === 'win32' ? 'pi.cmd' : 'pi'
    )

    writeExecutable(commandPath)

    expect(isRunnableFile(commandPath)).toBe(true)
    expect(isRunnableFile(temporaryDirectory.path)).toBe(false)
    expect(isRunnableFile(join(temporaryDirectory.path, 'missing'))).toBe(false)
  })

  it('finds an executable on the provided path', () => {
    const temporaryDirectory = createTemporaryDirectory()
    temporaryDirectories.push(temporaryDirectory.cleanup)
    const commandPath = join(
      temporaryDirectory.path,
      process.platform === 'win32' ? 'pi.cmd' : 'pi'
    )

    writeExecutable(commandPath)

    expect(findCommandOnPath('pi', temporaryDirectory.path)).toBe(commandPath)
    expect(findCommandOnPath('missing-shumi-command', temporaryDirectory.path)).toBeNull()
  })
})
