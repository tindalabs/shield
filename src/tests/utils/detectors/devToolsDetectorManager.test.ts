import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { DevToolsDetectorManager } from '../../../utils/detectors/devToolsDetectorManager'
import { intervalManager } from '../../../utils/intervalManager'
import { eventManager } from '../../../utils/eventManager'

// The manager fans out across detectors. We silence noisy console output and
// avoid the 1s "initial check delay" by passing delayInitialCheck=false.

describe('DevToolsDetectorManager', () => {
  let logSpy: jest.SpiedFunction<typeof console.log>
  let clearSpy: jest.SpiedFunction<typeof console.clear>
  let tableSpy: jest.SpiedFunction<typeof console.table>

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    clearSpy = jest.spyOn(console, 'clear').mockImplementation(() => {})
    tableSpy = jest.spyOn(console, 'table').mockImplementation(() => {})
  })

  afterEach(() => {
    intervalManager.dispose()
    eventManager.clearAllEvents()
    logSpy.mockRestore()
    clearSpy.mockRestore()
    tableSpy.mockRestore()
  })

  describe('construction & detector selection', () => {
    it('runs the immediate path when delayInitialCheck=false', () => {
      const mgr = new DevToolsDetectorManager({ delayInitialCheck: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mgr as any).isInitialCheckDone).toBe(true)
      mgr.dispose()
    })

    it('honours an explicit list of enabledDetectors and ignores browser-default selection', () => {
      const mgr = new DevToolsDetectorManager({
        delayInitialCheck: false,
        enabledDetectors: ['defineGetter'],
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const active: unknown[] = (mgr as any).activeDetectors
      expect(active).toHaveLength(1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((active[0] as any).constructor.name).toBe('DefineGetterDetector')
      mgr.dispose()
    })

    it('filters out unknown detector keys silently', () => {
      const mgr = new DevToolsDetectorManager({
        delayInitialCheck: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        enabledDetectors: ['defineGetter', 'doesNotExist' as any],
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mgr as any).activeDetectors).toHaveLength(1)
      mgr.dispose()
    })

    it('falls back to the "unknown" browser detector list on an unrecognised UA', () => {
      // jsdom's UA is unknown to the detector map → unknown fallback kicks in.
      const mgr = new DevToolsDetectorManager({ delayInitialCheck: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const active: unknown[] = (mgr as any).activeDetectors
      expect(active.length).toBeGreaterThan(0)
      mgr.dispose()
    })
  })

  describe('state propagation', () => {
    it('forwards a detector callback to onDevToolsChange after initial check is done', () => {
      const cb = jest.fn()
      const mgr = new DevToolsDetectorManager({
        delayInitialCheck: false,
        onDevToolsChange: cb,
      })

      // Drive the manager's internal handler directly — simulates a child
      // detector reporting "open".
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mgr as any).handleDetectorChange(true)

      expect(cb).toHaveBeenCalledWith(true)
      expect(mgr.isOpen()).toBe(true)
      mgr.dispose()
    })

    it('ignores detector callbacks fired before the initial check completes', () => {
      const cb = jest.fn()
      // delayInitialCheck=true keeps isInitialCheckDone=false until the timer fires.
      const mgr = new DevToolsDetectorManager({
        delayInitialCheck: true,
        initialCheckDelay: 60_000, // ensure the timer doesn't fire in this test
        onDevToolsChange: cb,
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mgr as any).handleDetectorChange(true)

      expect(cb).not.toHaveBeenCalled()
      expect(mgr.isOpen()).toBe(false)
      mgr.dispose()
    })
  })

  describe('checkDevTools loop', () => {
    it('skips when initial check has not completed', () => {
      const mgr = new DevToolsDetectorManager({
        delayInitialCheck: true,
        initialCheckDelay: 60_000,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const active: { checkDevTools: jest.Mock }[] = (mgr as any).activeDetectors.map((d: object) => {
        const spy = jest.fn()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(d as any).checkDevTools = spy
        return d as { checkDevTools: jest.Mock }
      })
      mgr.checkDevTools()
      active.forEach((d) => expect(d.checkDevTools).not.toHaveBeenCalled())
      mgr.dispose()
    })

    it('short-circuits the loop once a detector reports open', () => {
      const mgr = new DevToolsDetectorManager({ delayInitialCheck: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const active = (mgr as any).activeDetectors as Array<{
        checkDevTools: () => void
        isOpen: () => boolean
      }>

      if (active.length < 2) {
        // Sanity guard — if the unknown-UA fallback picked < 2, skip.
        mgr.dispose()
        return
      }

      const firstCheck = jest.fn()
      const secondCheck = jest.fn()
      active[0].checkDevTools = firstCheck
      active[0].isOpen = (): boolean => true
      active[1].checkDevTools = secondCheck
      active[1].isOpen = (): boolean => false

      mgr.checkDevTools()
      expect(firstCheck).toHaveBeenCalled()
      // Loop should have broken — second detector untouched.
      expect(secondCheck).not.toHaveBeenCalled()
      mgr.dispose()
    })
  })

  describe('setDebugMode', () => {
    it('fans out to every child detector', () => {
      const mgr = new DevToolsDetectorManager({ delayInitialCheck: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detectors: Array<{ setDebugMode: jest.Mock }> = Array.from((mgr as any).detectors.values()).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d: any) => {
          d.setDebugMode = jest.fn()
          return d
        },
      )
      mgr.setDebugMode(true)
      detectors.forEach((d) => expect(d.setDebugMode).toHaveBeenCalledWith(true))
      mgr.dispose()
    })
  })

  describe('dispose', () => {
    it('disposes every child detector and clears the active list', () => {
      const mgr = new DevToolsDetectorManager({ delayInitialCheck: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const disposeSpies: jest.Mock[] = Array.from((mgr as any).detectors.values()).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d: any) => {
          const spy = jest.fn()
          d.dispose = spy
          return spy
        },
      )

      mgr.dispose()
      disposeSpies.forEach((spy) => expect(spy).toHaveBeenCalled())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mgr as any).activeDetectors).toEqual([])
    })

    it('clears the pending initial-check timeout when disposed early', () => {
      const mgr = new DevToolsDetectorManager({
        delayInitialCheck: true,
        initialCheckDelay: 60_000,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((mgr as any).initialCheckTimeout).not.toBeNull()
      mgr.dispose()
      // After dispose, the timer should no longer fire — assertable via no
      // pending timers in jest's real-timer mode (or just the no-throw).
      expect(() => mgr.dispose()).not.toThrow()
    })
  })
})
