import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

import type {
  ShumiEventPayload,
  ShumiInput,
  ShumiInputImage,
  ShumiMessageContent,
  ShumiMessageRole,
  ShumiPromptQuestion,
  ShumiPromptResponse,
  ShumiSessionOptions
} from '../../../shared/agent/events'
import type { HarnessAdapter, HarnessAdapterContext, HarnessStartOptions } from '../harness-adapter'
import {
  JsonlRpcRequester,
  type JsonlRpcCodec,
  type JsonlRpcTransport,
  type JsonlRecord
} from '../jsonl-rpc'

type PiState = {
  model: { provider: string; id: string } | null
  effort: string | null
  isStreaming: boolean
}

type PiDialog =
  | {
      id: string | number
      method: 'confirm'
    }
  | {
      id: string | number
      method: 'select'
      options: string[]
    }
  | {
      id: string | number
      method: 'input' | 'editor'
    }

type ActiveMessage = {
  id: string
  role: ShumiMessageRole
  text: string
  reasoning: string
}

const PI_REQUEST_TIMEOUT_MS = 30_000
const PI_DECORATIONS = new Set([
  'notify',
  'setStatus',
  'setWidget',
  'setTitle',
  'setEditorText',
  'set_editor_text'
])
const PI_IMAGE_MIME: Readonly<Record<string, string>> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

const PI_CODEC: JsonlRpcCodec = {
  encodeRequest(id, method, params) {
    return { ...(params ?? {}), type: method, id }
  },
  decodeReply(record) {
    if (record.type !== 'response' || typeof record.success !== 'boolean') {
      return null
    }

    const id = record.id

    if (typeof id !== 'string' && typeof id !== 'number') {
      return null
    }

    const method = typeof record.command === 'string' ? record.command : undefined

    return record.success
      ? { id, ...(method ? { method } : {}), result: record.data }
      : {
          id,
          ...(method ? { method } : {}),
          error: {
            code: -32000,
            message:
              typeof record.error === 'string' ? record.error : `Pi rejected ${method ?? 'request'}`
          }
        }
  }
}

export class PiHarnessAdapter implements HarnessAdapter {
  private readonly requester: JsonlRpcRequester
  private readonly dialogs = new Map<string, PiDialog>()
  private state: PiState = { model: null, effort: null, isStreaming: false }
  private activeTurnId: string | null = null
  private turnOrdinal = 0
  private messageOrdinal = 0
  private activeMessage: ActiveMessage | null = null
  private stopping = false

  constructor(
    private readonly transport: JsonlRpcTransport,
    private readonly context: HarnessAdapterContext
  ) {
    this.requester = new JsonlRpcRequester(
      transport,
      PI_CODEC,
      context.requestTimeoutMs ?? PI_REQUEST_TIMEOUT_MS
    )
    transport.onRecord((record) => this.handleRecord(record))
    transport.onClose((error) => this.handleClose(error))
  }

  async start(options: HarnessStartOptions): Promise<void> {
    this.state = parsePiState(await this.readState())

    if (options.model) {
      await this.applyModel(options.model)
    }

    if (options.effort) {
      await this.applyEffort(options.effort)
    }

    this.emit({
      type: 'session.started',
      harness: 'pi',
      model: this.modelValue(),
      effort: this.state.effort
    })
    this.emit({ type: 'session.status', status: 'idle' })
  }

  async send(input: ShumiInput): Promise<void> {
    const images = await readPiImages(input.images ?? [])

    if (input.text.length === 0 && images.length === 0) {
      throw new Error('Pi prompt is empty')
    }

    this.transport.send({
      type: 'prompt',
      message: input.text,
      images,
      streamingBehavior: this.activeTurnId || this.state.isStreaming ? 'steer' : 'followUp'
    })
  }

  async cancel(): Promise<void> {
    if (!this.activeTurnId && !this.state.isStreaming) {
      return
    }

    await this.requester.request('abort', {}, { timeoutMs: 5_000 })
  }

  async respond(requestId: string, response: ShumiPromptResponse): Promise<void> {
    const dialog = this.dialogs.get(requestId)

    if (!dialog) {
      throw new Error(`Pi is not waiting on ${requestId}`)
    }

    const reply = piDialogReply(dialog, response)

    this.transport.send({ type: 'extension_ui_response', id: dialog.id, ...reply })
    this.dialogs.delete(requestId)
    this.emit({
      type: 'request.closed',
      requestId,
      outcome: response.cancelled ? 'cancelled' : 'answered'
    })
  }

  async setOptions(options: ShumiSessionOptions): Promise<void> {
    if (options.model !== undefined) {
      await this.applyModel(options.model)
    }

    if (options.effort !== undefined) {
      await this.applyEffort(options.effort)
    }

    this.emit({
      type: 'session.options',
      model: this.modelValue(),
      effort: this.state.effort
    })
  }

