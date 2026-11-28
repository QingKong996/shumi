import { join } from 'node:path'

import { SHELL_TIMEOUT_MS, executeCommand, runCommand } from './command'
import { createEnvironment, uniquePaths } from './environment'
import { findWindowsCommands } from './paths'

const SHELL_RESULT_MARKER = '__SHUMI_HARNESS_PATH__'

export type ShellProbe = {
  executable: string
  args: string[]
  versionArgs: string[]
  env?: NodeJS.ProcessEnv
}

export type ShellProbeMatch = {
  executable: string
  probe: ShellProbe
}

function createShellLookupScript(command: string): string {
  return `p=$(command -v ${command} 2>/dev/null) || exit 127; printf '${SHELL_RESULT_MARKER}%s\\n' "$p"`
}

function createShellVersionScript(command: string): string {
  return `p=$(command -v ${command} 2>/dev/null) || exit 127; printf '${SHELL_RESULT_MARKER}%s\\n' "$p"; ${command} --version 2>&1`
}

function parseShellProbeOutput(output: string): {
  found: boolean
  executable: string | null
} {
  const lines = output.split(/\r?\n/)
  const markerIndex = lines.findIndex((line) => line.startsWith(SHELL_RESULT_MARKER))

  if (markerIndex === -1) {
    return { found: false, executable: null }
  }

  return {
    found: true,
    executable: lines[markerIndex].slice(SHELL_RESULT_MARKER.length).trim() || null
  }
}

function isWslBashAlias(path: string): boolean {
  const normalizedPath = path.toLowerCase().replaceAll('/', '\\')

  return (
    normalizedPath.endsWith('\\windows\\system32\\bash.exe') ||
    normalizedPath.includes('\\microsoft\\windowsapps\\bash.exe')
  )
}

function getWindowsBashPaths(path: string): string[] {
  const programFiles = process.env.ProgramFiles
  const programFilesX86 = process.env['ProgramFiles(x86)']
  const localAppData = process.env.LOCALAPPDATA
  const pathsFromEnvironment = findWindowsCommands('bash', path).filter(
    (path) => !isWslBashAlias(path)
  )
  const knownPaths = [
    programFiles ? join(programFiles, 'Git', 'bin', 'bash.exe') : '',
    programFilesX86 ? join(programFilesX86, 'Git', 'bin', 'bash.exe') : '',
    localAppData ? join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe') : '',
    'C:\\msys64\\usr\\bin\\bash.exe',
    'C:\\cygwin64\\bin\\bash.exe',
    'C:\\cygwin\\bin\\bash.exe'
  ]

  return uniquePaths([...pathsFromEnvironment, ...knownPaths].filter(Boolean))
}

function getUnixShellPaths(): string[] {
  return uniquePaths(
    [
      process.env.SHELL ?? '',
      '/bin/bash',
      '/usr/bin/bash',
      '/usr/local/bin/bash',
      '/opt/homebrew/bin/bash',
      '/bin/zsh',
      '/usr/bin/zsh',
      '/bin/sh'
    ].filter(Boolean)
  )
}

async function getShellProbes(command: string, path: string): Promise<ShellProbe[]> {
  const shellPaths = process.platform === 'win32' ? getWindowsBashPaths(path) : getUnixShellPaths()
  const lookupScript = createShellLookupScript(command)
  const versionScript = createShellVersionScript(command)
  const env = createEnvironment(path)

  return shellPaths.flatMap((shellPath) =>
    ['-lc', '-ilc'].map((flag) => ({
      executable: shellPath,
      args: [flag, lookupScript],
      versionArgs: [flag, versionScript],
      env
    }))
  )
}

async function getWslProbes(command: string): Promise<ShellProbe[]> {
  if (process.platform !== 'win32') {
    return []
  }

  const wslExecutable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'wsl.exe')
  let distros: string[]

  try {
    const output = await executeCommand(wslExecutable, ['-l', '-q'])
    distros = uniquePaths(
      output
        .replaceAll('\0', '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
  } catch {
    return []
  }

  const lookupScript = createShellLookupScript(command)
  const versionScript = createShellVersionScript(command)

  return distros.map((distro) => ({
    executable: wslExecutable,
    args: ['-d', distro, '--', 'bash', '-lc', lookupScript],
    versionArgs: ['-d', distro, '--', 'bash', '-lc', versionScript]
  }))
}

async function findShellProbe(probes: ShellProbe[]): Promise<ShellProbeMatch | null> {
  if (probes.length === 0) {
    return null
  }

  return new Promise((resolve) => {
    let remaining = probes.length
    let settled = false

    for (const probe of probes) {
      void runCommand(probe.executable, probe.args, {
        ...(probe.env ? { env: probe.env } : {}),
        timeout: SHELL_TIMEOUT_MS
      }).then((result) => {
        if (settled) {
          return
        }

        const shellResult = parseShellProbeOutput(`${result.stdout}\n${result.stderr}`)

        if (shellResult.found) {
          settled = true
          resolve({
            probe,
            executable: shellResult.executable ?? probe.executable
          })
          return
        }

        remaining -= 1

        if (remaining === 0) {
          resolve(null)
        }
      })
    }
  })
}

export function toHostPath(path: string): string {
  if (process.platform !== 'win32') {
    return path
  }

  const windowsPath = path.match(/^\/([a-z])\/(.*)$/i)

  return windowsPath
    ? `${windowsPath[1].toUpperCase()}:\\${windowsPath[2].replaceAll('/', '\\')}`
    : path
}

export async function findShellCommand(
  command: string,
  path: string
): Promise<ShellProbeMatch | null> {
  const shellMatch = await findShellProbe(await getShellProbes(command, path))

  if (shellMatch) {
    return shellMatch
  }

  return findShellProbe(await getWslProbes(command))
}
