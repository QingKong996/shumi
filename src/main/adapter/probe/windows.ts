import { join } from 'node:path'

import { COMMAND_TIMEOUT_MS, runCommand } from './command'
import { splitPaths, uniquePaths } from './environment'
import { isRunnableFile } from './paths'

const APP_MODEL_PACKAGES_KEY =
  'HKEY_CURRENT_USER\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages'

let effectivePathPromise: Promise<string> | null = null

function getRegistryExecutable(): string {
  return join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe')
}

function expandWindowsEnvironmentVariables(value: string): string {
  let expanded = value

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const next = expanded.replace(/%([^%]+)%/g, (reference, name: string) => {
      const environmentKey = Object.keys(process.env).find(
        (key) => key.toLowerCase() === name.toLowerCase()
      )
      const replacement = environmentKey ? process.env[environmentKey] : undefined

      return replacement ?? reference
    })

    if (next === expanded) {
      break
    }

    expanded = next
  }

  return expanded
}

async function readWindowsRegistryPath(key: string): Promise<string | null> {
  const result = await runCommand(getRegistryExecutable(), ['query', key, '/v', 'Path'], {
    timeout: COMMAND_TIMEOUT_MS
  })
  const match = `${result.stdout}\n${result.stderr}`.match(
    /^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/im
  )

  return match?.[1] ? expandWindowsEnvironmentVariables(match[1]) : null
}

async function findWindowsAppPackageKeys(packagePrefix: string): Promise<string[]> {
  const result = await runCommand(
    getRegistryExecutable(),
    ['query', APP_MODEL_PACKAGES_KEY, '/f', `${packagePrefix}*`, '/k', '/s'],
    {
      timeout: COMMAND_TIMEOUT_MS
    }
  )
  const prefix = `${APP_MODEL_PACKAGES_KEY}\\${packagePrefix}`
  const packageKeys = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix))

  return uniquePaths(packageKeys).sort((left, right) => right.localeCompare(left))
}

async function readWindowsAppPackageRoot(packageKey: string): Promise<string | null> {
  const result = await runCommand(
    getRegistryExecutable(),
    ['query', packageKey, '/v', 'PackageRootFolder'],
    {
      timeout: COMMAND_TIMEOUT_MS
    }
  )

  return (
    `${result.stdout}\n${result.stderr}`.match(
      /^\s*PackageRootFolder\s+REG_SZ\s+(.+?)\s*$/im
    )?.[1] ?? null
  )
}

export async function findWindowsAppPackageCommand(
  packagePrefix: string,
  executableParts: readonly string[]
): Promise<string | null> {
  if (process.platform !== 'win32') {
    return null
  }

  const packageKeys = await findWindowsAppPackageKeys(packagePrefix)

  for (const packageKey of packageKeys) {
    const root = await readWindowsAppPackageRoot(packageKey)
    const commandPath = root ? join(root, ...executableParts) : null

    if (commandPath && isRunnableFile(commandPath)) {
      return commandPath
    }
  }

  return null
}

async function resolveEffectivePath(): Promise<string> {
  const currentPath = process.env.Path ?? process.env.PATH ?? ''

  if (process.platform !== 'win32') {
    return currentPath
  }

  const [machinePath, userPath] = await Promise.all([
    readWindowsRegistryPath(
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
    ),
    readWindowsRegistryPath('HKCU\\Environment')
  ])

  return uniquePaths([
    ...splitPaths(machinePath ?? ''),
    ...splitPaths(userPath ?? ''),
    ...splitPaths(currentPath)
  ]).join(process.platform === 'win32' ? ';' : ':')
}

export function getEffectivePath(): Promise<string> {
  if (!effectivePathPromise) {
    effectivePathPromise = resolveEffectivePath()
  }

  return effectivePathPromise
}

export function resetEffectivePathCache(): void {
  effectivePathPromise = null
}
