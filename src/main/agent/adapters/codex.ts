import { randomUUID } from 'node:crypto'

import type {
  ShumiEventPayload,
  ShumiInput,
  ShumiMessageContent,
  ShumiMessageRole,
  ShumiPromptOption,
  ShumiPromptQuestion,
  ShumiPromptResponse,
  ShumiSessionOptions
} from '../../../shared/agent/events'
import type { HarnessAdapter, HarnessAdapterContext, HarnessStartOptions } from '../harness-adapter'
import {
  JsonlRpcRequestError,
  JsonlRpcRequester,
  type JsonlRpcCodec,
  type JsonlRpcTransport,
  type JsonlRecord
} from '../jsonl-rpc'

type CodexTurnStatus = 'completed' | 'failed' | 'cancelled'

type ActiveMessage = {
  id: string
  role: ShumiMessageRole
  text: string
  reasoning: string
}

type ActiveTool = {
  id: string
  name: string
  input: unknown
  output: string
}

type PendingServerRequest = {
  id: string | number
  method: string
  kind: 'approval' | 'question' | 'mcp-approval'
  questions: ShumiPromptQuestion[]
  optionAnswers: Map<string, string>
}

type ServerReply = { result: unknown } | { error: { code: number; message: string } }

const CODEX_REQUEST_TIMEOUT_MS = 30_000
const APPROVAL_DECISIONS = ['accept', 'acceptForSession', 'decline', 'cancel'] as const
const MCP_APPROVAL_DECISIONS = ['accept', 'acceptForSession', 'cancel'] as const
const APPROVAL_LABELS: Record<string, string> = {
  accept: 'Allow',
  acceptForSession: 'Allow for this session',
  decline: 'Deny',
  cancel: 'Stop'
}
const MCP_APPROVAL_LABELS: Record<string, string> = {
  accept: 'Allow',
  acceptForSession: 'Allow for this session',
  cancel: 'Deny'
}

const CODEX_CODEC: JsonlRpcCodec = {
  encodeRequest(id, method, params) {
    const numericId = Number(id)

    return {
      id: Number.isSafeInteger(numericId) ? numericId : id,
      method,
      ...(params === undefined ? {} : { params })
    }
  },
  decodeReply(record) {
    if (typeof record.id !== 'string' && typeof record.id !== 'number') {
      return null
    }

    if (isRecord(record.error)) {
      return {
        id: record.id,
        error: {
          code: readNumber(record.error.code) ?? -32000,
          message: readString(record.error.message) ?? 'Codex app-server request failed'
        }
      }
    }

    return 'result' in record ? { id: record.id, result: record.result } : null
  }
}

export class CodexHarnessAdapter implements HarnessAdapter {
  private readonly requester: JsonlRpcRequester
  private readonly activeMessages = new Map<string, ActiveMessage>()
  private readonly activeTools = new Map<string, ActiveTool>()
  private readonly pendingRequests = new Map<string, PendingServerRequest>()
  private sendQueue = Promise.resolve()
  private threadId: string | null = null
  private model: string | null = null
  private effort: string | null = null
  private activeTurnId: string | null = null
  private ready = false
  private ended = false
  private stopping = false

  constructor(
    private readonly transport: JsonlRpcTransport,
    private readonly context: HarnessAdapterContext
  ) {
    this.requester = new JsonlRpcRequester(
      transport,
      CODEX_CODEC,
      context.requestTimeoutMs ?? CODEX_REQUEST_TIMEOUT_MS
    )
    transport.onRecord((record) => this.handleRecord(record))
    transport.onClose((error) => this.handleClose(error))
  }

  async start(options: HarnessStartOptions): Promise<void> {
    try {
      await this.requester.request(
        'initialize',
        {
          clientInfo: {
            name: 'shumi_desktop',
            title: 'Shumi',
            version: '1.0.0'
          },
          capabilities: {
            experimentalApi: true,
            requestAttestation: false,
            mcpServerOpenaiFormElicitation: false,
            extensions: {
              'openai/standard-form-input': {}
            }
          }
        },
        { timeoutMs: 15_000 }
      )
      this.transport.send({ method: 'initialized' })

      const opened = await this.requester.request(
        'thread/start',
        {
          cwd: options.cwd,
          threadSource: 'user',
          ...(options.model ? { model: options.model } : {})
        },
        { timeoutMs: 30_000 }
      )
      const result = readRecord(opened)
      const thread = readRecord(result.thread)

      this.threadId = readThreadId(opened)

      if (!this.threadId) {
        throw new Error('Codex app-server did not return a thread id')
      }

      this.model = readString(result.model) ?? readString(thread.model) ?? options.model ?? null
      this.effort =
        readString(result.reasoningEffort) ??
        readString(result.effort) ??
        readString(thread.reasoningEffort) ??
        options.effort ??
        null
      this.ready = true

      this.emit({
        type: 'session.started',
        harness: 'codex',
        model: this.model,
        effort: this.effort
      })
      this.emit({ type: 'session.status', status: 'idle' })
    } catch (error) {
      this.stopping = true
      await this.transport.close().catch(() => undefined)
      throw error
    }
  }

