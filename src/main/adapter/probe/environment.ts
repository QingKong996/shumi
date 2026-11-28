import { homedir } from 'node:os'
import { delimiter, isAbsolute, join, resolve } from 'node:path'

export function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>()

  return paths.filter((path) => {
    const key = process.platform === 'win32' ? path.toLowerCase() : path

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export function splitPaths(path: string): string[] {
  return path
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function createEnvironment(path: string): NodeJS.ProcessEnv {
  const environment = { ...process.env }

  for (const key of Object.keys(environment)) {
    if (key.toLowerCase() === 'path') {
      delete environment[key]
    }
  }

  environment[process.platform === 'win32' ? 'Path' : 'PATH'] = path
  return environment
}

function expandHomePath(path: string): string {
  if (path === '~') {
    return homedir()
  }

  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return join(homedir(), path.slice(2))
  }

  return path
}

function resolveDirectoryFromEnvironment(
  configuredDirectory: string | undefined,
  defaultDirectory: string
): string {
  if (!configuredDirectory) {
    return defaultDirectory
  }

  const expandedDirectory = expandHomePath(configuredDirectory)
  return isAbsolute(expandedDirectory) ? expandedDirectory : resolve(expandedDirectory)
}

export function getPiAgentDir(): string {
  return resolveDirectoryFromEnvironment(
    process.env.PI_CODING_AGENT_DIR,
    join(homedir(), '.pi', 'agent')
  )
}

export function getCodexHome(): string {
  return resolveDirectoryFromEnvironment(process.env.CODEX_HOME, join(homedir(), '.codex'))
}

export { expandHomePath }
