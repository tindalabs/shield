import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { EventManager } from '../../utils/eventManager'

// EventManager is a process-wide singleton with a private constructor; we
// can't instantiate fresh per test, so clearAllEvents in beforeEach is our
// isolation primitive. Tests use document / window / DOM elements to cover
// the three target-storage paths (DOCUMENT_SYMBOL, WINDOW_SYMBOL, WeakMap).

describe('EventManager', () => {
  let mgr: EventManager

  beforeEach(() => {
    mgr = EventManager.getInstance(false)
    mgr.clearAllEvents()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    mgr.clearAllEvents()
    document.body.innerHTML = ''
  })

  describe('singleton', () => {
    it('getInstance returns the same instance across calls', () => {
      expect(EventManager.getInstance()).toBe(EventManager.getInstance())
    })
  })

  describe('addEventListener', () => {
    it('registers a listener on document and returns a non-empty id', () => {
      const handler = jest.fn()
      const id = mgr.addEventListener(document, 'click', handler, 'owner-1')

      expect(id).toBeTruthy()
      expect(mgr.hasEvent(document, id)).toBe(true)
      expect(mgr.getEventCount()).toBe(1)

      // Listener actually fires when the event is dispatched.
      document.dispatchEvent(new Event('click'))
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('returns "" when target is null', () => {
      const id = mgr.addEventListener(null, 'click', jest.fn(), 'owner-1')
      expect(id).toBe('')
      expect(mgr.getEventCount()).toBe(0)
    })

    it('honours a caller-supplied id', () => {
      const id = mgr.addEventListener(document, 'click', jest.fn(), 'owner-1', { id: 'my-custom-id' })
      expect(id).toBe('my-custom-id')
      expect(mgr.hasEvent(document, 'my-custom-id')).toBe(true)
    })

    it('isolates listener exceptions — error is logged, propagation continues', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const throwing = jest.fn(() => { throw new Error('boom') })
      const followup = jest.fn()

      mgr.addEventListener(document, 'click', throwing, 'A')
      mgr.addEventListener(document, 'click', followup, 'B')

      expect(() => document.dispatchEvent(new Event('click'))).not.toThrow()
      expect(throwing).toHaveBeenCalled()
      expect(followup).toHaveBeenCalled()
      expect(errSpy).toHaveBeenCalled()

      errSpy.mockRestore()
    })

    it('supports DOM-element targets via the internal WeakMap', () => {
      const el = document.createElement('button')
      document.body.appendChild(el)

      const id = mgr.addEventListener(el, 'click', jest.fn(), 'owner-1')
      expect(id).toBeTruthy()
      expect(mgr.hasEvent(el, id)).toBe(true)
    })
  })

  describe('removeEventListener', () => {
    it('detaches the wrapped listener so it no longer fires', () => {
      const handler = jest.fn()
      const id = mgr.addEventListener(document, 'click', handler, 'owner-1')

      expect(mgr.removeEventListener(document, id)).toBe(true)
      document.dispatchEvent(new Event('click'))

      expect(handler).not.toHaveBeenCalled()
      expect(mgr.hasEvent(document, id)).toBe(false)
    })

    it('returns false for unknown ids and null targets', () => {
      expect(mgr.removeEventListener(document, 'does-not-exist')).toBe(false)
      expect(mgr.removeEventListener(null, 'anything')).toBe(false)
    })
  })

  describe('removeEventsByOwner', () => {
    it('removes every event for the given owner and leaves others intact', () => {
      mgr.addEventListener(document, 'click',       jest.fn(), 'A')
      mgr.addEventListener(document, 'keydown',     jest.fn(), 'A')
      mgr.addEventListener(window,   'resize',      jest.fn(), 'A')
      mgr.addEventListener(document, 'contextmenu', jest.fn(), 'B')

      const removed = mgr.removeEventsByOwner('A')
      expect(removed).toBe(3)
      expect(mgr.getEventsByOwner('A')).toEqual([])
      expect(mgr.getEventsByOwner('B')).toHaveLength(1)
    })

    it('returns 0 when the owner has no registered events', () => {
      expect(mgr.removeEventsByOwner('nobody-owns-anything')).toBe(0)
    })

    it('cleans up element-target entries even when looked up through the WeakMap warning path', () => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      mgr.addEventListener(el, 'click', jest.fn(), 'owner-1')

      // The WeakMap-lookup path emits a warning by design — silence it so the
      // jest output stays clean.
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const removed = mgr.removeEventsByOwner('owner-1')
      warnSpy.mockRestore()

      expect(removed).toBeGreaterThanOrEqual(1)
      expect(mgr.getEventsByOwner('owner-1')).toEqual([])
    })
  })

  describe('removeAllEventsForTarget', () => {
    it('removes every event tied to a specific target', () => {
      mgr.addEventListener(document, 'click',   jest.fn(), 'A')
      mgr.addEventListener(document, 'keydown', jest.fn(), 'B')
      mgr.addEventListener(window,   'resize',  jest.fn(), 'A')

      const removed = mgr.removeAllEventsForTarget(document)
      expect(removed).toBe(2)
      expect(mgr.getEventCount()).toBe(1) // the window resize survives
    })

    it('returns 0 for null targets and unknown targets', () => {
      expect(mgr.removeAllEventsForTarget(null)).toBe(0)
      const fresh = document.createElement('div')
      expect(mgr.removeAllEventsForTarget(fresh)).toBe(0)
    })
  })

  describe('getEventsByOwner', () => {
    it('returns every event id belonging to an owner across targets', () => {
      const a1 = mgr.addEventListener(document, 'click',   jest.fn(), 'A')
      const a2 = mgr.addEventListener(window,   'resize',  jest.fn(), 'A')
      mgr.addEventListener(document, 'keydown', jest.fn(), 'B')

      const ids = mgr.getEventsByOwner('A')
      expect(ids).toEqual(expect.arrayContaining([a1, a2]))
      expect(ids).toHaveLength(2)
    })
  })

  describe('hasEvent', () => {
    it('returns false for null targets, unknown ids, and untracked targets', () => {
      expect(mgr.hasEvent(null, 'x')).toBe(false)
      expect(mgr.hasEvent(document, 'never-registered')).toBe(false)
      const fresh = document.createElement('div')
      expect(mgr.hasEvent(fresh, 'never-registered')).toBe(false)
    })
  })

  describe('getEventCount', () => {
    it('reflects registrations and removals across multiple targets', () => {
      expect(mgr.getEventCount()).toBe(0)
      mgr.addEventListener(document, 'click', jest.fn(), 'A')
      mgr.addEventListener(window, 'resize', jest.fn(), 'A')
      expect(mgr.getEventCount()).toBe(2)
      mgr.removeEventsByOwner('A')
      expect(mgr.getEventCount()).toBe(0)
    })
  })

  describe('getDebugInfo', () => {
    it('aggregates totals, per-owner counts, per-type counts and event details', () => {
      mgr.addEventListener(document, 'click',   jest.fn(), 'A', { priority: 5 })
      mgr.addEventListener(document, 'click',   jest.fn(), 'B')
      mgr.addEventListener(window,   'keydown', jest.fn(), 'A')

      const info = mgr.getDebugInfo()
      expect(info.totalEvents).toBe(3)
      expect(info.eventsByOwner).toEqual({ A: 2, B: 1 })
      expect(info.eventsByType).toEqual({ click: 2, keydown: 1 })
      expect(info.eventDetails).toHaveLength(3)
      expect(info.eventDetails.some((e) => e.priority === 5)).toBe(true)
    })
  })

  describe('clearAllEvents', () => {
    it('drops document, window, and element entries in one shot', () => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      mgr.addEventListener(document, 'click', jest.fn(), 'A')
      mgr.addEventListener(window,   'resize', jest.fn(), 'A')
      mgr.addEventListener(el,       'click', jest.fn(), 'B')

      const removed = mgr.clearAllEvents()
      expect(removed).toBe(3)
      expect(mgr.getEventCount()).toBe(0)
    })

    it('returns 0 when there is nothing registered', () => {
      expect(mgr.clearAllEvents()).toBe(0)
    })
  })

  describe('hasRegisteredEventType', () => {
    it('reports true only for the exact owner + eventType + target combination', () => {
      mgr.addEventListener(document, 'click', jest.fn(), 'A')

      expect(mgr.hasRegisteredEventType(document, 'click', 'A')).toBe(true)
      expect(mgr.hasRegisteredEventType(document, 'click', 'B')).toBe(false)
      expect(mgr.hasRegisteredEventType(document, 'keydown', 'A')).toBe(false)
    })

    it('returns false for null target', () => {
      expect(mgr.hasRegisteredEventType(null, 'click', 'A')).toBe(false)
    })
  })

  describe('checkForConflicts', () => {
    it('flags other owners listening to the same event type on the same target', () => {
      const aId = mgr.addEventListener(document, 'click', jest.fn(), 'A')
      mgr.addEventListener(document, 'click', jest.fn(), 'B')

      const conflicts = mgr.checkForConflicts(document, 'click', 'B')
      expect(conflicts.hasConflicts).toBe(true)
      expect(conflicts.conflictsWith).toEqual([{ owner: 'A', eventId: aId }])
    })

    it('does not flag the same owner as a conflict with itself', () => {
      mgr.addEventListener(document, 'click', jest.fn(), 'A')
      const conflicts = mgr.checkForConflicts(document, 'click', 'A')
      expect(conflicts.hasConflicts).toBe(false)
      expect(conflicts.conflictsWith).toEqual([])
    })

    it('returns an empty result for null targets or untracked targets', () => {
      expect(mgr.checkForConflicts(null, 'click', 'A').hasConflicts).toBe(false)
      const fresh = document.createElement('div')
      expect(mgr.checkForConflicts(fresh, 'click', 'A').hasConflicts).toBe(false)
    })
  })

  describe('getEventsByType', () => {
    it('returns only events of the requested type, sorted by descending priority', () => {
      mgr.addEventListener(document, 'click', jest.fn(), 'low',  { priority: 1 })
      mgr.addEventListener(document, 'click', jest.fn(), 'high', { priority: 10 })
      mgr.addEventListener(document, 'click', jest.fn(), 'mid',  { priority: 5 })
      mgr.addEventListener(document, 'keydown', jest.fn(), 'other')

      const clicks = mgr.getEventsByType(document, 'click')
      expect(clicks).toHaveLength(3)
      expect(clicks.map((e) => e.owner)).toEqual(['high', 'mid', 'low'])
    })

    it('returns [] for null targets and unknown event types', () => {
      expect(mgr.getEventsByType(null, 'click')).toEqual([])
      expect(mgr.getEventsByType(document, 'never-fired')).toEqual([])
    })
  })

  describe('removeEventsBySelector', () => {
    it('detaches the listener and drops bookkeeping for every matching element', () => {
      const el1 = document.createElement('div'); el1.className = 'target'
      const el2 = document.createElement('div'); el2.className = 'target'
      document.body.append(el1, el2)

      const h1 = jest.fn(); const h2 = jest.fn()
      mgr.addEventListener(el1, 'click', h1, 'owner-1')
      mgr.addEventListener(el2, 'click', h2, 'owner-1')

      const removed = mgr.removeEventsBySelector('.target', 'click', 'owner-1')
      expect(removed).toBe(2)

      el1.dispatchEvent(new Event('click'))
      el2.dispatchEvent(new Event('click'))
      expect(h1).not.toHaveBeenCalled()
      expect(h2).not.toHaveBeenCalled()
    })

    it('only removes events matching the requested owner + type', () => {
      const el = document.createElement('div'); el.className = 'target'
      document.body.append(el)

      mgr.addEventListener(el, 'click',   jest.fn(), 'owner-1')
      mgr.addEventListener(el, 'keydown', jest.fn(), 'owner-1')
      mgr.addEventListener(el, 'click',   jest.fn(), 'owner-2')

      const removed = mgr.removeEventsBySelector('.target', 'click', 'owner-1')
      expect(removed).toBe(1)
      expect(mgr.getEventCount()).toBe(2)
    })

    it('returns 0 when nothing matches the selector', () => {
      expect(mgr.removeEventsBySelector('.nothing-here', 'click', 'owner-1')).toBe(0)
    })

    it('swallows errors raised by invalid selectors', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const result = mgr.removeEventsBySelector('>>> invalid <<<', 'click', 'owner-1')
      expect(result).toBe(0)
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })

  describe('setDebugMode', () => {
    it('flips the underlying logger and emits the enable line', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      mgr.setDebugMode(true)
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Debug mode enabled'))
      mgr.setDebugMode(false)
      logSpy.mockRestore()
    })
  })
})