  send(input: ShumiInput): Promise<void> {
    const operation = this.sendQueue.then(() => this.performSend(input))

    this.sendQueue = operation.catch(() => undefined)
    return operation
  }

  async cancel(): Promise<void> {
    if (!this.threadId) {
      return
    }

    if (!this.activeTurnId) {
      await this.sendQueue
    }

    const turnId = this.activeTurnId

    if (!turnId) {
      return
    }

    try {
      await this.requester.request(
        'turn/interrupt',
        {
          threadId: this.threadId,
          turnId
        },
        { timeoutMs: 5_000 }
      )
    } catch (error) {
      if (error instanceof JsonlRpcRequestError && error.code === -32600) {
        return
      }

      throw error
    }
  }

  async respond(requestId: string, response: ShumiPromptResponse): Promise<void> {
    const pending = this.pendingRequests.get(requestId)

    if (!pending) {
      throw new Error(`Codex app-server is not waiting on ${requestId}`)
    }

    const reply = codexServerReply(pending, response)

    if ('error' in reply) {
      this.transport.send({ id: pending.id, error: reply.error })
    } else {
      this.transport.send({ id: pending.id, result: reply.result })
    }

    this.pendingRequests.delete(requestId)
    this.emit({
      type: 'request.closed',
      requestId,
      outcome: response.cancelled ? 'cancelled' : 'answered'
    })
  }

  async setOptions(options: ShumiSessionOptions): Promise<void> {
    if (options.model !== undefined) {
      this.model = options.model
    }

    if (options.effort !== undefined) {
      this.effort = options.effort
    }

    this.emit({
      type: 'session.options',
      model: this.model,
      effort: this.effort
    })
  }

  async stop(): Promise<void> {
    if (this.stopping) {
      return
    }

    this.stopping = true
    await this.transport.close()
  }

  private async performSend(input: ShumiInput): Promise<void> {
    if (!this.threadId) {
      throw new Error('Codex app-server has no open thread')
    }

    const turnInput = codexTurnInput(input)

    if (turnInput.length === 0) {
      throw new Error('Codex prompt is empty')
    }

    const clientUserMessageId = randomUUID()

    if (this.activeTurnId) {
      try {
        await this.requester.request(
          'turn/steer',
          {
            threadId: this.threadId,
            expectedTurnId: this.activeTurnId,
            clientUserMessageId,
            input: turnInput
          },
          { timeoutMs: 30_000 }
        )
        return
      } catch (error) {
        if (!(error instanceof JsonlRpcRequestError) || error.code !== -32600) {
          throw error
        }

        this.activeTurnId = null
      }
    }

    await this.requester
      .request(
        'turn/start',
        {
          threadId: this.threadId,
          clientUserMessageId,
          input: turnInput,
          ...(this.model ? { model: this.model } : {}),
          ...(this.effort ? { effort: this.effort } : {})
        },
        { timeoutMs: 30_000 }
      )
      .then((result) => {
        const turnId = readTurnId(result)

        if (turnId) {
          this.adoptTurn(turnId)
        }

        return turnId
      })
  }

  private emit(event: ShumiEventPayload): void {
    this.context.emit(event)
  }

  private handleRecord(record: JsonlRecord): void {
    const method = readString(record.method)

    if (!method || 'result' in record || isRecord(record.error)) {
      return
    }

    if (typeof record.id === 'string' || typeof record.id === 'number') {
      this.handleServerRequest(record.id, method, record.params)
      return
    }

    this.handleNotification(method, record.params)
  }