  async stop(): Promise<void> {
    if (this.stopping) {
      return
    }

    this.stopping = true
    await this.transport.close()
  }

  private emit(event: ShumiEventPayload): void {
    this.context.emit(event)
  }

  private readState(): Promise<unknown> {
    return this.requester.request('get_state', {}, { timeoutMs: null })
  }

  private async applyModel(model: string): Promise<void> {
    const parsed = parseModelReference(model, this.state.model)

    if (!parsed) {
      throw new Error(`Pi model must be provider/model or use the current provider: ${model}`)
    }

    await this.requester.request('set_model', {
      provider: parsed.provider,
      modelId: parsed.id
    })
    this.state = { ...this.state, model: parsed }
  }

  private async applyEffort(effort: string): Promise<void> {
    await this.requester.request('set_thinking_level', { level: effort })
    this.state = { ...this.state, effort }
  }

  private modelValue(): string | null {
    return this.state.model ? `${this.state.model.provider}/${this.state.model.id}` : null
  }

  private handleRecord(record: JsonlRecord): void {
    if (record.type === 'response') {
      if (
        record.command === 'prompt' &&
        record.success === false &&
        typeof record.error === 'string'
      ) {
        this.emit({ type: 'diagnostic', level: 'error', message: record.error })
      }

      return
    }

    switch (record.type) {
      case 'agent_start':
        this.openTurn()
        return
      case 'message_start':
        this.openMessage(record)
        return
      case 'message_update':
        this.updateMessage(record)
        return
      case 'message_end':
        this.closeMessage(record)
        return
      case 'tool_execution_start':
        this.openTool(record)
        return
      case 'tool_execution_update':
        this.updateTool(record)
        return
      case 'tool_execution_end':
        this.closeTool(record)
        return
      case 'turn_end':
        this.updateUsage(record.message)
        return
      case 'agent_settled':
        this.closeTurn(record.aborted === true)
        return
      case 'compaction_start':
      case 'auto_compaction_start':
        this.emit({ type: 'diagnostic', level: 'info', message: 'Pi is compacting context' })
        return
      case 'auto_retry_start':
        this.emit({ type: 'diagnostic', level: 'warning', message: 'Pi is retrying the request' })
        return
      case 'auto_retry_end':
        if (record.success !== true) {
          this.emit({
            type: 'diagnostic',
            level: 'error',
            message: typeof record.finalError === 'string' ? record.finalError : 'Pi retry failed'
          })
        }
        return
      case 'extension_ui_request':
        this.openDialog(record)
        return
      default:
        return
    }
  }

  private openTurn(): void {
    if (this.activeTurnId) {
      return
    }

    this.activeTurnId = `pi-turn-${++this.turnOrdinal}`
    this.state = { ...this.state, isStreaming: true }
    this.emit({ type: 'turn.started', turnId: this.activeTurnId })
    this.emit({ type: 'session.status', status: 'running' })
  }

  private closeTurn(aborted: boolean): void {
    this.finishActiveMessage()

    if (!this.activeTurnId) {
      return
    }

    this.emit({
      type: 'turn.completed',
      turnId: this.activeTurnId,
      status: aborted ? 'cancelled' : 'completed'
    })
    this.activeTurnId = null
    this.state = { ...this.state, isStreaming: false }
    this.emit({ type: 'session.status', status: 'idle' })
  }

  private openMessage(record: JsonlRecord): void {
    if (this.activeMessage) {
      return
    }

    const message = isRecord(record.message) ? record.message : null
    const role = readPiRole(message?.role)
    const id = `pi-message-${++this.messageOrdinal}`

    this.activeMessage = { id, role, text: '', reasoning: '' }
    this.emit({ type: 'message.started', messageId: id, role })
  }

  private updateMessage(record: JsonlRecord): void {
    const update = isRecord(record.assistantMessageEvent) ? record.assistantMessageEvent : null

    if (!update) {
      return
    }

    if (!this.activeMessage) {
      this.openMessage(record)
    }

    if (!this.activeMessage) {
      return
    }

    const delta = typeof update.delta === 'string' ? update.delta : ''

    if (delta.length === 0) {
      return
    }

    if (update.type === 'thinking_delta') {
      this.activeMessage.reasoning += delta
      this.emit({
        type: 'message.delta',
        messageId: this.activeMessage.id,
        channel: 'reasoning',
        delta
      })
    } else if (update.type === 'text_delta') {
      this.activeMessage.text += delta
      this.emit({
        type: 'message.delta',
        messageId: this.activeMessage.id,
        channel: 'text',
        delta
      })
    }
  }

