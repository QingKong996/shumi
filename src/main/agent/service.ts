import { randomUUID } from 'node:crypto'

import type {
  ShumiAgentApi,
  StartAgentSessionInput,
  StartAgentSessionResult
} from '../../shared/agent/api'
import type {
  ShumiEvent,
  ShumiInput,
  ShumiPromptResponse,
  ShumiSessionOptions
} from '../../shared/agent/events'
import { ShumiEventBus } from './event-bus'
import { createHarnessAdapter } from './harness-launch'
import { ShumiAgentSession } from './session'

export type ShumiAgentService = ShumiAgentApi & {
  dispose(): Promise<void>
}

export function createShumiAgentService(): ShumiAgentService {
  const sessions = new Map<string, ShumiAgentSession>()
  const listeners = new Set<(event: ShumiEvent) => void>()
  let disposed = false

  const requireSession = (sessionId: string): ShumiAgentSession => {
    const session = sessions.get(sessionId)

    if (!session) {
      throw new Error(`Unknown agent session: ${sessionId}`)
    }

    return session
  }

  const service: ShumiAgentService = {
    async start(input: StartAgentSessionInput): Promise<StartAgentSessionResult> {
      if (disposed) {
        throw new Error('Agent service is shutting down')
      }

      const sessionId = randomUUID()
      const bus = new ShumiEventBus(sessionId)
      const adapter = await createHarnessAdapter(input.harness, input.cwd, {
        emit: (event) => bus.publish(event)
      })

      if (disposed) {
        await adapter.stop().catch(() => undefined)
        throw new Error('Agent service is shutting down')
      }

      const session = new ShumiAgentSession(sessionId, bus, adapter)
      const unsubscribe = session.subscribe((event) => {
        for (const listener of [...listeners]) {
          listener(event)
        }

        if (event.payload.type === 'session.ended') {
          unsubscribe()
          sessions.delete(sessionId)
        }
      })

      sessions.set(sessionId, session)

      try {
        await session.start(input)
      } catch (error) {
        sessions.delete(sessionId)
        unsubscribe()
        throw error
      }

      return { sessionId }
    },
    send(sessionId: string, input: ShumiInput): Promise<void> {
      return requireSession(sessionId).send(input)
    },
    cancel(sessionId: string): Promise<void> {
      return requireSession(sessionId).cancel()
    },
    respond(sessionId: string, requestId: string, response: ShumiPromptResponse): Promise<void> {
      return requireSession(sessionId).respond(requestId, response)
    },
    setOptions(sessionId: string, options: ShumiSessionOptions): Promise<void> {
      return requireSession(sessionId).setOptions(options)
    },
    stop(sessionId: string): Promise<void> {
      return requireSession(sessionId).stop()
    },
    onEvent(listener: (event: ShumiEvent) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async dispose(): Promise<void> {
      disposed = true
      const active = [...sessions.values()]
      sessions.clear()
      await Promise.all(active.map((session) => session.stop().catch(() => undefined)))
      listeners.clear()
    }
  }

  return service
}
