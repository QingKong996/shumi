import { describe, expect, it } from 'vitest'

import { JsonlRpcRequester, JsonlRpcTimeoutError, type JsonlRpcCodec } from '../jsonl-rpc'
import { FakeJsonlRpcTransport } from './fake-transport'

const codec: JsonlRpcCodec = {
  encodeRequest(id, method, params) {
    return { id, method, ...(params ? { params } : {}) }
  },
  decodeReply(record) {
    if (typeof record.id !== 'string' && typeof record.id !== 'number') {
      return null
    }

    if (record.error && typeof record.error === 'object' && !Array.isArray(record.error)) {
      const error = record.error as Record<string, unknown>

      return {
        id: record.id,
        error: {
          code: typeof error.code === 'number' ? error.code : -32000,
          message: typeof error.message === 'string' ? error.message : 'Unknown error'
        }
      }
    }

    return 'result' in record ? { id: record.id, result: record.result } : null
  }
}

describe('JsonlRpcRequester', () => {
  it('correlates replies with their requests', async () => {
    const transport = new FakeJsonlRpcTransport()
    const requester = new JsonlRpcRequester(transport, codec)
    const request = requester.request('inspect', { path: 'README.md' })

    expect(transport.sent).toEqual([{ id: '1', method: 'inspect', params: { path: 'README.md' } }])

    transport.emit({ id: '1', result: { ok: true } })

    await expect(request).resolves.toEqual({ ok: true })
  })

  it('rejects protocol errors with their code', async () => {
    const transport = new FakeJsonlRpcTransport()
    const requester = new JsonlRpcRequester(transport, codec)
    const request = requester.request('fail')

    transport.emit({ id: '1', error: { code: -32601, message: 'Method not found' } })

    await expect(request).rejects.toMatchObject({
      name: 'JsonlRpcRequestError',
      code: -32601,
      message: 'Method not found'
    })
  })

  it('times out an unanswered request', async () => {
    const transport = new FakeJsonlRpcTransport()
    const requester = new JsonlRpcRequester(transport, codec, 5)

    await expect(requester.request('slow')).rejects.toBeInstanceOf(JsonlRpcTimeoutError)
  })

  it('rejects pending requests when the transport closes', async () => {
    const transport = new FakeJsonlRpcTransport()
    const requester = new JsonlRpcRequester(transport, codec)
    const request = requester.request('wait', undefined, { timeoutMs: null })

    await transport.close(new Error('Harness exited'))

    await expect(request).rejects.toThrow('Harness exited')
  })
})
