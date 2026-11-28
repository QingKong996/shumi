import { accessSync, constants as fsConstants, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { HarnessId } from '../../../shared/harness'
import type { HarnessDefinition } from './definitions'
import { getPiAgentDir, splitPaths, uniquePaths } from './environment'

type WindowsDirectoryListing = {
  mtimeMs: number
  entries: Map<string, string>
}

const windowsDirectoryCache = new Map<string, WindowsDirectoryListing>()

export function isRunnableFile(path: string): boolean {
  try {
    const stats = statSync(path)

    if (!stats.isFile()) {
      return false
    }

    if (process.platform !== 'win32') {
      accessSync(path, fsConstants.X_OK)
    }

    return true
  } catch {
    return false
  }
}

function getWindowsCommandNames(command: string): string[] {
  const extensions = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)

  return [
    ...extensions.map((extension) => `${command}${extension}`.toLowerCase()),
    command.toLowerCase()
  ]
}

function readWindowsDirectory(directory: string): Map<string, string> {
  try {
    const mtimeMs = statSync(directory).mtimeMs
    const cached = windowsDirectoryCache.get(directory)

    if (cached?.mtimeMs === mtimeMs) {
      return cached.entries
    }

    const entries = new Map<string, string>()

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        entries.set(entry.name.toLowerCase(), join(directory, entry.name))
      }
    }

    windowsDirectoryCache.set(directory, { mtimeMs, entries })
    return entries
  } catch {
    windowsDirectoryCache.delete(directory)
    return new Map()
  }
}

export function findWindowsCommands(command: string, path: string): string[] {
  const directories = uniquePaths([
    process.cwd(),
    ...splitPaths(path).map((entry) => entry.replace(/^"(.*)"$/, '$1'))
  ])
  const commandNames = getWindowsCommandNames(command)
  const commands: string[] = []

  for (const directory of directories) {
    const entries = readWindowsDirectory(directory)

    for (const commandName of commandNames) {
      const commandPath = entries.get(commandName)

      if (commandPath && isRunnableFile(commandPath)) {
        commands.push(commandPath)
      }
    }
  }

  return uniquePaths(commands)
}

function findUnixCommands(command: string, path: string): string[] {
  const commands: string[] = []

  for (const directory of uniquePaths(splitPaths(path))) {
    const commandPath = join(directory, command)

    if (isRunnableFile(commandPath)) {
      commands.push(commandPath)
    }
  }

  return uniquePaths(commands)
}

export function findCommandOnPath(command: string, path: string): string | null {
  return (
    (process.platform === 'win32'
      ? findWindowsCommands(command, path)
      : findUnixCommands(command, path))[0] ?? null
  )
}

function getKnownCommandDirectories(harnessId: HarnessId): string[] {
  const home = homedir()
  const appData = process.env.APPDATA
  const localAppData = process.env.LOCALAPPDATA
  const directories = [
    join(home, '.local', 'bin'),
    join(home, '.bun', 'bin'),
    appData ? join(appData, 'npm') : '',
    localAppData ? join(localAppData, 'pnpm') : '',
    localAppData ? join(localAppData, 'Yarn', 'bin') : '',
    localAppData ? join(localAppData, 'Volta', 'bin') : '',
    localAppData ? join(localAppData, 'Programs', 'OpenAI', 'Codex', 'bin') : ''
  ]

  if (harnessId === 'pi') {
    directories.unshift(join(getPiAgentDir(), 'bin'))
  }

  return uniquePaths(directories.filter(Boolean))
}

export function findKnownCommands(harness: HarnessDefinition): string[] {
  const commandNames =
    process.platform === 'win32' ? getWindowsCommandNames(harness.command) : [harness.command]
  const commands: string[] = []

  for (const directory of getKnownCommandDirectories(harness.id)) {
    for (const commandName of commandNames) {
      const commandPath = join(directory, commandName)

      if (isRunnableFile(commandPath)) {
        commands.push(commandPath)
      }
    }
  }

  return uniquePaths(commands)
}
