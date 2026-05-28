import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { ContentProtectionMediator } from '../../core/mediator/ContentProtectionMediator'
import { ProtectionEventType, type ProtectionEvent } from '../../core/mediator/protection-event'

// Minimal event factory — the mediator does not validate ProtectionEvent shape
// beyond `type`, so this is enough for unit-level tests.
const ev = (overrides: Partial<ProtectionEvent> = {}): ProtectionEvent => ({
  type: ProtectionEventType.DEVTOOLS_STATE_CHANGE,
  source: 'test',
  timestamp: 0,
  ...overrides,
})

describe('ContentProtectionMediator', () => {
  let mediator: ContentProtectionMediator
  let errSpy: jest.SpiedFunction<typeof console.error>
  let logSpy: jest.SpiedFunction<typeof console.log>

  beforeEach(() => {
    mediator = new ContentProtectionMediator(false)
    // The mediator logs every `publish()` to console.log unconditionally
    // (line 148); we silence it so test output stays clean.
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    errSpy.mockRestore()
  })

  describe('subscribe', () => {
    it('returns a non-empty subscription id and delivers events to the handler', () => {
      const handler = jest.fn()
      const id = mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, handler)
      expect(id).toBeTruthy()

      const event = ev()
      mediator.publish(event)
      expect(handler).toHaveBeenCalledWith(event)
    })

    it('rejects non-function handlers and returns "" + logs an error', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const id = mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, null as any)
      expect(id).toBe('')
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid handler'))
    })

    it('orders handlers by descending priority on publish', () => {
      const order: string[] = []
      mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, () => order.push('low'),  { priority: 1 })
      mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, () => order.push('high'), { priority: 10 })
      mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, () => order.push('mid'),  { priority: 5 })

      mediator.publish(ev())
      expect(order).toEqual(['high', 'mid', 'low'])
    })

    it('applies the optional filter — handler only fires when filter returns true', () => {
      const handler = jest.fn()
      mediator.subscribe(
        ProtectionEventType.DEVTOOLS_STATE_CHANGE,
        handler,
        { filter: (e) => e.source === 'wanted' },
      )

      mediator.publish(ev({ source: 'unwanted' }))
      mediator.publish(ev({ source: 'wanted' }))

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0]).toMatchObject({ source: 'wanted' })
    })
  })

  describe('unsubscribe', () => {
    it('detaches a handler so it stops receiving events', () => {
      const handler = jest.fn()
      const id = mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, handler)

      expect(mediator.unsubscribe(id)).toBe(true)
      mediator.publish(ev())
      expect(handler).not.toHaveBeenCalled()
    })

    it('returns false for empty/unknown ids', () => {
      expect(mediator.unsubscribe('')).toBe(false)
      expect(mediator.unsubscribe('does-not-exist')).toBe(false)
    })
  })

  describe('unsubscribeByContext', () => {
    it('removes every subscription tagged with the given context', () => {
      const h = jest.fn()
      mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, h, { context: 'A' })
      mediator.subscribe(ProtectionEventType.EXTENSION_DETECTED,   h, { context: 'A' })
      mediator.subscribe(ProtectionEventType.OVERLAY_SHOWN,        h, { context: 'B' })

      expect(mediator.unsubscribeByContext('A')).toBe(2)
      // Only B remains.
      expect(mediator.getDebugInfo().subscriptionCount).toBe(1)
    })

    it('returns 0 for an empty context string', () => {
      expect(mediator.unsubscribeByContext('')).toBe(0)
    })
  })

  describe('publish', () => {
    it('rejects events missing a type and logs an error', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mediator.publish(null as any)
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid event'))
    })

    it('stamps timestamp when caller omits it', () => {
      let received: ProtectionEvent | undefined
      mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, (e) => { received = e })

      mediator.publish(ev({ timestamp: 0 }))
      expect(received?.timestamp).toBeGreaterThan(0)
    })

    it('isolates a throwing handler from the rest of the subscribers', () => {
      const good = jest.fn()
      mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, () => { throw new Error('boom') })
      mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, good)

      expect(() => mediator.publish(ev())).not.toThrow()
      expect(good).toHaveBeenCalled()
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Error in handler'), expect.any(Error))
    })

    it('quietly no-ops when no subscribers exist for the event type', () => {
      expect(() => mediator.publish(ev({ type: ProtectionEventType.OVERLAY_SHOWN }))).not.toThrow()
    })
  })

  describe('getSubscriptions / getAllSubscriptions', () => {
    it('getSubscriptions returns a snapshot — mutating it does not affect internal state', () => {
      mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, jest.fn())
      const subs = mediator.getSubscriptions(ProtectionEventType.DEVTOOLS_STATE_CHANGE)
      expect(subs).toHaveLength(1)
      subs.pop()
      expect(mediator.getSubscriptions(ProtectionEventType.DEVTOOLS_STATE_CHANGE)).toHaveLength(1)
    })

    it('getAllSubscriptions returns a deep-ish copy keyed by event type', () => {
      mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, jest.fn())
      mediator.subscribe(ProtectionEventType.EXTENSION_DETECTED,   jest.fn())

      const all = mediator.getAllSubscriptions()
      expect(all.size).toBe(2)
      expect(all.get(ProtectionEventType.DEVTOOLS_STATE_CHANGE)).toHaveLength(1)
    })
  })

  describe('getDebugInfo', () => {
    it('returns aggregate counts plus event-type list', () => {
      mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, jest.fn())
      mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, jest.fn())
      mediator.subscribe(ProtectionEventType.EXTENSION_DETECTED,   jest.fn())

      const info = mediator.getDebugInfo()
      expect(info.subscriptionCount).toBe(3)
      expect(info.eventTypeCount).toBe(2)
      expect(info.eventTypes).toEqual(expect.arrayContaining([
        ProtectionEventType.DEVTOOLS_STATE_CHANGE,
        ProtectionEventType.EXTENSION_DETECTED,
      ]))
    })

    it('tracks the most-recent N events for history (capped at MAX_HISTORY_SIZE = 100)', () => {
      for (let i = 0; i < 105; i++) mediator.publish(ev({ source: `s${i}` }))

      const { recentEvents } = mediator.getDebugInfo()
      expect(recentEvents).toHaveLength(100)
      // Most recent first.
      expect(recentEvents[0].source).toBe('s104')
      expect(recentEvents[99].source).toBe('s5')
    })
  })

  describe('clearAllSubscriptions', () => {
    it('drops every subscription across every type and returns the count', () => {
      mediator.subscribe(ProtectionEventType.DEVTOOLS_STATE_CHANGE, jest.fn())
      mediator.subscribe(ProtectionEventType.EXTENSION_DETECTED,   jest.fn())
      mediator.subscribe(ProtectionEventType.OVERLAY_SHOWN,        jest.fn())

      expect(mediator.clearAllSubscriptions()).toBe(3)
      expect(mediator.getDebugInfo().subscriptionCount).toBe(0)
    })
  })

  describe('createAndPublishEvent', () => {
    it('builds a fully-formed event and publishes it to matching subscribers', () => {
      let received: ProtectionEvent | undefined
      mediator.subscribe(ProtectionEventType.OVERLAY_SHOWN, (e) => { received = e })

      mediator.createAndPublishEvent(ProtectionEventType.OVERLAY_SHOWN, 'src-a', { x: 1 })
      expect(received).toMatchObject({
        type: ProtectionEventType.OVERLAY_SHOWN,
        source: 'src-a',
        data: { x: 1 },
      })
      expect(received?.timestamp).toBeGreaterThan(0)
    })
  })

  describe('setDebugMode', () => {
    it('flips the flag and emits the enable line when turning on', () => {
      logSpy.mockClear()
      mediator.setDebugMode(true)
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Debug mode enabled'))
    })

    it('disable path is silent (the log is debug-gated)', () => {
      mediator.setDebugMode(true)
      logSpy.mockClear()
      mediator.setDebugMode(false)
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Debug mode'))
    })
  })
})