  private handleNotification(method: string, params: unknown): void {
    const incomingThreadId = readThreadId(params)

    if (incomingThreadId && this.threadId && incomingThreadId !== this.threadId) {
      return
    }

    if (!this.ready) {
      if (method === 'error' || method === 'warning' || method === 'configWarning') {
        this.handleDiagnostic(method, params)
      }
      return
    }

    switch (method) {
      case 'thread/status/changed':
        this.updateStatus(params)
        return
      case 'turn/started': {
        const turnId = readTurnId(params)

        if (turnId) {
          this.adoptTurn(turnId)
        }
        return
      }
      case 'turn/completed':
        this.completeTurn(params)
        return
      case 'item/started':
        this.openItem(params)
        return
      case 'item/completed':
        this.closeItem(params)
        return
      case 'item/agentMessage/delta':
        this.appendItemDelta(params, 'text')
        return
      case 'item/plan/delta':
        this.appendItemDelta(params, 'text')
        return
      case 'item/reasoning/textDelta':
      case 'item/reasoning/summaryTextDelta':
        this.appendItemDelta(params, 'reasoning')
        return
      case 'item/reasoning/summaryPartAdded':
        this.appendItemDelta({ ...readRecord(params), delta: '\n' }, 'reasoning')
        return
      case 'item/commandExecution/outputDelta':
      case 'item/fileChange/outputDelta':
      case 'item/mcpToolCall/progress':
        this.appendToolDelta(params)
        return
      case 'item/fileChange/patchUpdated':
        this.updateToolSnapshot(params)
        return
      case 'thread/tokenUsage/updated':
        this.updateUsage(params)
        return
      case 'serverRequest/resolved':
        this.closeResolvedRequest(params)
        return
      case 'thread/closed':
        this.handleThreadClosed(params)
        return
      case 'thread/compacted':
        this.emit({
          type: 'diagnostic',
          level: 'info',
          message: 'Codex compacted the context'
        })
        return
      case 'error':
      case 'warning':
      case 'guardianWarning':
      case 'configWarning':
      case 'deprecationNotice':
        this.handleDiagnostic(method, params)
        return
      default:
        return
    }
  }

  private updateStatus(params: unknown): void {
    const status = readRecord(readRecord(params).status)
    const type = readString(status.type)

    if (type === 'active') {
      this.emit({ type: 'session.status', status: 'running' })
      return
    }

    if (type === 'idle') {
      this.emit({ type: 'session.status', status: 'idle' })
      return
    }

    if (type === 'systemError') {
      this.emit({
        type: 'diagnostic',
        level: 'error',
        message: readString(status.message) ?? 'Codex thread entered a system error'
      })
    }
  }

  private adoptTurn(turnId: string): void {
    if (this.activeTurnId === turnId) {
      return
    }

    this.activeTurnId = turnId
    this.emit({ type: 'turn.started', turnId })
    this.emit({ type: 'session.status', status: 'running' })
  }

  private completeTurn(params: unknown): void {
    const turnId = readTurnId(params) ?? this.activeTurnId

    if (!turnId) {
      return
    }

    const status = codexTurnStatus(readTurnStatus(params))
    const message = readTurnErrorMessage(params)

    this.closeRemainingMessages()
    this.closeRemainingTools(status)

    if (this.activeTurnId === turnId) {
      this.activeTurnId = null
    }

    this.emit({
      type: 'turn.completed',
      turnId,
      status,
      ...(message ? { message } : {})
    })
    this.emit({ type: 'session.status', status: 'idle' })
  }

  private openItem(params: unknown): void {
    const item = readRecord(readRecord(params).item)
    const itemId = readString(item.id)

    if (!itemId) {
      return
    }

    const type = readString(item.type) ?? 'unknown'

    if (codexMessageRole(type)) {
      this.ensureMessage(itemId, codexMessageRole(type) ?? 'assistant')
      this.appendInitialMessageContent(itemId, item, type)
      return
    }

    this.ensureTool(itemId, codexToolName(item), codexToolInput(item))
  }

  private closeItem(params: unknown): void {
    const item = readRecord(readRecord(params).item)
    const itemId = readString(item.id)

    if (!itemId) {
      return
    }

    const type = readString(item.type) ?? 'unknown'
    const role = codexMessageRole(type)

    if (role) {
      const message = this.ensureMessage(itemId, role)
      const itemText = extractItemText(item, type)
      const text = type === 'reasoning' ? message.text : (itemText ?? message.text)
      const reasoning = type === 'reasoning' ? (itemText ?? message.reasoning) : message.reasoning

      this.completeMessage(itemId, role, reasoning, text)
      return
    }

    const tool = this.ensureTool(itemId, codexToolName(item), codexToolInput(item))
    tool.name = codexToolName(item)
    tool.input = codexToolInput(item)
    const output = extractToolOutput(item) ?? tool.output

    this.activeTools.delete(itemId)
    this.emit({
      type: 'tool.completed',
      toolCallId: itemId,
      name: codexToolName(item) ?? tool.name,
      status: codexToolStatus(item),
      input: tool.input,
      ...(output ? { output } : {})
    })
  }

