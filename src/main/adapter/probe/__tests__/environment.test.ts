import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createEnvironment,
  getCodexHome,
  getPiAgentDir,
  splitPaths,
  uniquePaths
} from '../environment'

const originalPiAgentDir = process.env.PI_CODING_AGENT_DIR
const originalCodexHome = process.env.CODEX_HOME

afterEach(() => {
  if (originalPiAgentDir === undefined) {
    delete process.env.PI_CODING_AGENT_DIR
  } else {
    process.env.PI_CODING_AGENT_DIR = originalPiAgentDir
  }

  if (originalCodexHome === undefined) {
    delete process.env.CODEX_HOME
  } else {
    process.env.CODEX_HOME = originalCodexHome
  }
})

describe('uniquePaths', () => {
  it('removes duplicates while preserving order', () => {
    expect(uniquePaths(['alpha', 'beta', 'alpha', 'gamma'])).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('normalizes case for duplicate detection on Windows', () => {
    if (process.platform !== 'win32') {
      return
    }

    expect(uniquePaths(['C:\\Tools', 'c:\\tools'])).toEqual(['C:\\Tools'])
  })
})

describe('splitPaths', () => {
  it('splits the platform path delimiter', () => {
    expect(splitPaths(['alpha', 'beta'].join(delimiter))).toEqual(['alpha', 'beta'])
  })
})

describe('createEnvironment', () => {
  it('replaces any existing PATH key with one canonical key', () => {
    const environment = createEnvironment('custom-path')
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
    const pathKeys = Object.keys(environment).filter((key) => key.toLowerCase() === 'path')

    expect(environment[pathKey]).toBe('custom-path')
    expect(pathKeys).toEqual([pathKey])
  })
})

describe('configuration directories', () => {
  it('uses configured Pi and Codex directories', () => {
    process.env.PI_CODING_AGENT_DIR = join(homedir(), 'custom-pi')
    process.env.CODEX_HOME = join(homedir(), 'custom-codex')

    expect(getPiAgentDir()).toBe(join(homedir(), 'custom-pi'))
    expect(getCodexHome()).toBe(join(homedir(), 'custom-codex'))
  })

  it('falls back to the default directories', () => {
    delete process.env.PI_CODING_AGENT_DIR
    delete process.env.CODEX_HOME

    expect(getPiAgentDir()).toBe(join(homedir(), '.pi', 'agent'))
    expect(getCodexHome()).toBe(join(homedir(), '.codex'))
  })
})
