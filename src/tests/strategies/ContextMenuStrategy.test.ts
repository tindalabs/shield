import { describe, it, expect, jest, afterEach } from '@jest/globals'
import { ContextMenuStrategy } from '../../strategies/ContextMenuStrategy'
import { eventManager } from '../../utils/eventManager'

afterEach(() => {
  // Several tests below leave events registered on document.body; the singleton
  // eventManager would otherwise leak them into the next test file.
  eventManager.clearAllEvents()
})

describe('ContextMenuStrategy', () => {
  it('prevents default and calls custom handler on contextmenu', () => {
    const customHandler = jest.fn()

    const strategy = new ContextMenuStrategy({}, document.body, customHandler, false)
    strategy.apply()

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)

    expect(customHandler).toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)

    strategy.remove()
  })

  it('protects iframe content from context menu when same-origin', () => {
    const customHandler = jest.fn()

    // Create an iframe and ensure same-origin availability
    const iframe = document.createElement('iframe')
    // No src means same-origin in jsdom
    document.body.appendChild(iframe)

    const strategy = new ContextMenuStrategy({}, document.body, customHandler, false)
    strategy.apply()

    const iframeDoc = iframe.contentDocument as Document
    expect(iframeDoc).toBeDefined()

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    // Dispatch on the iframe document body
    iframeDoc.body.dispatchEvent(event)

    expect(customHandler).toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)

    strategy.remove()

    // clean up
    if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe)
  })

  describe('apply / remove lifecycle', () => {
    it('apply is idempotent — second call is a no-op', () => {
      const strategy = new ContextMenuStrategy({}, document.body, undefined, false)
      strategy.apply()
      expect(() => strategy.apply()).not.toThrow()
      strategy.remove()
    })

    it('remove without apply is safe', () => {
      const strategy = new ContextMenuStrategy({}, document.body, undefined, false)
      expect(() => strategy.remove()).not.toThrow()
    })
  })

  describe('touch handlers', () => {
    // The strategy only wires touch listeners on mobile (per isMobile()), but
    // the internal handler functions are reachable regardless and exercise the
    // multi-touch / long-press code paths.
    it('handleTouchStart preventDefault + customHandler on multi-touch', () => {
      const customHandler = jest.fn()
      const strategy = new ContextMenuStrategy({}, document.body, customHandler, false)

      const touchEvent = {
        touches: [{}, {}],
        preventDefault: jest.fn(),
      } as unknown as TouchEvent

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleTouchStart(touchEvent)

      expect(customHandler).toHaveBeenCalled()
      expect((touchEvent.preventDefault as jest.Mock)).toHaveBeenCalled()
      strategy.remove()
    })

    it('handleTouchStart ignores single-touch events', () => {
      const customHandler = jest.fn()
      const strategy = new ContextMenuStrategy({}, document.body, customHandler, false)

      const touchEvent = {
        touches: [{}],
        preventDefault: jest.fn(),
      } as unknown as TouchEvent

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleTouchStart(touchEvent)

      expect(customHandler).not.toHaveBeenCalled()
      strategy.remove()
    })

    it('handleTouchEnd preventDefault + customHandler on long press (>500ms)', () => {
      const customHandler = jest.fn()
      const strategy = new ContextMenuStrategy({}, document.body, customHandler, false)

      // timeStamp far enough in the past that now-timeStamp > 500ms.
      const touchEvent = {
        timeStamp: Date.now() - 10_000,
        preventDefault: jest.fn(),
      } as unknown as TouchEvent

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleTouchEnd(touchEvent)

      expect(customHandler).toHaveBeenCalled()
      expect((touchEvent.preventDefault as jest.Mock)).toHaveBeenCalled()
      strategy.remove()
    })

    it('handleTouchEnd ignores short taps (<500ms)', () => {
      const customHandler = jest.fn()
      const strategy = new ContextMenuStrategy({}, document.body, customHandler, false)

      const touchEvent = {
        timeStamp: Date.now(), // ~0ms ago
        preventDefault: jest.fn(),
      } as unknown as TouchEvent

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(strategy as any).handleTouchEnd(touchEvent)

      expect(customHandler).not.toHaveBeenCalled()
      strategy.remove()
    })
  })

  describe('observeForIframes', () => {
    it('sets up a DomObserver when enabled, tears down on remove', () => {
      const strategy = new ContextMenuStrategy(
        { observeForIframes: true },
        document.body,
        undefined,
        false,
      )
      strategy.apply()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((strategy as any).domObserver).not.toBeNull()

      strategy.remove()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((strategy as any).domObserver).toBeNull()
    })
  })

  describe('updateOptions + setDebugMode', () => {
    it('updateOptions does not throw on a no-op call', () => {
      const strategy = new ContextMenuStrategy({}, document.body, undefined, false)
      expect(() => strategy.updateOptions({})).not.toThrow()
      strategy.remove()
    })

    it('setDebugMode does not throw', () => {
      const strategy = new ContextMenuStrategy({}, document.body, undefined, false)
      expect(() => strategy.setDebugMode(true)).not.toThrow()
      expect(() => strategy.setDebugMode(false)).not.toThrow()
      strategy.remove()
    })
  })
})