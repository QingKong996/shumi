import type { HarnessId } from '../harness'

export type ShumiMessageRole = 'user' | 'assistant' | 'system'

export type ShumiMessageContent =
  { type: 'text'; text: string } | { type: 'reasoning'; text: string }

export type ShumiPromptOption = {
  id: string
  label: string
  tone?: 'default' | 'danger'
}

export type ShumiPromptQuestion = {
  id: string
  text: string
  options: ShumiPromptOption[]
  allowText?: boolean
  multiline?: boolean
  placeholder?: string
  initialValue?: string
}

export type ShumiPromptAnswer = {
  questionId: string
  optionId?: string
  text?: string
}

export type ShumiPromptResponse = {
  answers: ShumiPromptAnswer[]
  cancelled?: boolean
}

export type ShumiInputImage = { path: string; url?: never } | { url: string; path?: never }

export type ShumiInput = {
  text: string
  images?: ShumiInputImage[]
}

export type ShumiSessionOptions = {
  model?: string
  effort?: string
}

export type ShumiEventPayload =
  | {
      type: 'session.started'
      harness: HarnessId
      model: string | null
      effort: string | null
    }
  | { type: 'session.options'; model: string | null; effort: string | null }
  | { type: 'session.status'; status: 'idle' | 'running' | 'stopping' }
  | {
      type: 'session.ended'
      reason: 'stopped' | 'failed' | 'exited'
      message?: string
    }
  | { type: 'turn.started'; turnId: string }
  | {
      type: 'turn.completed'
      turnId: string
      status: 'completed' | 'failed' | 'cancelled'
      message?: string
    }
  | { type: 'message.started'; messageId: string; role: ShumiMessageRole }
  | {
      type: 'message.delta'
      messageId: string
      channel: 'text' | 'reasoning'
      delta: string
    }
  | {
      type: 'message.completed'
      messageId: string
      role: ShumiMessageRole
      content: ShumiMessageContent[]
    }
  | { type: 'tool.started'; toolCallId: string; name: string; input: unknown }
  | { type: 'tool.updated'; toolCallId: string; output: string }
  | {
      type: 'tool.completed'
      toolCallId: string
      name: string
      status: 'completed' | 'failed' | 'cancelled'
      input?: unknown
      output?: string
    }
  | {
      type: 'request.opened'
      requestId: string
      kind: 'approval' | 'question'
      title: string
      detail: string | null
      questions: ShumiPromptQuestion[]
    }
  | {
      type: 'request.closed'
      requestId: string
      outcome: 'answered' | 'cancelled' | 'expired'
    }
  | {
      type: 'usage.updated'
      inputTokens?: number
      outputTokens?: number
      totalTokens?: number
      contextTokens?: number
      contextWindow?: number
    }
  | { type: 'diagnostic'; level: 'info' | 'warning' | 'error'; message: string }

export type ShumiEvent = {
  id: string
  sessionId: string
  sequence: number
  timestamp: number
  payload: ShumiEventPayload
}
