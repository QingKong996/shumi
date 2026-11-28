import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { getCommandStamp, readCommandVersionMetadata, readVersion } from '../version'
import { createTemporaryDirectory, writeExecutable, writeJson, writeText } from './helpers'

const temporaryDirectories: Array<() => void> = []

afterEach(() => {
  for (const cleanup of temporaryDirectories.splice(0)) {
    cleanup()
  }
})

describe('version metadata', () => {
  it('reads the Pi managed version file before other metadata', () => {
    const temporaryDirectory = createTemporaryDirectory()
    temporaryDirectories.push(temporaryDirectory.cleanup)
    const commandPath = join(
      temporaryDirectory.path,
      'bin',
      process.platform === 'win32' ? 'pi.cmd' : 'pi'
    )
    const versionPath = join(temporaryDirectory.path, 'install', 'current-version')

    writeExecutable(commandPath)
    writeText(versionPath, '1.6.1-beta.2')

    expect(readCommandVersionMetadata('pi', commandPath)).toBe('1.6.1-beta.2')
  })

  it.skipIf(process.platform !== 'win32')('reads a Windows npm shim package version', () => {
    const temporaryDirectory = createTemporaryDirectory()
    temporaryDirectories.push(temporaryDirectory.cleanup)
    const commandPath = join(temporaryDirectory.path, 'pi.cmd')

    writeExecutable(commandPath, '@echo off\r\nnode "%~dp0\\node_modules\\@scope\\pi\\bin.js" %*')
    writeJson(join(temporaryDirectory.path, 'node_modules', '@scope', 'pi', 'package.json'), {
      version: '2.4.0'
    })

    expect(readCommandVersionMetadata('codex', commandPath)).toBe('2.4.0')
  })

  it('changes the cache stamp when the Pi version file changes', () => {
    const temporaryDirectory = createTemporaryDirectory()
    temporaryDirectories.push(temporaryDirectory.cleanup)
    const commandPath = join(
      temporaryDirectory.path,
      'bin',
      process.platform === 'win32' ? 'pi.cmd' : 'pi'
    )
    const versionPath = join(temporaryDirectory.path, 'install', 'current-version')

    writeExecutable(commandPath)
    writeText(versionPath, '1.0.0')
    const firstStamp = getCommandStamp('pi', commandPath)

    writeText(versionPath, '1.0.1')
    const secondStamp = getCommandStamp('pi', commandPath)

    expect(firstStamp).not.toBeNull()
    expect(secondStamp).not.toBeNull()
    expect(secondStamp).not.toBe(firstStamp)
  })
})

describe('version command', () => {
  it('parses a version from command output', async () => {
    await expect(
      readVersion({
        executable: process.execPath,
        args: ['--version']
      })
    ).resolves.toMatch(/^\d+\.\d+\.\d+/)
  })
})
