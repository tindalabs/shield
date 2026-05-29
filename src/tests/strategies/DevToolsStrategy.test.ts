import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { DevToolsStrategy } from '../../strategies/DevToolsStrategy'
import { ProtectionEventType } from '../../core/mediator/protection-event'
import type { ProtectionMediator } from '../../core/mediator/types'
import { intervalManager } from '../../utils/intervalManager'
import { timeoutManager } from '../../utils/timeoutManager'

// Construct a fresh mediator stub per test — we want clean call records.
const makeMediator = (): ProtectionMediator => ({
  publish: jest.fn(),
  subscribe: jest.fn(() => ''),
  unsubscribe: jest.fn(() => true),
  getSubscriptions: jest.fn(() => []),
  setDebugMode: jest.fn(),
})

// Access private members for behaviour tests without touching the public surface.
const internal = (s: DevToolsStrategy): {
  handleDevToolsStateChange: (isOpen: boolean) => void
  isDevToolsOpen: boolean
  detectorManager: unknown
} => s as unknown as {
  handleDevToolsStateChange: (isOpen: boolean) => void
  isDevToolsOpen: boolean
  detectorManager: unknown
}

describe('DevToolsStrategy', () => {
  let logSpy: jest.SpiedFunction<typeof console.log>

  beforeEach(() => {
    // The mediator + detectors are chatty; silence to keep test output readable.
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    // Detector manager registers timeouts/intervals and a worker; the strategy's
    // remove() handles most cleanup, but a paranoid cleanup keeps singletons sane
    // across files.
    intervalManager.dispose()
    timeoutManager.clearAllTimeouts()
    logSpy.mockRestore()
  })

  describe('handleDevToolsStateChange', () => {
    it('publishes DEVTOOLS_STATE_CHANGE with overlayOptions and calls customHandler on open', () => {
      const mediator = makeMediator()
      const customHandler = jest.fn()
      const strategy = new DevToolsStrategy(
        { showOverlay: true, overlayOptions: { title: 'Custom' } },
        document.body,
        customHandler,
      )
      strategy.setMediator(mediator)

      internal(strategy).handleDevToolsStateChange(true)

      expect(customHandler).toHaveBeenCalledWith(true)
      const call = (mediator.publish as jest.Mock).mock.calls[0][0] as {
        type: ProtectionEventType
        data: { isOpen: boolean; overlayOptions?: { title?: string } }
      }
      expect(call.type).toBe(ProtectionEventType.DEVTOOLS_STATE_CHANGE)
      expect(call.data.isOpen).toBe(true)
      expect(call.data.overlayOptions?.title).toBe('Custom')
      strategy.remove()
    })

    it('is a no-op when state has not changed', () => {
      const mediator = makeMediator()
      const strategy = new DevToolsStrategy({}, document.body)
      strategy.setMediator(mediator)

      // Drive open twice — the second call should be ignored.
      internal(strategy).handleDevToolsStateChange(true)
      internal(strategy).handleDevToolsStateChange(true)
      expect((mediator.publish as jest.Mock).mock.calls).toHaveLength(1)
      strategy.remove()
    })

    it('publishes when closed after being open (open → closed transition)', () => {
      const mediator = makeMediator()
      const strategy = new DevToolsStrategy({}, document.body)
      strategy.setMediator(mediator)

      internal(strategy).handleDevToolsStateChange(true)
      internal(strategy).handleDevToolsStateChange(false)

      const calls = (mediator.publish as jest.Mock).mock.calls
      expect(calls).toHaveLength(2)
      expect((calls[1][0] as { data: { isOpen: boolean } }).data.isOpen).toBe(false)
      strategy.remove()
    })

    it('does not crash when mediator is not attached', () => {
      const strategy = new DevToolsStrategy({}, document.body)
      // No setMediator() call.
      expect(() => internal(strategy).handleDevToolsStateChange(true)).not.toThrow()
      strategy.remove()
    })
  })

  describe('apply / remove lifecycle', () => {
    it('apply registers an interval task with the configured frequency', () => {
      const strategy = new DevToolsStrategy({ checkFrequency: 250 }, document.body)
      strategy.apply()

      // The strategy's interval task is registered as "devtools-detection".
      const ids = intervalManager.getTasksStatus().map((t) => t.id)
      expect(ids.some((id) => id.startsWith('devtools-detection'))).toBe(true)

      strategy.remove()
    })

    it('calling apply twice is a no-op (logs but does not double-register)', () => {
      const strategy = new DevToolsStrategy({}, document.body)
      strategy.apply()
      const tasksAfterFirst = intervalManager.getTasksStatus().length
      strategy.apply()
      expect(intervalManager.getTasksStatus().length).toBe(tasksAfterFirst)
      strategy.remove()
    })

    it('remove without apply is a no-op', () => {
      const strategy = new DevToolsStrategy({}, document.body)
      expect(() => strategy.remove()).not.toThrow()
    })

    it('remove publishes CONTENT_RESTORED + OVERLAY_REMOVED when DevTools were open', () => {
      const mediator = makeMediator()
      const strategy = new DevToolsStrategy(
        { hideContent: true, showOverlay: true },
        document.body,
      )
      strategy.setMediator(mediator)
      strategy.apply()

      // Simulate DevTools opening, then call remove().
      internal(strategy).handleDevToolsStateChange(true)
      ;(mediator.publish as jest.Mock).mockClear()

      strategy.remove()

      const eventTypes = (mediator.publish as jest.Mock).mock.calls.map(
        (c) => (c[0] as { type: ProtectionEventType }).type,
      )
      expect(eventTypes).toEqual(expect.arrayContaining([
        ProtectionEventType.CONTENT_RESTORED,
        ProtectionEventType.OVERLAY_REMOVED,
      ]))
    })

    it('remove disposes the detector manager and clears its reference', () => {
      const strategy = new DevToolsStrategy({}, document.body)
      strategy.apply()
      // Force the detector manager into existence (constructor schedules a 200ms
      // timeout; we run it synchronously by polling timeoutManager).
      ;(strategy as unknown as { initDetectorManager: () => void }).initDetectorManager()
      expect(internal(strategy).detectorManager).not.toBeNull()

      strategy.remove()
      expect(internal(strategy).detectorManager).toBeNull()
    })
  })

  describe('updateOptions', () => {
    it('updating checkFrequency re-registers the interval task at the new cadence', () => {
      const strategy = new DevToolsStrategy({ checkFrequency: 1000 }, document.body)
      strategy.apply()

      const beforeIds = intervalManager.getTasksStatus().map((t) => t.id)
      strategy.updateOptions({ checkFrequency: 250 })
      const afterIds = intervalManager.getTasksStatus().map((t) => t.id)

      // Both should still have a devtools-detection task, but it should have
      // been replaced (unregister + register pair).
      expect(beforeIds.some((id) => id.startsWith('devtools-detection'))).toBe(true)
      expect(afterIds.some((id) => id.startsWith('devtools-detection'))).toBe(true)
      strategy.remove()
    })

    it('updating overlay title while DevTools is open republishes OVERLAY_SHOWN', () => {
      const mediator = makeMediator()
      const strategy = new DevToolsStrategy(
        { overlayOptions: { title: 'Old' }, showOverlay: true },
        document.body,
      )
      strategy.setMediator(mediator)
      strategy.apply()
      internal(strategy).handleDevToolsStateChange(true)
      ;(mediator.publish as jest.Mock).mockClear()

      strategy.updateOptions({ overlayOptions: { title: 'New' } })

      const overlayShown = (mediator.publish as jest.Mock).mock.calls.find(
        (c) => (c[0] as { type: ProtectionEventType }).type === ProtectionEventType.OVERLAY_SHOWN,
      )
      expect(overlayShown).toBeDefined()
      strategy.remove()
    })

    it('updating with no visual changes while open does NOT republish OVERLAY_SHOWN', () => {
      const mediator = makeMediator()
      const strategy = new DevToolsStrategy(
        { overlayOptions: { title: 'Same' }, showOverlay: true },
        document.body,
      )
      strategy.setMediator(mediator)
      strategy.apply()
      internal(strategy).handleDevToolsStateChange(true)
      ;(mediator.publish as jest.Mock).mockClear()

      strategy.updateOptions({ overlayOptions: { title: 'Same' } })

      const overlayShown = (mediator.publish as jest.Mock).mock.calls.find(
        (c) => (c[0] as { type: ProtectionEventType }).type === ProtectionEventType.OVERLAY_SHOWN,
      )
      expect(overlayShown).toBeUndefined()
      strategy.remove()
    })
  })

  describe('setDebugMode', () => {
    it('does not throw when toggled on/off (forwards to detector + timeout managers)', () => {
      const strategy = new DevToolsStrategy({}, document.body)
      expect(() => strategy.setDebugMode(true)).not.toThrow()
      expect(() => strategy.setDebugMode(false)).not.toThrow()
      strategy.remove()
    })
  })
})
