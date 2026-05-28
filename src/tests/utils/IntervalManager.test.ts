import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { IntervalManager } from '../../utils/intervalManager'

// IntervalManager polls registered tasks on a single shared setInterval. We use
// jest's fake timers + advanceTimersByTime to step through the polling window
// deterministically. Each test gets a fresh instance — the class constructor is
// public, so we don't share the module-level singleton's state.

describe('IntervalManager', () => {
  let mgr: IntervalManager

  beforeEach(() => {
    jest.useFakeTimers()
    mgr = new IntervalManager(false)
  })

  afterEach(() => {
    mgr.dispose()
    jest.useRealTimers()
  })

  describe('registerTask', () => {
    it('returns the id and starts polling so the callback fires after the frequency window', () => {
      const cb = jest.fn()
      const id = mgr.registerTask('t1', cb, 500)

      expect(id).toBe('t1')
      expect(cb).not.toHaveBeenCalled()

      // Default poll interval is 500ms; one tick at t=500 finds task due.
      jest.advanceTimersByTime(500)
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('appends a timestamp to keep ids unique when the same one is registered twice', () => {
      mgr.registerTask('dup', () => {}, 1000)
      const secondId = mgr.registerTask('dup', () => {}, 1000)

      // The second registration must not overwrite the first.
      expect(secondId).not.toBe('dup')
      expect(mgr.getTasksStatus()).toHaveLength(2)
    })

    it('fires repeatedly at its registered cadence', () => {
      const cb = jest.fn()
      mgr.registerTask('t1', cb, 500)

      jest.advanceTimersByTime(500)
      jest.advanceTimersByTime(500)
      jest.advanceTimersByTime(500)

      expect(cb).toHaveBeenCalledTimes(3)
    })
  })

  describe('unregisterTask', () => {
    it('removes the task so it no longer fires', () => {
      const cb = jest.fn()
      mgr.registerTask('t1', cb, 500)

      expect(mgr.unregisterTask('t1')).toBe(true)
      jest.advanceTimersByTime(2000)
      expect(cb).not.toHaveBeenCalled()
    })

    it('returns false for unknown ids', () => {
      expect(mgr.unregisterTask('nope')).toBe(false)
    })

    it('stops the underlying interval once the last task is removed', () => {
      const clearSpy = jest.spyOn(window, 'clearInterval')
      mgr.registerTask('t1', () => {}, 500)
      mgr.unregisterTask('t1')

      expect(clearSpy).toHaveBeenCalled()
      clearSpy.mockRestore()
    })
  })

  describe('pause / resume', () => {
    it('pauseTask stops the callback from firing without removing it', () => {
      const cb = jest.fn()
      mgr.registerTask('t1', cb, 500)

      expect(mgr.pauseTask('t1')).toBe(true)
      jest.advanceTimersByTime(2000)
      expect(cb).not.toHaveBeenCalled()
      // Task is still tracked.
      expect(mgr.getTasksStatus()).toHaveLength(1)
    })

    it('resumeTask brings a paused task back into rotation', () => {
      const cb = jest.fn()
      mgr.registerTask('t1', cb, 500)
      mgr.pauseTask('t1')

      jest.advanceTimersByTime(1000) // paused, no fires
      expect(cb).not.toHaveBeenCalled()

      mgr.resumeTask('t1')
      jest.advanceTimersByTime(500)
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('returns false on pause/resume for unknown ids', () => {
      expect(mgr.pauseTask('nope')).toBe(false)
      expect(mgr.resumeTask('nope')).toBe(false)
    })
  })

  describe('executeTaskNow', () => {
    it('runs the callback immediately without waiting for the next tick', () => {
      const cb = jest.fn()
      mgr.registerTask('t1', cb, 10_000)

      expect(mgr.executeTaskNow('t1')).toBe(true)
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('returns false for unknown or paused tasks', () => {
      const cb = jest.fn()
      mgr.registerTask('t1', cb, 1000)
      mgr.pauseTask('t1')
      // Paused tasks are skipped by executeTaskNow.
      expect(mgr.executeTaskNow('t1')).toBe(false)
      expect(mgr.executeTaskNow('does-not-exist')).toBe(false)
    })

    it('swallows callback errors and reports failure', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      mgr.registerTask('t1', () => { throw new Error('boom') }, 1000)

      expect(mgr.executeTaskNow('t1')).toBe(false)
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })

  describe('isolation', () => {
    it('a throwing periodic task does not stop other tasks from running', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const good = jest.fn()
      mgr.registerTask('bad', () => { throw new Error('boom') }, 500)
      mgr.registerTask('good', good, 500)

      jest.advanceTimersByTime(500)
      expect(good).toHaveBeenCalledTimes(1)
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })

  describe('getTasksStatus', () => {
    it('reports id, active state, frequency and timing info per task', () => {
      mgr.registerTask('t1', () => {}, 500)
      mgr.registerTask('t2', () => {}, 1000)
      mgr.pauseTask('t2')

      const statuses = mgr.getTasksStatus()
      expect(statuses).toHaveLength(2)
      const t1 = statuses.find((s) => s.id === 't1')!
      const t2 = statuses.find((s) => s.id === 't2')!
      expect(t1.isActive).toBe(true)
      expect(t1.frequency).toBe(500)
      expect(t2.isActive).toBe(false)
      expect(t2.frequency).toBe(1000)
    })
  })

  describe('setIntervalFrequency', () => {
    it('warns when the requested frequency is dangerously short', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      mgr.setIntervalFrequency(50)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('below 100ms'))
      warnSpy.mockRestore()
    })

    it('restarts the running interval at the new cadence', () => {
      const cb = jest.fn()
      mgr.registerTask('t1', cb, 200)
      // Default 500ms tick — no fire yet at 200ms.
      jest.advanceTimersByTime(200)
      expect(cb).not.toHaveBeenCalled()

      // Tighten the poll cadence to 100ms; next 200ms should trigger now.
      mgr.setIntervalFrequency(100)
      jest.advanceTimersByTime(200)
      expect(cb).toHaveBeenCalled()
    })
  })

  describe('dispose', () => {
    it('clears all tasks and stops the underlying interval', () => {
      const cb = jest.fn()
      mgr.registerTask('t1', cb, 500)

      mgr.dispose()
      expect(mgr.getTasksStatus()).toHaveLength(0)

      jest.advanceTimersByTime(2000)
      expect(cb).not.toHaveBeenCalled()
    })
  })

  describe('setDebugMode', () => {
    it('toggles the logger and emits the enable line', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      mgr.setDebugMode(true)
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Debug mode enabled'))
      mgr.setDebugMode(false)
      logSpy.mockRestore()
    })
  })
})
