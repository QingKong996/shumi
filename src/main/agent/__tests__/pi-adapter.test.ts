import { describe, expect, it } from 'vitest'

import type { ShumiEventPayload } from '../../../shared/agent/events'
import { PiHarnessAdapter } from '../adapters/pi'
import { FakeJsonlRpcTransport } from './fake-transport'

function createPiAdapter(): {
  adapter: PiHarnessAdapter
  events: ShumiEventPayload[]
  transport: FakeJsonlRpcTransport
} {
  const transport = new FakeJsonlRpcTransport()
  const events: ShumiEventPayload[] = []
  const adapter = new PiHarnessAdapter(transport, {
    emit: (event) => events.push(event)
  })

  transport.onSend = (record) => {
    if (record.type === 'get_state') {
      queueMicrotask(() => {
        transport.emit({
          type: 'response',
          id: record.id,
          command: 'get_state',
          success: true,
          data: {
            model: { provider: 'anthropic', id: 'claude-sonnet' },
            thinkingLevel: 'high',
            isStreaming: false
          }
        })
      })
    }
  }

  return { adapter, events, transport }
}

describe('PiHarnessAdapter', () => {
  it('maps the Pi lifecycle and chooses the correct streaming behavior', async () => {
    const { adapter, events, transport } = createPiAdapter()

    await adapter.start({ cwd: 'C:\\repo' })

    expect(events[0]).toMatchObject({
      type: 'session.started',
      harness: 'pi',
      model: 'anthropic/claude-sonnet',
      effort: 'high'
    })

    await adapter.send({ text: 'first' })
    expect(transport.sent.at(-1)).toMatchObject({
      type: 'prompt',
      message: 'first',
      streamingBehavior: 'followUp'
    })

    transport.emit({ type: 'agent_start' })
    await adapter.send({ text: 'second' })
    expect(transport.sent.at(-1)).toMatchObject({
      type: 'prompt',
      message: 'second',
      streamingBehavior: 'steer'
    })

    transport.emit({
      type: 'message_start',
      message: { role: 'assistant', content: [] }
    })
    transport.emit({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'Hello' }
    })
    transport.emit({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello' }]
      }
    })
    transport.emit({ type: 'agent_settled', aborted: false })

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'turn.started', turnId: 'pi-turn-1' }),
        expect.objectContaining({
          type: 'message.delta',
          channel: 'text',
          delta: 'Hello'
        }),
        expect.objectContaining({
          type: 'message.completed',
          content: [{ type: 'text', text: 'Hello' }]
        }),
        expect.objectContaining({
          type: 'turn.completed',
          turnId: 'pi-turn-1',
          status: 'completed'
        })
      ])
    )
  })

  it('maps extension dialogs to questions and sends Pi the selected value', async () => {
    const { adapter, events, transport } = createPiAdapter()

    await adapter.start({ cwd: 'C:\\repo' })
    transport.emit({
      type: 'extension_ui_request',
      id: 'dialog-1',
      method: 'select',
      title: 'Choose an option',
      options: ['alpha', 'beta']
    })

    expect(events.at(-1)).toMatchObject({
      type: 'request.opened',
      requestId: 'dialog-1',
      kind: 'question',
      questions: [
        {
          id: 'select',
          options: [
            { id: 'option-0', label: 'alpha' },
            { id: 'option-1', label: 'beta' }
          ]
        }
      ]
    })

    await adapter.respond('dialog-1', {
      answers: [{ questionId: 'select', optionId: 'option-1' }]
    })

    expect(transport.sent.at(-1)).toEqual({
      type: 'extension_ui_response',
      id: 'dialog-1',
      value: 'beta'
    })
    expect(events.at(-1)).toMatchObject({
      type: 'request.closed',
      requestId: 'dialog-1',
      outcome: 'answered'
    })
  })
})
