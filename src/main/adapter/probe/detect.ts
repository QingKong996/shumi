import type { HarnessId, HarnessInfo } from '../../../shared/harness'
import { readHarnessCache, writeHarnessCache, type HarnessProbeCache } from './cache'
import { readHarnessConfiguration } from './configuration'
import { HARNESS_DEFINITIONS, type HarnessDefinition } from './definitions'
import { findCommandResolution, findInitialCommand, type CommandResolution } from './resolution'
import { readCommandVersionMetadata, readVersion } from './version'
import { resetEffectivePathCache } from './windows'

type HarnessDetection = {
  info: HarnessInfo
  command: CommandResolution | null
  resolveCommand: (() => Promise<CommandResolution | null>) | null
}

let detectionSequence = 0

function readCachedVersion(
  command: CommandResolution | null,
  cachedProbe?: HarnessProbeCache
): string | null {
  return command?.stamp && cachedProbe?.stamp === command.stamp ? cachedProbe.version : null
}

function recordProbe(
  probes: Partial<Record<HarnessId, HarnessProbeCache>>,
  harnessId: HarnessId,
  command: CommandResolution,
  version: string | null
): void {
  if (!command.stamp) {
    return
  }

  probes[harnessId] = {
    executable: command.executable,
    stamp: command.stamp,
    version
  }
}

function detectHarness(
  harness: HarnessDefinition,
  currentPath: string,
  probes: Partial<Record<HarnessId, HarnessProbeCache>>,
  cachedHarness?: HarnessInfo,
  cachedProbe?: HarnessProbeCache,
  refresh = false
): HarnessDetection {
  const configuration = readHarnessConfiguration(harness.id)
  const command = findInitialCommand(harness, currentPath, cachedProbe?.executable, !refresh)
  const metadataVersion = command
    ? readCommandVersionMetadata(harness.id, command.executable)
    : null
  const cachedVersion =
    metadataVersion ?? (cachedHarness?.installed ? readCachedVersion(command, cachedProbe) : null)

  if (command && cachedVersion) {
    recordProbe(probes, harness.id, command, cachedVersion)
  }

  const installed = command !== null
  const versionPending = installed && cachedVersion === null

  return {
    info: {
      id: harness.id,
      name: harness.name,
      command: harness.command,
      models: configuration.models,
      installed,
      version: cachedVersion,
      versionPending
    },
    command,
    resolveCommand: command === null ? () => findCommandResolution(harness, currentPath) : null
  }
}

async function resolveHarness(
  detection: HarnessDetection,
  harnesses: HarnessInfo[],
  index: number,
  harnessId: HarnessId,
  probes: Partial<Record<HarnessId, HarnessProbeCache>>,
  publish: () => void
): Promise<void> {
  let command = detection.command
  let info = detection.info

  if (!command && detection.resolveCommand) {
    try {
      command = await detection.resolveCommand()
    } catch {
      command = null
    }

    if (!command) {
      delete probes[harnessId]
      harnesses[index] = { ...info, installed: false, version: null, versionPending: false }
      publish()
      return
    }

    const metadataVersion = readCommandVersionMetadata(harnessId, command.executable)

    if (metadataVersion) {
      recordProbe(probes, harnessId, command, metadataVersion)
      harnesses[index] = {
        ...info,
        installed: true,
        version: metadataVersion,
        versionPending: false
      }
      publish()
      return
    }

    info = { ...info, installed: true, version: null, versionPending: true }
    harnesses[index] = info
    publish()
  }

  if (!command) {
    return
  }

  if (!info.versionPending && info.version !== null) {
    return
  }

  try {
    const version = await readVersion(command.versionCommand)

    recordProbe(probes, harnessId, command, version)
    harnesses[index] = {
      ...info,
      installed: true,
      version,
      versionPending: false
    }
  } catch {
    recordProbe(probes, harnessId, command, null)
    harnesses[index] = {
      ...info,
      installed: true,
      version: null,
      versionPending: false
    }
  }

  publish()
}

export async function detectHarnesses(
  refresh = false,
  onUpdated?: (harnesses: HarnessInfo[]) => void
): Promise<HarnessInfo[]> {
  const cached = readHarnessCache()
  const cachedHarnesses = cached?.harnesses ?? null

  if (refresh) {
    resetEffectivePathCache()
  }

  const sequence = ++detectionSequence
  const probes = { ...cached?.probes }
  const cachedHarnessesById = new Map(cachedHarnesses?.map((harness) => [harness.id, harness]))
  const currentPath = process.env.Path ?? process.env.PATH ?? ''
  const detections = HARNESS_DEFINITIONS.map((definition) =>
    detectHarness(
      definition,
      currentPath,
      probes,
      cachedHarnessesById.get(definition.id),
      cached?.probes[definition.id],
      refresh
    )
  )
  const harnesses = detections.map((detection) => detection.info)
  const pending = detections.filter(
    (detection) => detection.resolveCommand !== null || detection.info.versionPending === true
  )

  if (pending.length === 0) {
    writeHarnessCache(harnesses, probes)
    return harnesses
  }

  const publish = (): void => {
    if (sequence !== detectionSequence) {
      return
    }

    writeHarnessCache(harnesses, probes)
    onUpdated?.(harnesses.map((harness) => ({ ...harness })))
  }

  void Promise.all(
    detections.map((detection, index) =>
      pending.includes(detection)
        ? resolveHarness(
            detection,
            harnesses,
            index,
            HARNESS_DEFINITIONS[index].id,
            probes,
            publish
          )
        : Promise.resolve()
    )
  ).catch(() => undefined)

  return harnesses
}