  private closeMessage(record: JsonlRecord): void {
    if (!this.activeMessage) {
      this.openMessage(record)
    }

    const message = isRecord(record.message) ? record.message : null
    const content = piMessageContent(message)

    if (content.length === 0 && this.activeMessage) {
      content.push(
        ...(this.activeMessage.reasoning
          ? [{ type: 'reasoning' as const, text: this.activeMessage.reasoning }]
          : []),
        ...(this.activeMessage.text
          ? [{ type: 'text' as const, text: this.activeMessage.text }]
          : [])
      )
    }

    this.completeMessage(content)
    this.updateUsage(message)
  }

  private finishActiveMessage(): void {
    if (!this.activeMessage) {
      return
    }

    const content: ShumiMessageContent[] = [
      ...(this.activeMessage.reasoning
        ? [{ type: 'reasoning' as const, text: this.activeMessage.reasoning }]
        : []),
      ...(this.activeMessage.text ? [{ type: 'text' as const, text: this.activeMessage.text }] : [])
    ]
    this.completeMessage(content)
  }

  private completeMessage(content: ShumiMessageContent[]): void {
    if (!this.activeMessage) {
      return
    }

    this.emit({
      type: 'message.completed',
      messageId: this.activeMessage.id,
      role: this.activeMessage.role,
      content
    })
    this.activeMessage = null
  }

  private openTool(record: JsonlRecord): void {
    if (typeof record.toolCallId !== 'string' || typeof record.toolName !== 'string') {
      return
    }

    this.emit({
      type: 'tool.started',
      toolCallId: record.toolCallId,
      name: record.toolName,
      input: record.args ?? null
    })
  }

  private updateTool(record: JsonlRecord): void {
    if (typeof record.toolCallId !== 'string') {
      return
    }

    const output = piToolOutput(record.partialResult ?? record.result)

    if (output !== null) {
      this.emit({ type: 'tool.updated', toolCallId: record.toolCallId, output })
    }
  }

  private closeTool(record: JsonlRecord): void {
    if (typeof record.toolCallId !== 'string' || typeof record.toolName !== 'string') {
      return
    }

    const output = piToolOutput(record.result)

    this.emit({
      type: 'tool.completed',
      toolCallId: record.toolCallId,
      name: record.toolName,
      status: record.isError === true ? 'failed' : 'completed',
      ...(record.args === undefined ? {} : { input: record.args }),
      ...(output === null ? {} : { output })
    })
  }

  private updateUsage(value: unknown): void {
    const usage = isRecord(value) && isRecord(value.usage) ? value.usage : null

    if (!usage) {
      return
    }

    const inputTokens = readNumber(usage.input)
    const outputTokens = readNumber(usage.output)

    if (inputTokens === undefined && outputTokens === undefined) {
      return
    }

    this.emit({
      type: 'usage.updated',
      ...(inputTokens === undefined ? {} : { inputTokens }),
      ...(outputTokens === undefined ? {} : { outputTokens }),
      ...(inputTokens === undefined || outputTokens === undefined
        ? {}
        : { totalTokens: inputTokens + outputTokens })
    })
  }

  private openDialog(record: JsonlRecord): void {
    const method = typeof record.method === 'string' ? record.method : ''

    if (PI_DECORATIONS.has(method)) {
      return
    }

    if (typeof record.id !== 'string' && typeof record.id !== 'number') {
      return
    }

    const dialog = piDialog(record)
    const requestId = String(record.id)

    if (!dialog) {
      this.transport.send({ type: 'extension_ui_response', id: record.id, cancelled: true })
      return
    }

    this.dialogs.set(requestId, dialog)
    this.emit({
      type: 'request.opened',
      requestId,
      kind: dialog.method === 'confirm' ? 'approval' : 'question',
      title: typeof record.title === 'string' ? record.title : method,
      detail: typeof record.message === 'string' ? record.message : null,
      questions: [piQuestion(dialog, record)]
    })
  }

  private handleClose(error: Error): void {
    this.state = { ...this.state, isStreaming: false }

    if (this.stopping) {
      return
    }

    this.finishActiveMessage()

    if (this.activeTurnId) {
      this.emit({
        type: 'turn.completed',
        turnId: this.activeTurnId,
        status: 'failed',
        message: error.message
      })
      this.activeTurnId = null
    }

    this.emit({ type: 'session.ended', reason: 'exited', message: error.message })
  }
}

function parsePiState(value: unknown): PiState {
  const record = isRecord(value) ? value : {}
  const model = isRecord(record.model) ? record.model : null
  const provider = readString(model?.provider)
  const id = readString(model?.id)

  return {
    model: provider && id ? { provider, id } : null,
    effort: readString(record.thinkingLevel),
    isStreaming: record.isStreaming === true
  }
}

