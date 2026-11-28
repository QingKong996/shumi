import { execFile } from 'node:child_process'

export const COMMAND_TIMEOUT_MS = 10_000
export const VERSION_TIMEOUT_MS = 5_000
export const SHELL_TIMEOUT_MS = 10_000

export type CommandOptions = {
  timeout?: number
  env?: NodeJS.ProcessEnv
  windowsVerbatimArguments?: boolean
}

export type CommandResult = {
  error: unknown
  stdout: string
  stderr: string
}

export function runCommand(
  executable: string,
  args: string[],
  options: CommandOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      executable,
      args,
      {
        encoding: 'utf8',
        timeout: COMMAND_TIMEOUT_MS,
        windowsHide: true,
        ...options
      },
      (error, stdout, stderr) => {
        resolve({ error, stdout, stderr })
      }
    )
  })
}

export async function executeCommand(
  executable: string,
  args: string[],
  options: CommandOptions = {}
): Promise<string> {
  const result = await runCommand(executable, args, options)

  if (result.error) {
    throw result.error
  }

  return `${result.stdout}\n${result.stderr}`
}
