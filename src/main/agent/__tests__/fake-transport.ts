import type { JsonlRecord, JsonlRpcTransport } from '../jsonl-rpc'

export class FakeJsonlRpcTransport implements JsonlRpcTransport {
  readonly pid = null
  readonly sent: JsonlRecord[] = []

  onSend: ((record: JsonlRecord) => void) | null = null

  private readonly recordListeners = new Set<(record: JsonlRecord) => void>()
  private readonly closeListeners = new Set<(error: Error) => void>()
  private closed = false

  send(record: JsonlRecord): void {
    if (this.closed) {
      throw new Error('Transport is closed')
    }

    this.sent.push(record)
    this.onSend?.(record)
  }

  onRecord(listener: (record: JsonlRecord) => void): () => void {
    this.recordListeners.add(listener)
    return () => this.recordListeners.delete(listener)
  }

  onClose(listener: (error: Error) => void): () => void {
    this.closeListeners.add(listener)
    return () => this.closeListeners.delete(listener)
  }

  emit(record: JsonlRecord): void {
    for (const listener of [...this.recordListeners]) {
      listener(record)
    }
  }

  close(error = new Error('Transport closed')): Promise<void> {
    if (!this.closed) {
      this.closed = true

      for (const listener of [...this.closeListeners]) {
        listener(error)
      }
    }

    return Promise.resolve()
  }
}

export function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
