import { describe, expect, it } from 'vitest'

import type { ShumiEventPayload } from '../../../shared/agent/events'
import { CodexHarnessAdapter } from '../adapters/codex'
import { FakeJsonlRpcTransport, nextTick } from './fake-transport'

type CodexAdapterFixture = {
  adapter: CodexHarnessAdapter
  events: ShumiEventPayload[]
  transport: FakeJsonlRpcTransport
}

function createCodexAdapter(): CodexAdapterFixture {
  const transport = new FakeJsonlRpcTransport()
  const events: ShumiEventPayload[] = []
  const adapter = new CodexHarnessAdapter(transport, {
    emit: (event) => events.push(event)
  })

  transport.onSend = (record) => {
    if (record.method === 'initialize') {
      queueMicrotask(() => transport.emit({ id: record.id, result: {} }))
    } else if (record.method === 'thread/start') {
      queueMicrotask(() => {
        transport.emit({
          id: record.id,
          result: {
            model: 'gpt-5-codex',
            reasoningEffort: 'high',
            thread: {
              id: 'thread-1',
              model: 'gpt-5-codex',
              reasoningEffort: 'high'
            }
          }
        })
      })
    } else if (record.method === 'turn/start') {
      queueMicrotask(() => {
        transport.emit({
          id: record.id,
          result: {
            turn: {
              id: 'turn-1',
              status: 'inProgress',
              items: []
            }
          }
        })
      })
    } else if (record.method === 'turn/steer') {
      queueMicrotask(() => transport.emit({ id: record.id, result: { turnId: 'turn-1' } }))
    } else if (record.method === 'turn/interrupt') {
      queueMicrotask(() => transport.emit({ id: record.id, result: {} }))
    }
  }

  return { adapter, events, transport }
}

async function startCodexAdapter(): Promise<CodexAdapterFixture> {
  const result = createCodexAdapter()

  await result.adapter.start({
    cwd: 'C:\\repo',
    model: 'gpt-5-codex',
    effort: 'high'
  })

  return result
}

