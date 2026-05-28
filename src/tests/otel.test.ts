import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import type { ContentProtectionOptions, CustomEventHandlers } from '../types/index'

// Like policy.test.ts: ESM mocking requires unstable_mockModule + dynamic import.
// We stub ContentProtector so attachShieldToSpan returns a controllable instance
// and we can capture the options it was constructed with — including the wired
// customHandlers.
let capturedOptions: ContentProtectionOptions | null = null

jest.unstable_mockModule('../core/index.js', () => ({
  ContentProtector: jest.fn((opts: ContentProtectionOptions) => {
    capturedOptions = opts
    return { __isStub: true }
  }),
}))

const { attachShieldToSpan } = await import('../otel')
const { ContentProtector } = await import('../core/index.js')
const MockContentProtector = ContentProtector as jest.MockedClass<typeof ContentProtector>

beforeEach(() => {
  capturedOptions = null
  MockContentProtector.mockClear()
})

const getHandlers = (): Required<CustomEventHandlers> => {
  expect(capturedOptions).not.toBeNull()
  return capturedOptions!.customHandlers as Required<CustomEventHandlers>
}

describe('attachShieldToSpan', () => {
  it('constructs a ContentProtector with wired handlers and forwards baseline options', () => {
    const emitter = jest.fn()
    attachShieldToSpan({ preventDevTools: true }, emitter)

    expect(MockContentProtector).toHaveBeenCalledTimes(1)
    expect(capturedOptions?.preventDevTools).toBe(true)
    expect(capturedOptions?.customHandlers).toBeDefined()
  })

  describe('emitter mapping', () => {
    it('onDevToolsOpen → opened/closed event names', () => {
      const emitter = jest.fn()
      attachShieldToSpan({}, emitter)
      const h = getHandlers()

      h.onDevToolsOpen(true)
      h.onDevToolsOpen(false)

      expect(emitter).toHaveBeenNthCalledWith(1, 'shield.devtools.opened', undefined)
      expect(emitter).toHaveBeenNthCalledWith(2, 'shield.devtools.closed', undefined)
    })

    it.each<[string, string]>([
      ['onSelectionAttempt',   'shield.selection.attempted'],
      ['onContextMenuAttempt', 'shield.context_menu.attempted'],
      ['onPrintAttempt',       'shield.print.attempted'],
      ['onScreenshotAttempt',  'shield.screenshot.attempted'],
    ])('%s → %s', (method, eventName) => {
      const emitter = jest.fn()
      attachShieldToSpan({}, emitter)
      const h = getHandlers() as unknown as Record<string, (e: Event) => void>

      h[method](new Event('test'))
      expect(emitter).toHaveBeenCalledWith(eventName, undefined)
    })

    it('onKeyboardShortcutBlocked → emits key + code attributes', () => {
      const emitter = jest.fn()
      attachShieldToSpan({}, emitter)
      const h = getHandlers()

      const kb = new KeyboardEvent('keydown', { key: 'p', code: 'KeyP' })
      h.onKeyboardShortcutBlocked(kb)

      expect(emitter).toHaveBeenCalledWith('shield.keyboard_shortcut.blocked', {
        'shield.keyboard.key': 'p',
        'shield.keyboard.code': 'KeyP',
      })
    })

    it('onClipboardAttempt → event name carries the action', () => {
      const emitter = jest.fn()
      attachShieldToSpan({}, emitter)
      const h = getHandlers()

      // jsdom doesn't define ClipboardEvent; the SUT only reads the action arg.
      h.onClipboardAttempt(new Event('copy') as ClipboardEvent, 'copy')
      h.onClipboardAttempt(new Event('cut') as ClipboardEvent, 'cut')
      h.onClipboardAttempt(new Event('paste') as ClipboardEvent, 'paste')

      expect(emitter).toHaveBeenNthCalledWith(1, 'shield.clipboard.copy', undefined)
      expect(emitter).toHaveBeenNthCalledWith(2, 'shield.clipboard.cut', undefined)
      expect(emitter).toHaveBeenNthCalledWith(3, 'shield.clipboard.paste', undefined)
    })

    it('onExtensionDetected → carries id/name/risk', () => {
      const emitter = jest.fn()
      attachShieldToSpan({}, emitter)
      const h = getHandlers()

      h.onExtensionDetected('ext-1', 'React DevTools', 'low')
      expect(emitter).toHaveBeenCalledWith('shield.extension.detected', {
        'shield.extension.id': 'ext-1',
        'shield.extension.name': 'React DevTools',
        'shield.extension.risk': 'low',
      })
    })

    it('onFrameEmbeddingDetected → only emits when embedded=true', () => {
      const emitter = jest.fn()
      attachShieldToSpan({}, emitter)
      const h = getHandlers()

      h.onFrameEmbeddingDetected(false, false)
      expect(emitter).not.toHaveBeenCalled()

      h.onFrameEmbeddingDetected(true, true)
      expect(emitter).toHaveBeenCalledWith('shield.frame.embedding.detected', {
        'shield.frame.external': true,
      })
    })

    it('onProtectionBypassed → carries the bypass method', () => {
      const emitter = jest.fn()
      attachShieldToSpan({}, emitter)
      const h = getHandlers()

      h.onProtectionBypassed('devtools', new Event('test'))
      expect(emitter).toHaveBeenCalledWith('shield.protection.bypassed', {
        'shield.bypass.method': 'devtools',
      })
    })

    it('onContentHidden / onContentRestored', () => {
      const emitter = jest.fn()
      attachShieldToSpan({}, emitter)
      const h = getHandlers()
      const target = document.createElement('div')

      h.onContentHidden('manual', target)
      h.onContentRestored(target)

      expect(emitter).toHaveBeenNthCalledWith(1, 'shield.content.hidden', { 'shield.hidden.reason': 'manual' })
      expect(emitter).toHaveBeenNthCalledWith(2, 'shield.content.restored', undefined)
    })
  })

  describe('user-supplied handlers are preserved', () => {
    it('forwards every handler call to the original after emitting', () => {
      const emitter = jest.fn()
      const userOnSelection = jest.fn()
      const userOnDevTools = jest.fn()

      attachShieldToSpan({
        customHandlers: {
          onSelectionAttempt: userOnSelection,
          onDevToolsOpen: userOnDevTools,
        },
      }, emitter)
      const h = getHandlers()

      const evt = new Event('selectstart')
      h.onSelectionAttempt(evt)
      h.onDevToolsOpen(true)

      expect(userOnSelection).toHaveBeenCalledWith(evt)
      expect(userOnDevTools).toHaveBeenCalledWith(true)
    })
  })

  describe('emitter errors must not crash the app', () => {
    it('swallows synchronous throws from the emitter', () => {
      const emitter = jest.fn(() => { throw new Error('telemetry sink down') })
      attachShieldToSpan({}, emitter)
      const h = getHandlers()

      expect(() => h.onSelectionAttempt(new Event('selectstart'))).not.toThrow()
    })

    it('still calls the user handler even when the emitter throws', () => {
      const emitter = jest.fn(() => { throw new Error('boom') })
      const userOnSelection = jest.fn()

      attachShieldToSpan(
        { customHandlers: { onSelectionAttempt: userOnSelection } },
        emitter,
      )
      const h = getHandlers()

      const evt = new Event('selectstart')
      expect(() => h.onSelectionAttempt(evt)).not.toThrow()
      expect(userOnSelection).toHaveBeenCalledWith(evt)
    })
  })
})
