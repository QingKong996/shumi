import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'

export type JsonlRecord = Record<string, unknown>

export type JsonlRpcTransport = {
  readonly pid: number | null
  send(record: JsonlRecord): void
  onRecord(listener: (record: JsonlRecord) => void): () => void
  onClose(listener: (error: Error) => void): () => void
  close(error?: Error): Promise<void>
}

export type JsonlRpcReply =
  | { id: string | number; method?: string; result: unknown }
  | { id: string | number; method?: string; error: { code: number; message: string } }

export type JsonlRpcCodec = {
  encodeRequest(
    id: string,
    method: string,
    params: Record<string, unknown> | undefined
  ): JsonlRecord
  decodeReply(record: JsonlRecord): JsonlRpcReply | null
}

export type JsonlProcessSpec = {
  executable: string
  args?: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

type StreamTransportOptions = {
  stdin: Writable
  stdout: Readable
  stderr?: Readable
  pid?: number | null
  maxLineBytes?: number
  observeStdoutClose?: boolean
  close?: () => void | Promise<void>
}

const DEFAULT_MAX_LINE_BYTES = 32 * 1024 * 1024
const STDERR_TAIL_BYTES = 8 * 1024

export function createStreamJsonlRpcTransport(options: StreamTransportOptions): JsonlRpcTransport {
  const maxLineBytes = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES
  const recordListeners = new Set<(record: JsonlRecord) => void>()
  const closeListeners = new Set<(error: Error) => void>()
  const reader = createInterface({ input: options.stdout, crlfDelay: Infinity })
  let stderrTail = ''
  let closed = false
  let closeTask: Promise<void> | null = null

  const close = (error?: Error): Promise<void> => {
    const failure = error ?? new Error('Agent JSONL-RPC transport closed')

    if (!closed) {
      closed = true
      reader.close()

      for (const listener of [...closeListeners]) {
        listener(failure)
      }
    }

    closeTask ??= Promise.resolve(options.close?.()).then(() => undefined)
    return closeTask
  }

  reader.on('line', (line) => {
    if (closed || line.trim().length === 0) {
      return
    }

    if (Buffer.byteLength(line, 'utf8') > maxLineBytes) {
      void close(new Error(`Agent JSONL-RPC record exceeded ${maxLineBytes} bytes`))
      return
    }

    let parsed: unknown

    try {
      parsed = JSON.parse(line)
    } catch {
      void close(new Error('Agent JSONL-RPC sent invalid JSON'))
      return
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      void close(new Error('Agent JSONL-RPC sent a non-object record'))
      return
    }

    for (const listener of [...recordListeners]) {
      listener(parsed as JsonlRecord)
    }
  })

  options.stdout.on('error', (error) => {
    void close(error)
  })
  options.stdin.on('error', (error) => {
    void close(error)
  })
  options.stderr?.on('data', (chunk: Buffer | string) => {
    stderrTail = `${stderrTail}${chunk.toString()}`.slice(-STDERR_TAIL_BYTES)
  })

  if (options.observeStdoutClose !== false) {
    options.stdout.on('close', () => {
      const detail = stderrTail.trim()
      void close(
        new Error(detail ? `Agent RPC stream closed: ${detail}` : 'Agent RPC stream closed')
      )
    })
  }

  return {
    pid: options.pid ?? null,
    send(record) {
      if (closed) {
        throw new Error('Agent JSONL-RPC transport is closed')
      }

      const line = JSON.stringify(record)

      if (Buffer.byteLength(line, 'utf8') > maxLineBytes) {
        throw new Error(`Agent JSONL-RPC record exceeded ${maxLineBytes} bytes`)
      }

      options.stdin.write(`${line}\n`)
    },
    onRecord(listener) {
      recordListeners.add(listener)
      return () => recordListeners.delete(listener)
    },
    onClose(listener) {
      closeListeners.add(listener)
      return () => closeListeners.delete(listener)
    },
    close
  }
}

export function spawnJsonlRpcProcess(spec: JsonlProcessSpec): JsonlRpcTransport {
  const child = spawnProcess(spec)
  const transport = createStreamJsonlRpcTransport({
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
    pid: child.pid ?? null,
    observeStdoutClose: false,
    close: () => terminateChild(child)
  })

  child.on('error', (error) => {
    void transport.close(error)
  })
  child.on('close', (code, signal) => {
    const detail = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`
    void transport.close(new Error(`Agent process exited with ${detail}`))
  })

  return transport
}

export class JsonlRpcRequestError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message)
    this.name = 'JsonlRpcRequestError'
  }
}

export class JsonlRpcTimeoutError extends Error {
  constructor(method: string, timeoutMs: number) {
    super(`Agent did not answer ${method} within ${timeoutMs}ms`)
    this.name = 'JsonlRpcTimeoutError'
  }
}

type PendingRequest = {
  method: string
  resolve(value: unknown): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout> | null
}

export class JsonlRpcRequester {
  private sequence = 0
  private readonly pending = new Map<string, PendingRequest>()

  constructor(
    private readonly transport: JsonlRpcTransport,
    private readonly codec: JsonlRpcCodec,
    private readonly defaultTimeoutMs = 30_000
  ) {
    transport.onRecord((record) => this.handleRecord(record))
    transport.onClose((error) => this.rejectAll(error))
  }

  request(
    method: string,
    params?: Record<string, unknown>,
    options: { timeoutMs?: number | null } = {}
  ): Promise<unknown> {
    const id = String(++this.sequence)
    const timeoutMs = options.timeoutMs === undefined ? this.defaultTimeoutMs : options.timeoutMs

    return new Promise<unknown>((resolve, reject) => {
      const timer =
        timeoutMs === null
          ? null
          : setTimeout(() => {
              this.pending.delete(id)
              reject(new JsonlRpcTimeoutError(method, timeoutMs))
            }, timeoutMs)

      timer?.unref()
      this.pending.set(id, { method, resolve, reject, timer })

      try {
        this.transport.send(this.codec.encodeRequest(id, method, params))
      } catch (error) {
        this.pending.delete(id)

        if (timer) {
          clearTimeout(timer)
        }

        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private handleRecord(record: JsonlRecord): void {
    const reply = this.codec.decodeReply(record)

    if (!reply) {
      return
    }

    const id = String(reply.id)
    const pending = this.pending.get(id)

    if (!pending || (reply.method !== undefined && reply.method !== pending.method)) {
      return
    }

    this.pending.delete(id)

    if (pending.timer) {
      clearTimeout(pending.timer)
    }

    if ('error' in reply) {
      pending.reject(new JsonlRpcRequestError(reply.error.code, reply.error.message))
    } else {
      pending.resolve(reply.result)
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      if (pending.timer) {
        clearTimeout(pending.timer)
      }

      pending.reject(error)
    }

    this.pending.clear()
  }
}

function spawnProcess(spec: JsonlProcessSpec): ChildProcessWithoutNullStreams {
  const args = spec.args ?? []
  const options = {
    cwd: spec.cwd,
    env: spec.env,
    stdio: 'pipe' as const,
    windowsHide: true
  }

  if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(spec.executable)) {
    const command = [spec.executable, ...args].map(quoteWindowsArgument).join(' ')

    return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', command], options)
  }

  return spawn(spec.executable, args, options)
}

function quoteWindowsArgument(value: string): string {
  return /[\s"&|<>^]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value
}

function terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // The child may have exited between the check and the kill.
      }

      finish()
    }, 2_000)
    const finish = (): void => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      resolve()
    }

    child.once('close', finish)
    timer.unref()

    if (process.platform === 'win32' && child.pid) {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true
      })
      killer.on('error', () => {
        try {
          child.kill()
        } catch {
          finish()
        }
      })
      return
    }

    try {
      child.kill('SIGTERM')
    } catch {
      finish()
    }
  })
}
