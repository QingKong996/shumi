import type { HarnessId } from '../harness'
import type { ShumiEvent, ShumiInput, ShumiPromptResponse, ShumiSessionOptions } from './events'

export type StartAgentSessionInput = {
  harness: HarnessId
  cwd: string
  model?: string
  effort?: string
}

export type StartAgentSessionResult = {
  sessionId: string
}

export type ShumiAgentApi = {
  start(input: StartAgentSessionInput): Promise<StartAgentSessionResult>
  send(sessionId: string, input: ShumiInput): Promise<void>
  cancel(sessionId: string): Promise<void>
  respond(sessionId: string, requestId: string, response: ShumiPromptResponse): Promise<void>
  setOptions(sessionId: string, options: ShumiSessionOptions): Promise<void>
  stop(sessionId: string): Promise<void>
  onEvent(listener: (event: ShumiEvent) => void): () => void
}
