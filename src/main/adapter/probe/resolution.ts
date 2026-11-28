import type { HarnessDefinition } from './definitions'
import { findCommandOnPath, findKnownCommands, isRunnableFile } from './paths'
import { findShellCommand, toHostPath, type ShellProbeMatch } from './shells'
import {
  createNativeVersionCommand,
  getCommandStamp,
  getCommandStampForPath,
  type VersionCommand
} from './version'
import { findWindowsAppPackageCommand, getEffectivePath } from './windows'

export type CommandResolution = {
  executable: string
  stamp: string | null
  versionCommand: VersionCommand
}

function createNativeCommandResolution(
  harnessId: HarnessDefinition['id'],
  commandPath: string,
  path: string
): CommandResolution {
  return {
    executable: commandPath,
    stamp: getCommandStamp(harnessId, commandPath),
    versionCommand: createNativeVersionCommand(commandPath, path)
  }
}

function createShellCommandResolution(match: ShellProbeMatch): CommandResolution {
  const executable = toHostPath(match.executable)

  return {
    executable,
    stamp: getCommandStampForPath(executable),
    versionCommand: {
      executable: match.probe.executable,
      args: match.probe.versionArgs,
      ...(match.probe.env ? { env: match.probe.env } : {})
    }
  }
}

export async function findCommandResolution(
  harness: HarnessDefinition,
  currentPath: string
): Promise<CommandResolution | null> {
  let path = currentPath

  if (process.platform === 'win32') {
    path = await getEffectivePath()

    let commandPath: string | null | undefined =
      findCommandOnPath(harness.command, path) ?? findKnownCommands(harness)[0]

    if (!commandPath && harness.windowsPackage) {
      commandPath = await findWindowsAppPackageCommand(
        harness.windowsPackage.prefix,
        harness.windowsPackage.executable
      )
    }

    if (commandPath) {
      return createNativeCommandResolution(harness.id, commandPath, path)
    }
  }

  const shellMatch = await findShellCommand(harness.command, path)

  return shellMatch ? createShellCommandResolution(shellMatch) : null
}

export function findInitialCommand(
  harness: HarnessDefinition,
  currentPath: string,
  cachedExecutable?: string,
  preferCached = true
): CommandResolution | null {
  if (preferCached && cachedExecutable && isRunnableFile(cachedExecutable)) {
    return createNativeCommandResolution(harness.id, cachedExecutable, currentPath)
  }

  const commandPath =
    findCommandOnPath(harness.command, currentPath) ?? findKnownCommands(harness)[0] ?? null

  return commandPath ? createNativeCommandResolution(harness.id, commandPath, currentPath) : null
}
