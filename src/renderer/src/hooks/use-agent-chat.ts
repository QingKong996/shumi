import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  ShumiEvent,
  ShumiMessageContent,
  ShumiPromptQuestion,
  ShumiPromptResponse
} from '../../../shared/agent/events'
import type { HarnessId } from '../../../shared/harness'

export type WorkerChatStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'ended' | 'failed'

export type ChatMessageEntry = {
  kind: 'message'
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  reasoning: string
  streaming: boolean
}

export type ChatToolEntry = {
  kind: 'tool'
  id: string
  name: string
  input: unknown
  output: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
}

export type ChatNoticeEntry = {
  kind: 'notice'
  id: string
  level: 'info' | 'warning' | 'error'
  text: string
}

export type ChatEntry = ChatMessageEntry | ChatToolEntry | ChatNoticeEntry

export type ChatRequest = {
  requestId: string
  kind: 'approval' | 'question'
  title: string
  detail: string | null
  questions: ShumiPromptQuestion[]
}

export type ChatUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  contextTokens?: number
  contextWindow?: number
}

export type WorkerChat = {
  entries: ChatEntry[]
  status: WorkerChatStatus
  requests: ChatRequest[]
  usage: ChatUsage
  ended: boolean
}

export type WorkerAgentOptions = {
  model: string
  effort: string | null
}

export type AgentChatController = {
  chats: Record<string, WorkerChat>
  send: (
    workerId: string,
    harness: HarnessId,
    cwd: string,
    text: string,
    model: string | null,
    effort: string | null
  ) => Promise<void>
  setOptions: (workerId: string, options: WorkerAgentOptions) => Promise<boolean>
  cancel: (workerId: string) => Promise<void>
  respond: (workerId: string, requestId: string, response: ShumiPromptResponse) => Promise<void>
  removeWorkers: (workerIds: string[]) => void
}

const EMPTY_CHAT: WorkerChat = {
  entries: [],
  status: 'idle',
  requests: [],
  usage: {},
  ended: false
}

