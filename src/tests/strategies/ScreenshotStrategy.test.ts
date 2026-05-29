import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { ScreenshotStrategy } from '../../strategies/ScreenshotStrategy'
import { ProtectionEventType } from '../../core/mediator/protection-event'
import type { ProtectionMediator } from '../../core/mediator/types'
import { eventManager } from '../../utils/eventManager'
import { timeoutManager } from '../../utils/timeoutManager'

const makeMediator = (): ProtectionMediator => ({
  publish: jest.fn(),
  subscribe: jest.fn(() => ''),
  unsubscribe: jest.fn(() => true),
  getSubscriptions: jest.fn(() => []),
  setDebugMode: jest.fn(),
})

const keyEvent = (
  key: string,
  type: 'keydown' | 'keyup' = 'keydown',
  mods: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; alt: boolean; code: string; keyCode: number }> = {},
): KeyboardEvent => new KeyboardEvent(type, {
  key,
  code: mods.code ?? '',
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  shiftKey: mods.shift ?? false,
  altKey: mods.alt ?? false,
})

const publishedTypes = (mediator: ProtectionMediator): ProtectionEventType[] =>
  (mediator.publish as jest.Mock).mock.calls.map(
    (c) => (c[0] as { type: ProtectionEventType }).type,
  )

