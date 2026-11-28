import type {
  ShumiEventPayload,
  ShumiInput,
  ShumiPromptResponse,
  ShumiSessionOptions
} from '../../shared/agent/events'

export type HarnessEventSink = (event: ShumiEventPayload) => void

export type HarnessStartOptions = {
  cwd: string
  model?: string
  effort?: string
}

export type HarnessAdapterContext = {
  emit: HarnessEventSink
  requestTimeoutMs?: number
}

export interface HarnessAdapter {
  start(options: HarnessStartOptions): Promise<void>
  send(input: ShumiInput): Promise<void>
  cancel(): Promise<void>
  respond(requestId: string, response: ShumiPromptResponse): Promise<void>
  setOptions(options: ShumiSessionOptions): Promise<void>
  stop(): Promise<void>
}
