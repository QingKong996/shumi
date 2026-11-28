import type { HarnessId } from '../../shared/harness'
import { HARNESS_DEFINITIONS } from '../adapter/probe/definitions'
import { findCommandResolution } from '../adapter/probe/resolution'
import { CodexHarnessAdapter } from './adapters/codex'
import { PiHarnessAdapter } from './adapters/pi'
import type { HarnessAdapter, HarnessAdapterContext } from './harness-adapter'
import { spawnJsonlRpcProcess } from './jsonl-rpc'

export async function createHarnessAdapter(
  harness: HarnessId,
  cwd: string,
  context: HarnessAdapterContext
): Promise<HarnessAdapter> {
  const definition = HARNESS_DEFINITIONS.find((entry) => entry.id === harness)

  if (!definition) {
    throw new Error(`Unknown agent harness: ${harness}`)
  }

  const resolution = await findCommandResolution(
    definition,
    process.env.Path ?? process.env.PATH ?? ''
  )

  if (!resolution) {
    throw new Error(`${definition.name} CLI was not found on this machine`)
  }

  const transport = spawnJsonlRpcProcess({
    executable: resolution.executable,
    args: harness === 'pi' ? ['--mode', 'rpc'] : ['app-server'],
    cwd,
    env: { ...process.env }
  })

  return harness === 'pi'
    ? new PiHarnessAdapter(transport, context)
    : new CodexHarnessAdapter(transport, context)
}