  private appendItemDelta(params: unknown, channel: 'text' | 'reasoning'): void {
    const record = readRecord(params)
    const itemId = readString(record.itemId)
    const delta = readString(record.delta)

    if (!itemId || delta === null) {
      return
    }

    const message = this.ensureMessage(itemId, 'assistant')

    if (channel === 'reasoning') {
      message.reasoning += delta
    } else {
      message.text += delta
    }

    this.emit({
      type: 'message.delta',
      messageId: itemId,
      channel,
      delta
    })
  }

  private appendInitialMessageContent(itemId: string, item: JsonlRecord, type: string): void {
    const text = extractItemText(item, type)

    if (!text) {
      return
    }

    const message = this.ensureMessage(itemId, codexMessageRole(type) ?? 'assistant')
    const channel = type === 'reasoning' ? 'reasoning' : 'text'

    if (channel === 'reasoning') {
      message.reasoning += text
    } else {
      message.text += text
    }

    this.emit({
      type: 'message.delta',
      messageId: itemId,
      channel,
      delta: text
    })
  }

  private ensureMessage(itemId: string, role: ShumiMessageRole): ActiveMessage {
    const existing = this.activeMessages.get(itemId)

    if (existing) {
      return existing
    }

    const message: ActiveMessage = {
      id: itemId,
      role,
      text: '',
      reasoning: ''
    }

    this.activeMessages.set(itemId, message)
    this.emit({ type: 'message.started', messageId: itemId, role })
    return message
  }

  private completeMessage(
    itemId: string,
    role: ShumiMessageRole,
    reasoning: string,
    text: string
  ): void {
    const content: ShumiMessageContent[] = [
      ...(reasoning ? [{ type: 'reasoning' as const, text: reasoning }] : []),
      ...(text ? [{ type: 'text' as const, text }] : [])
    ]

    this.activeMessages.delete(itemId)
    this.emit({
      type: 'message.completed',
      messageId: itemId,
      role,
      content
    })
  }

  private ensureTool(itemId: string, name: string, input: unknown): ActiveTool {
    const existing = this.activeTools.get(itemId)

    if (existing) {
      return existing
    }

    const tool: ActiveTool = {
      id: itemId,
      name,
      input,
      output: ''
    }

    this.activeTools.set(itemId, tool)
    this.emit({
      type: 'tool.started',
      toolCallId: itemId,
      name,
      input
    })
    return tool
  }

  private appendToolDelta(params: unknown): void {
    const record = readRecord(params)
    const itemId = readString(record.itemId)
    const delta = readString(record.delta) ?? readString(record.text) ?? readString(record.progress)

    if (!itemId || delta === null) {
      return
    }

    const tool = this.ensureTool(itemId, 'tool', null)
    tool.output += delta
    this.emit({ type: 'tool.updated', toolCallId: itemId, output: tool.output })
  }

  private updateToolSnapshot(params: unknown): void {
    const record = readRecord(params)
    const itemId = readString(record.itemId)

    if (!itemId) {
      return
    }

    const tool = this.ensureTool(itemId, 'apply_patch', null)
    tool.output = JSON.stringify(record.changes ?? null)
    this.emit({ type: 'tool.updated', toolCallId: itemId, output: tool.output })
  }

  private updateUsage(params: unknown): void {
    const tokenUsage = readRecord(readRecord(params).tokenUsage)
    const last = readRecord(tokenUsage.last)
    const total = readRecord(tokenUsage.total)
    const inputTokens = readNumber(last.inputTokens) ?? readNumber(total.inputTokens)
    const outputTokens = readNumber(last.outputTokens) ?? readNumber(total.outputTokens)
    const contextTokens = readNumber(last.totalTokens)
    const totalTokens = readNumber(total.totalTokens) ?? contextTokens
    const contextWindow = readNumber(tokenUsage.modelContextWindow)

    if (
      inputTokens === undefined &&
      outputTokens === undefined &&
      totalTokens === undefined &&
      contextTokens === undefined &&
      contextWindow === undefined
    ) {
      return
    }

    this.emit({
      type: 'usage.updated',
      ...(inputTokens === undefined ? {} : { inputTokens }),
      ...(outputTokens === undefined ? {} : { outputTokens }),
      ...(totalTokens === undefined ? {} : { totalTokens }),
      ...(contextTokens === undefined ? {} : { contextTokens }),
      ...(contextWindow === undefined ? {} : { contextWindow })
    })
  }

