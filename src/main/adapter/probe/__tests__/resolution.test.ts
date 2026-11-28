import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { HarnessDefinition } from '../definitions'
import { findInitialCommand } from '../resolution'
import { createTemporaryDirectory, writeExecutable, writeText } from './helpers'

const temporaryDirectories: Array<() => void> = []
const piDefinition: HarnessDefinition = {
  id: 'pi',
  name: 'Pi',
  command: 'pi'
}

afterEach(() => {
  for (const cleanup of temporaryDirectories.splice(0)) {
    cleanup()
  }
})

describe('initial command resolution', () => {
  it('uses a runnable cached command before searching PATH', () => {
    const temporaryDirectory = createTemporaryDirectory()
    temporaryDirectories.push(temporaryDirectory.cleanup)
    const commandPath = join(
      temporaryDirectory.path,
      'bin',
      process.platform === 'win32' ? 'cached-pi.cmd' : 'cached-pi'
    )

    writeExecutable(commandPath)
    writeText(join(temporaryDirectory.path, 'install', 'current-version'), '1.6.1')

    const resolution = findInitialCommand(piDefinition, '', commandPath)

    expect(resolution).toMatchObject({
      executable: commandPath
    })
    expect(resolution?.stamp).not.toBeNull()
    expect(resolution?.versionCommand.args.join(' ')).toContain('--version')
  })

  it('finds the command on the provided path', () => {
    const temporaryDirectory = createTemporaryDirectory()
    temporaryDirectories.push(temporaryDirectory.cleanup)
    const commandPath = join(
      temporaryDirectory.path,
      process.platform === 'win32' ? 'pi.cmd' : 'pi'
    )

    writeExecutable(commandPath)

    expect(findInitialCommand(piDefinition, temporaryDirectory.path)?.executable).toBe(commandPath)
  })
})
