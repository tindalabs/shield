import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { TimeoutManager } from '../../utils/timeoutManager'

// TimeoutManager is a process-wide singleton with a private constructor; we
// cannot get a fresh instance per test. clearAllTimeouts + jest fake timers
// gives us deterministic isolation without leaking state across tests.

describe('TimeoutManager', () => {
  let mgr: TimeoutManager

  beforeEach(() => {
    jest.useFakeTimers()
    mgr = TimeoutManager.getInstance(false)
    mgr.clearAllTimeouts()
  })

  afterEach(() => {
    mgr.clearAllTimeouts()
    jest.useRealTimers()
  })

  describe('singleton', () => {
    it('getInstance returns the same instance across calls', () => {
      expect(TimeoutManager.getInstance()).toBe(TimeoutManager.getInstance())
    })
  })

  describe('setTimeout', () => {
    it('schedules a callback and fires it after the delay', () => {
      const cb = jest.fn()
      mgr.setTimeout('t1', cb, 1000)

      expect(mgr.hasTimeout('t1')).toBe(true)
      expect(mgr.getTimeoutCount()).toBe(1)
      expect(cb).not.toHaveBeenCalled()

      jest.advanceTimersByTime(1000)
      expect(cb).toHaveBeenCalledTimes(1)
      // After firing, the manager forgets the id.
      expect(mgr.hasTimeout('t1')).toBe(false)
    })

    it('replaces an existing timeout when reusing the same id', () => {
      const first = jest.fn()
      const second = jest.fn()
      mgr.setTimeout('t1', first, 1000)
      mgr.setTimeout('t1', second, 1000)

      // Still just one tracked timeout, not two.
      expect(mgr.getTimeoutCount()).toBe(1)

      jest.advanceTimersByTime(1000)
      expect(first).not.toHaveBeenCalled()
      expect(second).toHaveBeenCalledTimes(1)
    })

    it('returns the id passed in (used as a handle by callers)', () => {
      expect(mgr.setTimeout('my-id', () => {}, 100)).toBe('my-id')
    })

    it('isolates callback exceptions from the manager (logger absorbs them)', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      mgr.setTimeout('bad', () => { throw new Error('boom') }, 10)

      expect(() => jest.advanceTimersByTime(10)).not.toThrow()
      expect(errSpy).toHaveBeenCalled()
      expect(mgr.hasTimeout('bad')).toBe(false)

      errSpy.mockRestore()
    })
  })

  describe('clearTimeout', () => {
    it('cancels a pending timeout and reports success', () => {
      const cb = jest.fn()
      mgr.setTimeout('t1', cb, 1000)

      expect(mgr.clearTimeout('t1')).toBe(true)
      expect(mgr.hasTimeout('t1')).toBe(false)

      jest.advanceTimersByTime(1000)
      expect(cb).not.toHaveBeenCalled()
    })

    it('returns false for an unknown id', () => {
      expect(mgr.clearTimeout('does-not-exist')).toBe(false)
    })
  })

  describe('clearAllTimeouts', () => {
    it('cancels every pending timeout and returns the count', () => {
      const cb = jest.fn()
      mgr.setTimeout('a', cb, 100)
      mgr.setTimeout('b', cb, 200)
      mgr.setTimeout('c', cb, 300)

      expect(mgr.clearAllTimeouts()).toBe(3)
      expect(mgr.getTimeoutCount()).toBe(0)

      jest.advanceTimersByTime(1000)
      expect(cb).not.toHaveBeenCalled()
    })

    it('returns 0 when no timeouts are pending', () => {
      expect(mgr.clearAllTimeouts()).toBe(0)
    })
  })

  describe('setDebugMode', () => {
    it('flips the underlying logger on, emitting the enable line', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      mgr.setDebugMode(true)
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Debug mode enabled'))
      // Reset so other tests aren't noisy.
      mgr.setDebugMode(false)
      logSpy.mockRestore()
    })
  })
})