  private handleDiagnostic(method: string, params: unknown): void {
    const record = readRecord(params)
    const error = readRecord(record.error)
    const message =
      readString(error.message) ?? readString(record.message) ?? `Codex app-server sent ${method}`
    const level =
      method === 'error'
        ? 'error'
        : method === 'warning' || method === 'configWarning'
          ? 'warning'
          : 'info'

    this.emit({ type: 'diagnostic', level, message })
  }

  private closeResolvedRequest(params: unknown): void {
    const requestId = readIdentifier(readRecord(params).requestId)

    if (!requestId) {
      return
    }

    if (this.pendingRequests.delete(requestId)) {
      this.emit({ type: 'request.closed', requestId, outcome: 'expired' })
    }
  }

  private handleThreadClosed(params: unknown): void {
    if (this.ended) {
      return
    }

    this.ended = true
    this.stopping = true
    this.closeRemainingMessages()
    this.closeRemainingTools('cancelled')
    this.expirePendingRequests()
    this.emit({
      type: 'session.ended',
      reason: 'exited',
      message: readString(readRecord(params).reason) ?? 'Codex closed the thread'
    })
    void this.transport.close()
  }

  private handleServerRequest(id: string | number, method: string, params: unknown): void {
    const incomingThreadId = readThreadId(params)

    if (incomingThreadId && this.threadId && incomingThreadId !== this.threadId) {
      this.replyWithError(id, -32001, 'Codex request belongs to another thread')
      return
    }

    switch (method) {
      case 'item/commandExecution/requestApproval':
        this.openApproval(id, method, params, 'Run a command?')
        return
      case 'item/fileChange/requestApproval':
        this.openApproval(id, method, params, 'Apply file changes?')
        return
      case 'item/tool/requestUserInput':
        this.openQuestion(id, method, params)
        return
      case 'mcpServer/elicitation/request':
        this.handleMcpRequest(id, method, params)
        return
      case 'item/permissions/requestApproval':
        this.reply(id, {
          permissions: {},
          scope: 'turn',
          strictAutoReview: true
        })
        return
      case 'item/tool/call':
        this.reply(id, { contentItems: [], success: false })
        return
      case 'account/chatgptAuthTokens/refresh':
        this.replyWithError(id, -32001, 'Shumi cannot refresh Codex auth tokens')
        return
      case 'attestation/generate':
        this.replyWithError(id, -32001, 'Shumi did not negotiate Codex attestation')
        return
      case 'applyPatchApproval':
      case 'execCommandApproval':
        this.reply(id, { decision: 'abort' })
        return
      default:
        this.replyWithError(id, -32000, `Shumi rejected unrecognized request ${method}`)
    }
  }

  private openApproval(id: string | number, method: string, params: unknown, title: string): void {
    const requestId = String(id)

    if (this.pendingRequests.has(requestId)) {
      this.replyWithError(id, -32001, 'Codex reused an open request id')
      return
    }

    const record = readRecord(params)
    const question = approvalQuestion(title, record)
    const pending: PendingServerRequest = {
      id,
      method,
      kind: 'approval',
      questions: [question],
      optionAnswers: new Map(question.options.map((option) => [option.id, option.label]))
    }

    this.pendingRequests.set(requestId, pending)
    this.emit({
      type: 'request.opened',
      requestId,
      kind: 'approval',
      title,
      detail: approvalDetail(record),
      questions: [question]
    })
  }

  private openQuestion(id: string | number, method: string, params: unknown): void {
    const requestId = String(id)
    const questions = codexQuestions(params)

    if (questions.length === 0) {
      this.replyWithError(id, -32001, 'Codex did not provide a usable question')
      return
    }

    if (this.pendingRequests.has(requestId)) {
      this.replyWithError(id, -32001, 'Codex reused an open request id')
      return
    }

    const optionAnswers = new Map<string, string>()

    for (const question of questions) {
      for (const option of question.options) {
        optionAnswers.set(option.id, option.label)
      }
    }

    this.pendingRequests.set(requestId, {
      id,
      method,
      kind: 'question',
      questions,
      optionAnswers
    })
    this.emit({
      type: 'request.opened',
      requestId,
      kind: 'question',
      title: readString(readRecord(params).title) ?? 'Codex needs input',
      detail: null,
      questions
    })
  }

