import { describe, expect, it } from 'vitest'

import { ShumiEventBus } from '../event-bus'

describe('ShumiEventBus', () => {
  it('numbers events and stops after the session ends', () => {
    const bus = new ShumiEventBus('session-1')
    const events: string[] = []
    const unsubscribe = bus.subscribe((event) => {
      events.push(`${event.sequence}:${event.payload.type}`)
    })

    bus.publish({ type: 'session.status', status: 'idle' })
    bus.publish({ type: 'session.ended', reason: 'stopped' })
    bus.publish({ type: 'diagnostic', level: 'info', message: 'late' })
    unsubscribe()

    expect(events).toEqual(['1:session.status', '2:session.ended'])
    expect(bus.isEnded).toBe(true)
  })

  it('supports unsubscribing a listener', () => {
    const bus = new ShumiEventBus('session-2')
    const events: string[] = []
    const unsubscribe = bus.subscribe((event) => events.push(event.id))

    unsubscribe()
    bus.publish({ type: 'session.status', status: 'idle' })

    expect(events).toEqual([])
  })
})