function parseModelReference(
  value: string,
  current: PiState['model']
): { provider: string; id: string } | null {
  const separator = value.indexOf('/')

  if (separator > 0 && separator < value.length - 1) {
    return { provider: value.slice(0, separator), id: value.slice(separator + 1) }
  }

  return current && value.length > 0 ? { provider: current.provider, id: value } : null
}

function piQuestion(dialog: PiDialog, record: JsonlRecord): ShumiPromptQuestion {
  if (dialog.method === 'confirm') {
    return {
      id: 'confirm',
      text: typeof record.title === 'string' ? record.title : 'Confirm',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No', tone: 'danger' as const }
      ]
    }
  }

  if (dialog.method === 'select') {
    return {
      id: 'select',
      text: typeof record.title === 'string' ? record.title : 'Select an option',
      options: dialog.options.map((label, index) => ({
        id: `option-${index}`,
        label: label || 'Empty value'
      }))
    }
  }

  return {
    id: 'input',
    text: typeof record.title === 'string' ? record.title : 'Input',
    options: [],
    allowText: true,
    ...(dialog.method === 'editor' ? { multiline: true } : {}),
    ...(typeof record.placeholder === 'string' ? { placeholder: record.placeholder } : {}),
    ...(typeof record.prefill === 'string' ? { initialValue: record.prefill } : {})
  }
}

function piDialog(record: JsonlRecord): PiDialog | null {
  const id = record.id

  if (typeof id !== 'string' && typeof id !== 'number') {
    return null
  }

  if (record.method === 'confirm') {
    return { id, method: 'confirm' }
  }

  if (record.method === 'select') {
    const options = Array.isArray(record.options)
      ? record.options.filter((option): option is string => typeof option === 'string')
      : []
    return options.length > 0 ? { id, method: 'select', options } : null
  }

  if (record.method === 'input' || record.method === 'editor') {
    return { id, method: record.method }
  }

  return null
}

function piDialogReply(dialog: PiDialog, response: ShumiPromptResponse): Record<string, unknown> {
  if (response.cancelled) {
    return { cancelled: true }
  }

  const answer = response.answers[0]

  if (!answer) {
    throw new Error('Pi dialog requires an answer')
  }

  if (dialog.method === 'confirm') {
    const value = answer.optionId ?? answer.text

    if (value !== 'yes' && value !== 'no') {
      throw new Error('Pi confirmation must answer yes or no')
    }

    return { confirmed: value === 'yes' }
  }

  if (dialog.method === 'select') {
    const index = answer.optionId?.startsWith('option-')
      ? Number(answer.optionId.slice('option-'.length))
      : Number.NaN

    if (!Number.isInteger(index) || index < 0 || index >= dialog.options.length) {
      throw new Error('Pi selection must choose an offered option')
    }

    return { value: dialog.options[index] }
  }

  return { value: answer.text ?? '' }
}

function piMessageContent(message: JsonlRecord | null): ShumiMessageContent[] {
  if (!message) {
    return []
  }

  if (typeof message.content === 'string') {
    return message.content.length > 0 ? [{ type: 'text', text: message.content }] : []
  }

  if (!Array.isArray(message.content)) {
    return []
  }

  const content: ShumiMessageContent[] = []

  for (const block of message.content) {
    if (!isRecord(block)) {
      continue
    }

    if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
      content.push({ type: 'text', text: block.text })
    } else if (
      block.type === 'thinking' &&
      typeof block.thinking === 'string' &&
      block.thinking.length > 0
    ) {
      content.push({ type: 'reasoning', text: block.thinking })
    }
  }

  return content
}

function piToolOutput(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }

  if (isRecord(value) && Array.isArray(value.content)) {
    const text = value.content
      .flatMap((block) => (isRecord(block) && typeof block.text === 'string' ? [block.text] : []))
      .join('\n')
    return text.length > 0 ? text : null
  }

  return typeof value === 'string' ? value : JSON.stringify(value)
}

function readPiRole(value: unknown): ShumiMessageRole {
  return value === 'user' || value === 'system' ? value : 'assistant'
}

async function readPiImages(
  images: ShumiInputImage[]
): Promise<Array<{ type: 'image'; data: string; mimeType: string }>> {
  const result: Array<{ type: 'image'; data: string; mimeType: string }> = []

  for (const image of images) {
    if (!image.path) {
      throw new Error('Pi RPC accepts image files, not URLs')
    }

    const path = image.path
    const mimeType = PI_IMAGE_MIME[extname(path).toLowerCase()]

    if (!mimeType) {
      throw new Error(`Pi does not support image type ${extname(path) || 'unknown'}`)
    }

    const data = await readFile(path)
    result.push({ type: 'image', data: data.toString('base64'), mimeType })
  }

  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