describe('CodexHarnessAdapter', () => {
  it('initializes, starts a thread, and maps messages and tools', async () => {
    const { adapter, events, transport } = await startCodexAdapter()

    expect(transport.sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'initialize',
          params: expect.objectContaining({
            clientInfo: expect.objectContaining({ name: 'shumi_desktop' })
          })
        }),
        { method: 'initialized' },
        expect.objectContaining({
          method: 'thread/start',
          params: expect.objectContaining({
            cwd: 'C:\\repo',
            model: 'gpt-5-codex'
          })
        })
      ])
    )

    await adapter.send({ text: 'hello' })

    const turnStart = transport.sent.find((record) => record.method === 'turn/start')
    expect(turnStart?.params).toMatchObject({
      threadId: 'thread-1',
      model: 'gpt-5-codex',
      effort: 'high',
      input: [{ type: 'text', text: 'hello' }]
    })
    expect(turnStart?.params).not.toHaveProperty('collaborationMode')

    transport.emit({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { id: 'message-1', type: 'agentMessage', text: '' }
      }
    })
    transport.emit({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'message-1',
        delta: 'Hello'
      }
    })
    transport.emit({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: { id: 'message-1', type: 'agentMessage', text: 'Hello' }
      }
    })

    transport.emit({
      method: 'item/started',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: {
          id: 'tool-1',
          type: 'commandExecution',
          command: 'echo hello',
          cwd: 'C:\\repo',
          commandActions: [],
          status: 'inProgress'
        }
      }
    })
    transport.emit({
      method: 'item/commandExecution/outputDelta',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'tool-1',
        delta: 'hello\n'
      }
    })
    transport.emit({
      method: 'item/completed',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        item: {
          id: 'tool-1',
          type: 'commandExecution',
          command: 'echo hello',
          cwd: 'C:\\repo',
          commandActions: [],
          aggregatedOutput: 'hello\n',
          status: 'completed'
        }
      }
    })
    transport.emit({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'completed', items: [] }
      }
    })

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'turn.started', turnId: 'turn-1' }),
        expect.objectContaining({
          type: 'message.completed',
          messageId: 'message-1',
          content: [{ type: 'text', text: 'Hello' }]
        }),
        expect.objectContaining({
          type: 'tool.started',
          toolCallId: 'tool-1',
          name: 'shell',
          input: expect.objectContaining({ command: 'echo hello' })
        }),
        expect.objectContaining({
          type: 'tool.updated',
          toolCallId: 'tool-1',
          output: 'hello\n'
        }),
        expect.objectContaining({
          type: 'tool.completed',
          toolCallId: 'tool-1',
          status: 'completed'
        }),
        expect.objectContaining({
          type: 'turn.completed',
          turnId: 'turn-1',
          status: 'completed'
        })
      ])
    )
  })

  it('maps approvals and free-text questions back to Codex replies', async () => {
    const { adapter, events, transport } = await startCodexAdapter()

    transport.emit({
      id: 41,
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'tool-1',
        startedAtMs: 1,
        command: 'rm -rf build',
        availableDecisions: ['accept', 'decline']
      }
    })
    expect(events.at(-1)).toMatchObject({
      type: 'request.opened',
      requestId: '41',
      kind: 'approval'
    })

    await adapter.respond('41', {
      answers: [{ questionId: 'decision', optionId: 'accept' }]
    })
    expect(transport.sent.at(-1)).toEqual({
      id: 41,
      result: { decision: 'accept' }
    })

    transport.emit({
      id: 42,
      method: 'item/tool/requestUserInput',
      params: {
        threadId: 'thread-1',
        turnId: 'turn-1',
        itemId: 'tool-2',
        isBlocking: true,
        questions: [
          {
            id: 'name',
            header: 'Name',
            question: 'What should it be called?',
            isOther: true,
            options: [{ label: 'Default', description: 'Use the default name' }]
          }
        ]
      }
    })
    expect(events.at(-1)).toMatchObject({
      type: 'request.opened',
      requestId: '42',
      questions: [
        {
          id: 'name',
          allowText: true,
          options: [{ id: 'name:Default', label: 'Default' }]
        }
      ]
    })

    await adapter.respond('42', {
      answers: [{ questionId: 'name', text: 'Custom name' }]
    })
    expect(transport.sent.at(-1)).toEqual({
      id: 42,
      result: {
        answers: {
          name: { answers: ['Custom name'] }
        }
      }
    })
  })

  it('can interrupt a turn that started while turn/start was still pending', async () => {
    const { adapter, transport } = createCodexAdapter()
    const turnStart = { release: null as (() => void) | null }

    transport.onSend = (record) => {
      if (record.method === 'initialize') {
        queueMicrotask(() => transport.emit({ id: record.id, result: {} }))
      } else if (record.method === 'thread/start') {
        queueMicrotask(() => {
          transport.emit({
            id: record.id,
            result: {
              model: 'gpt-5-codex',
              thread: { id: 'thread-1' }
            }
          })
        })
      } else if (record.method === 'turn/start') {
        turnStart.release = () => {
          transport.emit({
            id: record.id,
            result: {
              turn: { id: 'turn-1', status: 'inProgress', items: [] }
            }
          })
        }
      } else if (record.method === 'turn/interrupt') {
        queueMicrotask(() => transport.emit({ id: record.id, result: {} }))
      }
    }

    await adapter.start({ cwd: 'C:\\repo' })
    const send = adapter.send({ text: 'work' })

    await nextTick()
    transport.emit({
      method: 'turn/started',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'inProgress', items: [] }
      }
    })
    await adapter.cancel()

    expect(transport.sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'turn/interrupt',
          params: { threadId: 'thread-1', turnId: 'turn-1' }
        })
      ])
    )

    turnStart.release?.()
    await send
  })
})
