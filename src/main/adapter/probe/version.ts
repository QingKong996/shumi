import { readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import type { HarnessId } from '../../../shared/harness'
import { VERSION_TIMEOUT_MS, runCommand } from './command'
import { createEnvironment } from './environment'
import { getNonEmptyString, readJsonObject } from './files'

export type VersionCommand = {
  executable: string
  args: string[]
  env?: NodeJS.ProcessEnv
  windowsVerbatimArguments?: boolean
}

function parseVersion(output: string): string | null {
  const versionMatch = output.match(/\bv?(\d+\.\d+\.\d+(?:[-+][0-9a-z.-]+)?)\b/i)

  return versionMatch?.[1] ?? null
}

function getPiVersionFile(commandPath: string): string {
  return join(dirname(commandPath), '..', 'install', 'current-version')
}

function readPiManagedVersion(commandPath: string): string | null {
  try {
    return parseVersion(readFileSync(getPiVersionFile(commandPath), 'utf8'))
  } catch {
    return null
  }
}

function readPackageVersion(directory: string): string | null {
  const packageJson = readJsonObject(join(directory, 'package.json'))

  return parseVersion(getNonEmptyString(packageJson?.version) ?? '')
}

function findPackageVersion(commandPath: string): string | null {
  let directory = dirname(commandPath)
  let insideNodeModules = false

  for (let depth = 0; depth < 12; depth += 1) {
    if (basename(directory).toLowerCase() === 'node_modules') {
      insideNodeModules = true
    }

    if (insideNodeModules) {
      const version = readPackageVersion(directory)

      if (version) {
        return version
      }
    }

    const parent = dirname(directory)

    if (parent === directory) {
      break
    }

    directory = parent
  }

  return null
}

function readNpmShimVersion(commandPath: string): string | null {
  if (process.platform !== 'win32' || !/\.(?:cmd|bat|ps1)$/i.test(commandPath)) {
    return null
  }

  try {
    const stats = statSync(commandPath)

    if (stats.size > 64 * 1024) {
      return null
    }

    const shim = readFileSync(commandPath, 'utf8').replaceAll('\\', '/')
    const packagePath = shim.match(/\/node_modules\/((?:@[^/"'\s]+\/)?[^/"'\s]+)/)?.[1]

    if (!packagePath) {
      return null
    }

    return readPackageVersion(join(dirname(commandPath), 'node_modules', ...packagePath.split('/')))
  } catch {
    return null
  }
}

export function readCommandVersionMetadata(
  harnessId: HarnessId,
  commandPath: string
): string | null {
  const managedVersion = harnessId === 'pi' ? readPiManagedVersion(commandPath) : null

  return managedVersion ?? findPackageVersion(commandPath) ?? readNpmShimVersion(commandPath)
}

export function getCommandStamp(harnessId: HarnessId, commandPath: string): string | null {
  try {
    const stats = statSync(commandPath)
    const parts = [
      process.platform === 'win32' ? commandPath.toLowerCase() : commandPath,
      String(stats.size),
      String(stats.mtimeMs)
    ]

    if (harnessId === 'pi') {
      const versionFile = getPiVersionFile(commandPath)
      const versionStats = statSync(versionFile)
      parts.push(String(versionStats.mtimeMs), readFileSync(versionFile, 'utf8').trim())
    }

    return parts.join(':')
  } catch {
    return null
  }
}

export function getCommandStampForPath(commandPath: string): string | null {
  try {
    const stats = statSync(commandPath)

    return [
      process.platform === 'win32' ? commandPath.toLowerCase() : commandPath,
      String(stats.size),
      String(stats.mtimeMs)
    ].join(':')
  } catch {
    return null
  }
}

export function createNativeVersionCommand(commandPath: string, path: string): VersionCommand {
  const isWindowsScript = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(commandPath)
  const executable = isWindowsScript ? (process.env.ComSpec ?? 'cmd.exe') : commandPath
  const args = isWindowsScript ? ['/d', '/s', '/c', `""${commandPath}" --version"`] : ['--version']

  return {
    executable,
    args,
    env: createEnvironment(path),
    windowsVerbatimArguments: isWindowsScript
  }
}

export function readVersion(command: VersionCommand): Promise<string | null> {
  return runCommand(command.executable, command.args, {
    timeout: VERSION_TIMEOUT_MS,
    ...(command.env ? { env: command.env } : {}),
    ...(command.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {})
  }).then((result) => parseVersion(`${result.stdout}\n${result.stderr}`))
}