  private handleMcpRequest(id: string | number, method: string, params: unknown): void {
    if (!isMcpToolApproval(params)) {
      this.reply(id, { action: 'decline', content: null, _meta: null })
      return
    }

    const requestId = String(id)

    if (this.pendingRequests.has(requestId)) {
      this.replyWithError(id, -32001, 'Codex reused an open request id')
      return
    }

    const record = readRecord(params)
    const decisions = mcpApprovalDecisions(record)
    const title = readString(record.message) ?? 'Allow this tool call?'
    const options = decisions.map((decision) => ({
      id: decision,
      label: MCP_APPROVAL_LABELS[decision] ?? decision
    }))
    const question: ShumiPromptQuestion = {
      id: 'decision',
      text: title,
      options
    }

    this.pendingRequests.set(requestId, {
      id,
      method,
      kind: 'mcp-approval',
      questions: [question],
      optionAnswers: new Map(options.map((option) => [option.id, option.label]))
    })
    this.emit({
      type: 'request.opened',
      requestId,
      kind: 'approval',
      title,
      detail: approvalDetail(record),
      questions: [question]
    })
  }

  private reply(id: string | number, result: unknown): void {
    try {
      this.transport.send({ id, result })
    } catch (error) {
      void this.transport.close(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private replyWithError(id: string | number, code: number, message: string): void {
    try {
      this.transport.send({ id, error: { code, message } })
    } catch (error) {
      void this.transport.close(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private closeRemainingMessages(): void {
    for (const [itemId, message] of [...this.activeMessages]) {
      this.completeMessage(itemId, message.role, message.reasoning, message.text)
    }
  }

  private closeRemainingTools(status: CodexTurnStatus): void {
    const toolStatus =
      status === 'cancelled' ? 'cancelled' : status === 'failed' ? 'failed' : 'completed'

    for (const [itemId, tool] of [...this.activeTools]) {
      this.activeTools.delete(itemId)
      this.emit({
        type: 'tool.completed',
        toolCallId: itemId,
        name: tool.name,
        status: toolStatus,
        input: tool.input,
        ...(tool.output ? { output: tool.output } : {})
      })
    }
  }

  private expirePendingRequests(): void {
    for (const [requestId] of [...this.pendingRequests]) {
      this.pendingRequests.delete(requestId)
      this.emit({ type: 'request.closed', requestId, outcome: 'expired' })
    }
  }

  private handleClose(error: Error): void {
    if (this.stopping || this.ended) {
      return
    }

    this.ended = true
    this.closeRemainingMessages()
    this.closeRemainingTools('failed')
    this.expirePendingRequests()

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

function codexTurnInput(input: ShumiInput): JsonlRecord[] {
  const result: JsonlRecord[] = []

  if (input.text.length > 0) {
    result.push({ type: 'text', text: input.text })
  }

  for (const image of input.images ?? []) {
    if (image.path) {
      result.push({ type: 'localImage', path: image.path })
    } else if (image.url) {
      result.push({ type: 'image', url: image.url })
    }
  }

  return result
}

function codexServerReply(
  pending: PendingServerRequest,
  response: ShumiPromptResponse
): ServerReply {
  if (response.cancelled) {
    if (pending.kind === 'question') {
      return {
        error: {
          code: -32001,
          message: 'User cancelled the Codex question'
        }
      }
    }

    if (pending.kind === 'mcp-approval') {
      return {
        result: {
          action: 'cancel',
          content: null,
          _meta: { codex_approval_cancellation_reason: 'user' }
        }
      }
    }

    return { result: { decision: 'cancel' } }
  }

  if (pending.kind === 'question') {
    const answers: Record<string, { answers: string[] }> = {}

    for (const question of pending.questions) {
      const answer = response.answers.find((entry) => entry.questionId === question.id)

      if (!answer) {
        throw new Error(`Codex question ${question.id} requires an answer`)
      }

      const value = answer.optionId
        ? (pending.optionAnswers.get(answer.optionId) ?? null)
        : (answer.text ?? null)

      if (value === null || value.length === 0) {
        throw new Error(`Codex question ${question.id} requires a non-empty answer`)
      }

      answers[question.id] = { answers: [value] }
    }

    return { result: { answers } }
  }

  const answer = response.answers[0]
  const decision = answer?.optionId ?? answer?.text

  if (!decision) {
    throw new Error('Codex approval requires a decision')
  }

  const offered = pending.questions[0]?.options.some((option) => option.id === decision)

  if (!offered) {
    throw new Error(`Codex did not offer approval decision ${decision}`)
  }

  if (pending.kind === 'mcp-approval') {
    return {
      result: {
        action: decision === 'cancel' ? 'cancel' : 'accept',
        content: null,
        _meta: decision === 'acceptForSession' ? { persist: 'session' } : null
      }
    }
  }

  return { result: { decision } }
}

function approvalQuestion(title: string, params: JsonlRecord): ShumiPromptQuestion {
  const offered = Array.isArray(params.availableDecisions)
    ? params.availableDecisions.filter(
        (decision): decision is string =>
          typeof decision === 'string' && APPROVAL_DECISIONS.some((allowed) => allowed === decision)
      )
    : []
  const decisions = offered.length > 0 ? offered : APPROVAL_DECISIONS
  const options: ShumiPromptOption[] = decisions.map((decision) => ({
    id: decision,
    label: APPROVAL_LABELS[decision] ?? decision,
    ...(decision === 'cancel' ? { tone: 'danger' as const } : {})
  }))

  return {
    id: 'decision',
    text: title,
    options
  }
}

function codexQuestions(params: unknown): ShumiPromptQuestion[] {
  const questions = readRecord(params).questions

  if (!Array.isArray(questions)) {
    return []
  }

  return questions.flatMap((value) => {
    const question = readRecord(value)
    const id = readString(question.id)
    const text = readString(question.question) ?? readString(question.header)

    if (!id || !text) {
      return []
    }

    const options = Array.isArray(question.options)
      ? question.options.flatMap((optionValue) => {
          const option = readRecord(optionValue)
          const label = readString(option.label)

          if (!label || option.isOther === true) {
            return []
          }

          return [
            {
              id: encodeQuestionOptionId(id, label),
              label
            }
          ]
        })
      : []
    const allowText =
      options.length === 0 ||
      question.isOther === true ||
      (Array.isArray(question.options) &&
        question.options.some((option) => readRecord(option).isOther === true))

    return [
      {
        id,
        text,
        options,
        ...(allowText ? { allowText: true } : {})
      }
    ]
  })
}

function encodeQuestionOptionId(questionId: string, answer: string): string {
  return `${encodeURIComponent(questionId)}:${encodeURIComponent(answer)}`
}

function isMcpToolApproval(params: unknown): boolean {
  const record = readRecord(params)
  const meta = readRecord(record._meta)

  if (meta.codex_approval_kind !== 'mcp_tool_call') {
    return false
  }

  if (record.mode !== undefined && record.mode !== 'form') {
    return false
  }

  if (record.requestedSchema === undefined || record.requestedSchema === null) {
    return true
  }

  const schema = readRecord(record.requestedSchema)
  const properties = readRecord(schema.properties)

  return schema.type === 'object' && Object.keys(properties).length === 0
}

function mcpApprovalDecisions(params: JsonlRecord): string[] {
  const persist = readRecord(params._meta).persist
  const persistsSession = Array.isArray(persist)
    ? persist.includes('session')
    : persist === 'session'

  return persistsSession
    ? [...MCP_APPROVAL_DECISIONS]
    : MCP_APPROVAL_DECISIONS.filter((decision) => decision !== 'acceptForSession')
}

function approvalDetail(params: JsonlRecord): string | null {
  const command = params.command

  if (typeof command === 'string' && command.length > 0) {
    return command
  }

  if (Array.isArray(command) && command.every((part) => typeof part === 'string')) {
    return command.join(' ')
  }

  const meta = readRecord(params._meta)
  const toolParams = params.tool_params ?? meta.tool_params

  return (
    readString(params.reason) ??
    (params.changes === undefined ? null : JSON.stringify(params.changes)) ??
    (toolParams === undefined ? null : JSON.stringify(toolParams))
  )
}

function codexMessageRole(type: string): ShumiMessageRole | null {
  if (type === 'userMessage') {
    return 'user'
  }

  if (type === 'agentMessage' || type === 'reasoning' || type === 'plan') {
    return 'assistant'
  }

  return null
}

function codexToolName(item: JsonlRecord): string {
  const type = readString(item.type) ?? 'tool'

  if (type === 'commandExecution') {
    return 'shell'
  }

  if (type === 'fileChange') {
    return 'apply_patch'
  }

  if (type === 'webSearch') {
    return 'web_search'
  }

  if (type === 'mcpToolCall') {
    const server = readString(item.server)
    const tool = readString(item.tool)
    return server && tool ? `${server}/${tool}` : (tool ?? 'mcp')
  }

  if (type === 'collabAgentToolCall') {
    return readString(item.tool) ?? 'agent'
  }

  if (type === 'imageView' || type === 'imageGeneration') {
    return type === 'imageView' ? 'image_view' : 'image_generation'
  }

  return type
}

function codexToolInput(item: JsonlRecord): unknown {
  const type = readString(item.type) ?? 'tool'

  if (type === 'commandExecution') {
    return {
      command: item.command ?? null,
      cwd: item.cwd ?? null,
      commandActions: item.commandActions ?? []
    }
  }

  if (type === 'fileChange') {
    return { changes: item.changes ?? [] }
  }

  if (type === 'mcpToolCall' || type === 'dynamicToolCall') {
    return {
      server: item.server ?? null,
      tool: item.tool ?? null,
      arguments: item.arguments ?? null
    }
  }

  if (type === 'webSearch') {
    return { query: item.query ?? null, action: item.action ?? null }
  }

  if (type === 'collabAgentToolCall') {
    return {
      tool: item.tool ?? null,
      prompt: item.prompt ?? null,
      receiverThreadIds: item.receiverThreadIds ?? [],
      model: item.model ?? null,
      reasoningEffort: item.reasoningEffort ?? null
    }
  }

  if (type === 'imageView') {
    return { path: item.path ?? null }
  }

  if (type === 'imageGeneration') {
    return {
      revisedPrompt: item.revisedPrompt ?? null,
      savedPath: item.savedPath ?? null,
      status: item.status ?? null
    }
  }

  if (type === 'functionCallOutput') {
    return {
      name: item.name ?? null,
      output: item.output ?? null
    }
  }

  if (type === 'subAgentActivity') {
    return {
      agentPath: item.agentPath ?? null,
      agentThreadId: item.agentThreadId ?? null,
      kind: item.kind ?? null,
      model: item.model ?? null,
      reasoningEffort: item.reasoningEffort ?? null
    }
  }

  if (type === 'sleep') {
    return { durationMs: item.durationMs ?? null }
  }

  if (type === 'enteredReviewMode' || type === 'exitedReviewMode') {
    return { review: item.review ?? null }
  }

  return { type }
}

function codexToolStatus(item: JsonlRecord): 'completed' | 'failed' | 'cancelled' {
  const status = readString(item.status)

  if (status === 'failed' || status === 'declined') {
    return 'failed'
  }

  if (status === 'interrupted' || status === 'cancelled') {
    return 'cancelled'
  }

  return 'completed'
}

function extractItemText(item: JsonlRecord, type: string): string | null {
  if (type === 'reasoning') {
    return readString(item.text) ?? textsFromContent(item.summary) ?? textsFromContent(item.content)
  }

  return readString(item.text) ?? textsFromContent(item.content)
}

function textsFromContent(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.length > 0 ? value : null
  }

  if (!Array.isArray(value)) {
    return null
  }

  const text = value
    .flatMap(
      (part) =>
        readString(readRecord(part).text) ??
        (typeof part === 'string' && part.length > 0 ? part : null)
    )
    .join('\n')

  return text.length > 0 ? text : null
}

function extractToolOutput(item: JsonlRecord): string | null {
  const error = readRecord(item.error)
  const value =
    readString(item.aggregatedOutput) ??
    readString(item.output) ??
    readString(item.text) ??
    readString(error.message)

  if (value) {
    return value
  }

  return item.result === undefined || item.result === null ? null : JSON.stringify(item.result)
}

function codexTurnStatus(value: string | null): CodexTurnStatus {
  if (value === 'interrupted' || value === 'cancelled') {
    return 'cancelled'
  }

  if (value === 'failed' || value === 'systemError') {
    return 'failed'
  }

  return 'completed'
}

function readThreadId(value: unknown): string | null {
  const record = readRecord(value)

  return readString(record.threadId) ?? readString(readRecord(record.thread).id)
}

function readTurnId(value: unknown): string | null {
  const record = readRecord(value)

  return readString(record.turnId) ?? readString(readRecord(record.turn).id)
}

function readTurnStatus(value: unknown): string | null {
  const record = readRecord(value)

  return readString(record.status) ?? readString(readRecord(record.turn).status)
}

function readTurnErrorMessage(value: unknown): string | null {
  const turn = readRecord(readRecord(value).turn)

  return readString(readRecord(turn.error).message)
}

function readIdentifier(value: unknown): string | null {
  return typeof value === 'number' ? String(value) : readString(value)
}

function isRecord(value: unknown): value is JsonlRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRecord(value: unknown): JsonlRecord {
  return isRecord(value) ? value : {}
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