describe('ScreenshotStrategy', () => {
  let logSpy: jest.SpiedFunction<typeof console.log>

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    eventManager.clearAllEvents()
    timeoutManager.clearAllTimeouts()
    logSpy.mockRestore()
  })

  describe('apply / remove lifecycle', () => {
    it('apply registers keydown/keyup/blur/focus/visibilitychange events', () => {
      const strategy = new ScreenshotStrategy({}, document.body)
      strategy.apply()

      // Strategy registers events under its STRATEGY_NAME.
      const ids = eventManager.getEventsByOwner('ScreenshotStrategy')
      expect(ids.length).toBeGreaterThanOrEqual(5)
      strategy.remove()
    })

    it('calling apply twice does not throw (idempotency guard)', () => {
      const strategy = new ScreenshotStrategy({}, document.body)
      strategy.apply()
      expect(() => strategy.apply()).not.toThrow()
      strategy.remove()
    })

    it('remove without apply is a safe no-op', () => {
      const strategy = new ScreenshotStrategy({}, document.body)
      expect(() => strategy.remove()).not.toThrow()
    })

    it('apply-then-remove cycle does not throw', () => {
      const strategy = new ScreenshotStrategy({}, document.body)
      strategy.apply()
      expect(() => strategy.remove()).not.toThrow()
    })

    it('omits fullscreen event registration when preventFullscreen=false', () => {
      const strategy = new ScreenshotStrategy({ preventFullscreen: false }, document.body)
      strategy.apply()

      // No fullscreen-related events should be tracked. Inspect by type.
      const fullscreenEvents = eventManager
        .getEventsByType(document, 'fullscreenchange')
        .filter((e) => e.owner === 'ScreenshotStrategy')
      expect(fullscreenEvents).toHaveLength(0)
      strategy.remove()
    })
  })

  describe('handleKeyDown', () => {
    it('F12 is allowed through (no screenshot/fullscreen action)', () => {
      const mediator = makeMediator()
      const customHandler = jest.fn()
      const strategy = new ScreenshotStrategy({}, document.body, customHandler)
      strategy.setMediator(mediator)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleKeyDown(keyEvent('F12'))

      expect(customHandler).not.toHaveBeenCalled()
      expect(mediator.publish).not.toHaveBeenCalled()
      strategy.remove()
    })

    it('PrintScreen on keydown publishes OVERLAY_SHOWN and calls customHandler', () => {
      const mediator = makeMediator()
      const customHandler = jest.fn()
      const strategy = new ScreenshotStrategy({}, document.body, customHandler)
      strategy.setMediator(mediator)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleKeyDown(keyEvent('PrintScreen'))

      expect(publishedTypes(mediator)).toContain(ProtectionEventType.OVERLAY_SHOWN)
      expect(customHandler).toHaveBeenCalled()
      strategy.remove()
    })

    it('non-matching keys are ignored', () => {
      const mediator = makeMediator()
      const strategy = new ScreenshotStrategy({}, document.body)
      strategy.setMediator(mediator)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleKeyDown(keyEvent('a'))

      expect(mediator.publish).not.toHaveBeenCalled()
      strategy.remove()
    })
  })

  describe('handleKeyUp', () => {
    it('PrintScreen on keyup triggers a screenshot notification', () => {
      const mediator = makeMediator()
      const customHandler = jest.fn()
      const strategy = new ScreenshotStrategy({}, document.body, customHandler)
      strategy.setMediator(mediator)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleKeyUp(keyEvent('PrintScreen', 'keyup'))

      expect(publishedTypes(mediator)).toContain(ProtectionEventType.OVERLAY_SHOWN)
      expect(customHandler).toHaveBeenCalled()
      strategy.remove()
    })

    it('regular keys on keyup are ignored', () => {
      const mediator = makeMediator()
      const strategy = new ScreenshotStrategy({}, document.body)
      strategy.setMediator(mediator)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleKeyUp(keyEvent('Enter', 'keyup'))

      expect(mediator.publish).not.toHaveBeenCalled()
      strategy.remove()
    })
  })

  describe('blur / visibility heuristics', () => {
    it('window blur shortly after a key event triggers a notification', () => {
      const mediator = makeMediator()
      const customHandler = jest.fn()
      const strategy = new ScreenshotStrategy({}, document.body, customHandler)
      strategy.setMediator(mediator)

      // Simulate recent keypress, then blur.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).lastKeyEvent = Date.now()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleWindowBlur()

      expect(publishedTypes(mediator)).toContain(ProtectionEventType.OVERLAY_SHOWN)
      expect(customHandler).toHaveBeenCalled()
      strategy.remove()
    })

    it('window blur LONG after a key event is ignored', () => {
      const mediator = makeMediator()
      const strategy = new ScreenshotStrategy({}, document.body)
      strategy.setMediator(mediator)

      // Pretend the last key event was 10 seconds ago — outside the 500ms window.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).lastKeyEvent = Date.now() - 10_000
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleWindowBlur()

      expect(mediator.publish).not.toHaveBeenCalled()
      strategy.remove()
    })

    it('handleVisibilityChange only acts when document is hidden AND recent key event', () => {
      const mediator = makeMediator()
      const strategy = new ScreenshotStrategy({}, document.body)
      strategy.setMediator(mediator)

      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).lastKeyEvent = Date.now()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleVisibilityChange()

      expect(publishedTypes(mediator)).toContain(ProtectionEventType.OVERLAY_SHOWN)

      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      strategy.remove()
    })

    it('handleVisibilityChange does nothing when document is visible', () => {
      const mediator = makeMediator()
      const strategy = new ScreenshotStrategy({}, document.body)
      strategy.setMediator(mediator)

      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleVisibilityChange()

      expect(mediator.publish).not.toHaveBeenCalled()
      strategy.remove()
    })
  })

  describe('print + beforeprint', () => {
    it('handlePrint publishes a screenshot notification + calls customHandler', () => {
      const mediator = makeMediator()
      const customHandler = jest.fn()
      const strategy = new ScreenshotStrategy({}, document.body, customHandler)
      strategy.setMediator(mediator)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handlePrint()

      expect(publishedTypes(mediator)).toContain(ProtectionEventType.OVERLAY_SHOWN)
      expect(customHandler).toHaveBeenCalled()
      strategy.remove()
    })

    it('handleBeforePrint publishes a screenshot notification + calls customHandler', () => {
      const mediator = makeMediator()
      const customHandler = jest.fn()
      const strategy = new ScreenshotStrategy({}, document.body, customHandler)
      strategy.setMediator(mediator)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleBeforePrint()

      expect(publishedTypes(mediator)).toContain(ProtectionEventType.OVERLAY_SHOWN)
      expect(customHandler).toHaveBeenCalled()
      strategy.remove()
    })
  })

  describe('handleFullscreenChange', () => {
    it('is a no-op when preventFullscreen=false', () => {
      const mediator = makeMediator()
      const strategy = new ScreenshotStrategy({ preventFullscreen: false }, document.body)
      strategy.setMediator(mediator)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleFullscreenChange()

      expect(mediator.publish).not.toHaveBeenCalled()
      strategy.remove()
    })

    it('exits fullscreen and shows a fullscreen-disabled notification when in fullscreen', () => {
      const mediator = makeMediator()
      const customHandler = jest.fn()
      const strategy = new ScreenshotStrategy(
        { preventFullscreen: true },
        document.body,
        customHandler,
      )
      strategy.setMediator(mediator)

      // Force the "we're in fullscreen" branch via Object.defineProperty.
      Object.defineProperty(document, 'fullscreenElement', { value: document.body, configurable: true })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleFullscreenChange()
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })

      expect(publishedTypes(mediator)).toContain(ProtectionEventType.OVERLAY_SHOWN)
      expect(customHandler).toHaveBeenCalled()
      strategy.remove()
    })
  })

  describe('updateOptions', () => {
    it('toggling preventFullscreen ON does not throw and executes the add-listeners branch', () => {
      const strategy = new ScreenshotStrategy({ preventFullscreen: false }, document.body)
      strategy.apply()
      expect(() => strategy.updateOptions({ preventFullscreen: true })).not.toThrow()
      strategy.remove()
    })

    it('toggling preventFullscreen OFF triggers the remove-then-reapply branch', () => {
      const strategy = new ScreenshotStrategy({ preventFullscreen: true }, document.body)
      strategy.apply()
      expect(() => strategy.updateOptions({ preventFullscreen: false })).not.toThrow()
      strategy.remove()
    })

    it('updating categories updates the internal category list', () => {
      const strategy = new ScreenshotStrategy({}, document.body)
      strategy.updateOptions({ categories: ['screenshot'] })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((strategy as any).categories).toEqual(['screenshot'])
      strategy.remove()
    })
  })

  describe('setDebugMode', () => {
    it('does not throw — forwards into timeoutManager', () => {
      const strategy = new ScreenshotStrategy({}, document.body)
      expect(() => strategy.setDebugMode(true)).not.toThrow()
      expect(() => strategy.setDebugMode(false)).not.toThrow()
      strategy.remove()
    })
  })
})