export function useAgentChat(): AgentChatController {
  const [chats, setChats] = useState<Record<string, WorkerChat>>({})
  const workerSessions = useRef(new Map<string, string>())
  const sessionWorkers = useRef(new Map<string, string>())
  const pendingStarts = useRef(new Map<string, Promise<string>>())
  const forgottenWorkers = useRef(new Set<string>())
  const terminalWorkers = useRef(new Set<string>())

  const updateChat = useCallback(
    (workerId: string, update: (chat: WorkerChat) => WorkerChat): void => {
      setChats((current) => {
        const chat = current[workerId] ?? EMPTY_CHAT
        const next = update(chat)

        return next === chat ? current : { ...current, [workerId]: next }
      })
    },
    []
  )

  const pushNotice = useCallback(
    (workerId: string, level: ChatNoticeEntry['level'], text: string): void => {
      updateChat(workerId, (chat) => ({
        ...chat,
        entries: [...chat.entries, { kind: 'notice', id: crypto.randomUUID(), level, text }]
      }))
    },
    [updateChat]
  )

  const ensureSession = (
    workerId: string,
    harness: HarnessId,
    cwd: string,
    model: string | null,
    effort: string | null
  ): Promise<string> => {
    if (terminalWorkers.current.has(workerId)) {
      throw new Error('This worker session has ended. Create a new worker to continue.')
    }

    const existing = workerSessions.current.get(workerId)

    if (existing) {
      return Promise.resolve(existing)
    }

    const pending = pendingStarts.current.get(workerId)

    if (pending) {
      return pending
    }

    updateChat(workerId, (chat) => ({ ...chat, status: 'starting' }))
    const start = window.api.agent
      .start({
        harness,
        cwd,
        ...(model ? { model } : {}),
        ...(effort ? { effort } : {})
      })
      .then(async ({ sessionId }) => {
        workerSessions.current.set(workerId, sessionId)
        sessionWorkers.current.set(sessionId, workerId)

        if (forgottenWorkers.current.has(workerId)) {
          await window.api.agent.stop(sessionId).catch(() => undefined)
          throw new Error('Worker was removed')
        }

        updateChat(workerId, (chat) => ({ ...chat, status: 'idle' }))
        return sessionId
      })
      .catch((error: unknown) => {
        updateChat(workerId, (chat) => ({ ...chat, status: 'failed' }))
        throw error
      })
      .finally(() => {
        pendingStarts.current.delete(workerId)
      })

    pendingStarts.current.set(workerId, start)
    return start
  }

  const send = async (
    workerId: string,
    harness: HarnessId,
    cwd: string,
    text: string,
    model: string | null,
    effort: string | null
  ): Promise<void> => {
    const message = text.trim()

    if (!message) {
      return
    }

    updateChat(workerId, (chat) => ({
      ...chat,
      entries: [
        ...chat.entries,
        {
          kind: 'message',
          id: crypto.randomUUID(),
          role: 'user',
          text: message,
          reasoning: '',
          streaming: false
        }
      ]
    }))

    try {
      const sessionId = await ensureSession(workerId, harness, cwd, model, effort)
      await window.api.agent.send(sessionId, { text: message })
    } catch (error) {
      updateChat(workerId, (chat) => ({ ...chat, status: 'failed' }))
      pushNotice(workerId, 'error', errorMessage(error))
    }
  }

  const setOptions = async (workerId: string, options: WorkerAgentOptions): Promise<boolean> => {
    const pending = pendingStarts.current.get(workerId)

    if (pending) {
      try {
        await pending
      } catch {
        return false
      }
    }

    const sessionId = workerSessions.current.get(workerId)

    if (!sessionId) {
      return true
    }

    try {
      await window.api.agent.setOptions(sessionId, {
        model: options.model,
        ...(options.effort ? { effort: options.effort } : {})
      })
      return true
    } catch (error) {
      pushNotice(workerId, 'error', errorMessage(error))
      return false
    }
  }

  const cancel = async (workerId: string): Promise<void> => {
    const sessionId = workerSessions.current.get(workerId)

    if (!sessionId) {
      return
    }

    try {
      await window.api.agent.cancel(sessionId)
    } catch (error) {
      pushNotice(workerId, 'error', errorMessage(error))
    }
  }

  const respond = async (
    workerId: string,
    requestId: string,
    response: ShumiPromptResponse
  ): Promise<void> => {
    const sessionId = workerSessions.current.get(workerId)

    if (!sessionId) {
      pushNotice(workerId, 'error', 'The worker is no longer connected')
      return
    }

    try {
      await window.api.agent.respond(sessionId, requestId, response)
    } catch (error) {
      pushNotice(workerId, 'error', errorMessage(error))
    }
  }

  const forgetWorker = (workerId: string): void => {
    const sessionId = workerSessions.current.get(workerId)

    forgottenWorkers.current.add(workerId)
    terminalWorkers.current.delete(workerId)
    workerSessions.current.delete(workerId)
    pendingStarts.current.delete(workerId)

    if (sessionId) {
      sessionWorkers.current.delete(sessionId)
      void window.api.agent.stop(sessionId).catch(() => undefined)
    }

    setChats((current) => {
      if (!(workerId in current)) {
        return current
      }

      const next = { ...current }

      delete next[workerId]
      return next
    })
  }

  const removeWorkers = (workerIds: string[]): void => {
    for (const workerId of workerIds) {
      forgetWorker(workerId)
    }
  }

  const handleEvent = useCallback(
    (event: ShumiEvent): void => {
      const workerId = sessionWorkers.current.get(event.sessionId)

      if (!workerId) {
        return
      }

      const payload = event.payload

      switch (payload.type) {
        case 'session.status':
          updateChat(workerId, (chat) => ({ ...chat, status: payload.status }))
          return
        case 'session.ended':
          terminalWorkers.current.add(workerId)
          workerSessions.current.delete(workerId)
          sessionWorkers.current.delete(event.sessionId)
          updateChat(workerId, (chat) => ({
            ...chat,
            status: payload.reason === 'failed' ? 'failed' : 'ended',
            entries: finishStreaming(chat.entries),
            requests: [],
            ended: true
          }))

          if (payload.message) {
            pushNotice(workerId, payload.reason === 'failed' ? 'error' : 'warning', payload.message)
          }

          return
        case 'turn.started':
          updateChat(workerId, (chat) => ({ ...chat, status: 'running' }))
          return
        case 'turn.completed':
          if (payload.status !== 'completed') {
            pushNotice(
              workerId,
              payload.status === 'failed' ? 'error' : 'warning',
              payload.message ?? `Turn ${payload.status}`
            )
          }
          return
        case 'message.started':
          if (payload.role === 'user') {
            return
          }

          if (payload.role === 'system') {
            return
          }

          updateChat(workerId, (chat) => ({
            ...chat,
            entries: ensureMessageEntry(chat.entries, payload.messageId)
          }))
          return
        case 'message.delta': {
          updateChat(workerId, (chat) => {
            const entries = ensureMessageEntry(chat.entries, payload.messageId)
            const nextEntries = entries.map((entry) =>
              entry.kind === 'message' && entry.id === payload.messageId
                ? {
                    ...entry,
                    text: payload.channel === 'text' ? entry.text + payload.delta : entry.text,
                    reasoning:
                      payload.channel === 'reasoning'
                        ? entry.reasoning + payload.delta
                        : entry.reasoning
                  }
                : entry
            )

            return { ...chat, entries: nextEntries }
          })
          return
        }
        case 'message.completed': {
          if (payload.role === 'user' || payload.role === 'system') {
            return
          }

          updateChat(workerId, (chat) => {
            const entries = ensureMessageEntry(chat.entries, payload.messageId)
            const content = messageContent(payload.content)

            return {
              ...chat,
              entries: entries.map((entry) =>
                entry.kind === 'message' && entry.id === payload.messageId
                  ? {
                      ...entry,
                      text: content.text || entry.text,
                      reasoning: content.reasoning || entry.reasoning,
                      streaming: false
                    }
                  : entry
              )
            }
          })
          return
        }
        case 'tool.started':
          updateChat(workerId, (chat) => ({
            ...chat,
            entries: chat.entries.some(
              (entry) => entry.kind === 'tool' && entry.id === payload.toolCallId
            )
              ? chat.entries
              : [
                  ...chat.entries,
                  {
                    kind: 'tool',
                    id: payload.toolCallId,
                    name: payload.name,
                    input: payload.input,
                    output: '',
                    status: 'running'
                  }
                ]
          }))
          return
        case 'tool.updated':
          updateChat(workerId, (chat) => ({
            ...chat,
            entries: chat.entries.map((entry) =>
              entry.kind === 'tool' && entry.id === payload.toolCallId
                ? { ...entry, output: payload.output }
                : entry
            )
          }))
          return
        case 'tool.completed':
          updateChat(workerId, (chat) => ({
            ...chat,
            entries: chat.entries.map((entry) =>
              entry.kind === 'tool' && entry.id === payload.toolCallId
                ? {
                    ...entry,
                    name: payload.name,
                    input: payload.input ?? entry.input,
                    output: payload.output ?? entry.output,
                    status: payload.status
                  }
                : entry
            )
          }))
          return
        case 'request.opened':
          updateChat(workerId, (chat) => ({
            ...chat,
            requests: [
              ...chat.requests.filter((request) => request.requestId !== payload.requestId),
              {
                requestId: payload.requestId,
                kind: payload.kind,
                title: payload.title,
                detail: payload.detail,
                questions: payload.questions
              }
            ]
          }))
          return
        case 'request.closed':
          updateChat(workerId, (chat) => ({
            ...chat,
            requests: chat.requests.filter((request) => request.requestId !== payload.requestId)
          }))
          return
        case 'usage.updated':
          updateChat(workerId, (chat) => ({
            ...chat,
            usage: {
              inputTokens: payload.inputTokens ?? chat.usage.inputTokens,
              outputTokens: payload.outputTokens ?? chat.usage.outputTokens,
              totalTokens: payload.totalTokens ?? chat.usage.totalTokens,
              contextTokens: payload.contextTokens ?? chat.usage.contextTokens,
              contextWindow: payload.contextWindow ?? chat.usage.contextWindow
            }
          }))
          return
        case 'diagnostic':
          pushNotice(workerId, payload.level, payload.message)
          return
        default:
          return
      }
    },
    [pushNotice, updateChat]
  )

  const handleEventRef = useRef(handleEvent)

  useEffect(() => {
    handleEventRef.current = handleEvent
  }, [handleEvent])

  useEffect(() => {
    return window.api.agent.onEvent((event) => {
      handleEventRef.current(event)
    })
  }, [])

  return {
    chats,
    send,
    setOptions,
    cancel,
    respond,
    removeWorkers
  }
}

function ensureMessageEntry(entries: ChatEntry[], messageId: string): ChatEntry[] {
  if (entries.some((entry) => entry.kind === 'message' && entry.id === messageId)) {
    return entries
  }

  return [
    ...entries,
    {
      kind: 'message',
      id: messageId,
      role: 'assistant',
      text: '',
      reasoning: '',
      streaming: true
    }
  ]
}

function finishStreaming(entries: ChatEntry[]): ChatEntry[] {
  return entries.map((entry) =>
    entry.kind === 'message' && entry.streaming ? { ...entry, streaming: false } : entry
  )
}

function messageContent(content: ShumiMessageContent[]): { text: string; reasoning: string } {
  let text = ''
  let reasoning = ''

  for (const block of content) {
    if (!isRecord(block) || typeof block.text !== 'string') {
      continue
    }

    if (block.type === 'text') {
      text += block.text
    } else if (block.type === 'reasoning') {
      reasoning += block.text
    }
  }

  return { text, reasoning }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
