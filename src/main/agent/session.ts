import type {
  ShumiEvent,
  ShumiInput,
  ShumiPromptResponse,
  ShumiSessionOptions
} from '../../shared/agent/events'
import type { HarnessAdapter, HarnessStartOptions } from './harness-adapter'
import { ShumiEventBus } from './event-bus'

export class ShumiAgentSession {
  private started = false

  constructor(
    readonly id: string,
    private readonly bus: ShumiEventBus,
    private readonly adapter: HarnessAdapter
  ) {}

  subscribe(listener: (event: ShumiEvent) => void): () => void {
    return this.bus.subscribe(listener)
  }

  async start(options: HarnessStartOptions): Promise<void> {
    if (this.started) {
      throw new Error('Agent session has already started')
    }

    try {
      await this.adapter.start(options)
      this.started = true
    } catch (error) {
      await this.adapter.stop().catch(() => undefined)
      this.bus.publish({
        type: 'session.ended',
        reason: 'failed',
        message: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  async send(input: ShumiInput): Promise<void> {
    this.assertLive()
    await this.adapter.send(input)
  }

  async cancel(): Promise<void> {
    this.assertLive()
    await this.adapter.cancel()
  }

  async respond(requestId: string, response: ShumiPromptResponse): Promise<void> {
    this.assertLive()
    await this.adapter.respond(requestId, response)
  }

  async setOptions(options: ShumiSessionOptions): Promise<void> {
    this.assertLive()
    await this.adapter.setOptions(options)
  }

  async stop(): Promise<void> {
    if (this.bus.isEnded) {
      return
    }

    this.bus.publish({ type: 'session.status', status: 'stopping' })

    try {
      await this.adapter.stop()
    } finally {
      this.bus.publish({ type: 'session.ended', reason: 'stopped' })
    }
  }

  private assertLive(): void {
    if (!this.started || this.bus.isEnded) {
      throw new Error('Agent session is not running')
    }
  }
}
