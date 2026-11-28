import type { ShumiEvent, ShumiEventPayload } from '../../shared/agent/events'

type ShumiEventListener = (event: ShumiEvent) => void

export class ShumiEventBus {
  private sequence = 0
  private ended = false
  private readonly listeners = new Set<ShumiEventListener>()

  constructor(private readonly sessionId: string) {}

  get isEnded(): boolean {
    return this.ended
  }

  subscribe(listener: ShumiEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  publish(payload: ShumiEventPayload): void {
    if (this.ended) {
      return
    }

    if (payload.type === 'session.ended') {
      this.ended = true
    }

    const sequence = ++this.sequence
    const event: ShumiEvent = {
      id: `${this.sessionId}:${sequence}`,
      sessionId: this.sessionId,
      sequence,
      timestamp: Date.now(),
      payload
    }

    for (const listener of [...this.listeners]) {
      listener(event)
    }
  }
}
