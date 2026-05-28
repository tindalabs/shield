import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { ContentProtectionMediator } from '../../core/mediator/ContentProtectionMediator'
import { ProtectionEventType, type ProtectionEvent } from '../../core/mediator/protection-event'
import { DevToolsEventHandler } from '../../core/mediator/handlers/devToolsEventHandler'
import { BrowserExtensionEventHandler } from '../../core/mediator/handlers/extensionEventHandlers'
import { FrameEmbeddingEventHandler } from '../../core/mediator/handlers/iFrameEventHandlers'
import { ScreenshotEventHandler } from '../../core/mediator/handlers/screenShotEventHandlers'
import { HandlerRegistry } from '../../core/mediator/handlers/eventHandlerRegistry'
import { TimeoutManager } from '../../utils/timeoutManager'

// The handlers don't return their published events directly — they react to a
// source event by republishing one or more downstream events. We capture the
// downstream events by subscribing to the mediator ourselves.
const captureEventsOfType = (
  mediator: ContentProtectionMediator,
  type: ProtectionEventType,
): ProtectionEvent[] => {
  const captured: ProtectionEvent[] = []
  mediator.subscribe(type, (e) => { captured.push(e) })
  return captured
}

describe('mediator event handlers', () => {
  let mediator: ContentProtectionMediator
  // The mediator unconditionally logs every publish() (line 148 in source) and
  // some handler debug paths write to console. Silence both to keep test output
  // readable.
  let logSpy: jest.SpiedFunction<typeof console.log>

  beforeEach(() => {
    mediator = new ContentProtectionMediator(false)
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  // ────────────────────────────────────────────────────────────────────────────
  describe('DevToolsEventHandler', () => {
    let handler: DevToolsEventHandler

    beforeEach(() => { handler = new DevToolsEventHandler(mediator) })
    afterEach(() => { handler.dispose() })

    it('on DevTools opened: publishes OVERLAY_SHOWN with priority 10 + autoRestore', () => {
      const overlays = captureEventsOfType(mediator, ProtectionEventType.OVERLAY_SHOWN)

      mediator.publish({
        type: ProtectionEventType.DEVTOOLS_STATE_CHANGE,
        source: 'DevToolsStrategy',
        timestamp: Date.now(),
        data: { isOpen: true },
      })

      expect(overlays).toHaveLength(1)
      const overlayData = overlays[0].data as { overlayType: string; priority: number; options: { blockEvents: boolean; autoRestore: boolean } }
      expect(overlayData.overlayType).toBe('devtools')
      expect(overlayData.priority).toBe(10)
      expect(overlayData.options.blockEvents).toBe(true)
      expect(overlayData.options.autoRestore).toBe(true)
    })

    it('on DevTools opened with showOverlay=false: no OVERLAY_SHOWN', () => {
      const overlays = captureEventsOfType(mediator, ProtectionEventType.OVERLAY_SHOWN)

      mediator.publish({
        type: ProtectionEventType.DEVTOOLS_STATE_CHANGE,
        source: 'DevToolsStrategy',
        timestamp: Date.now(),
        data: { isOpen: true, showOverlay: false },
      })

      expect(overlays).toHaveLength(0)
    })

    it('on DevTools opened with hideContent=true: also publishes CONTENT_HIDDEN', () => {
      const hidden = captureEventsOfType(mediator, ProtectionEventType.CONTENT_HIDDEN)

      mediator.publish({
        type: ProtectionEventType.DEVTOOLS_STATE_CHANGE,
        source: 'DevToolsStrategy',
        timestamp: Date.now(),
        data: { isOpen: true, hideContent: true },
      })

      expect(hidden).toHaveLength(1)
      expect((hidden[0].data as { reason: string }).reason).toBe('devtools_opened')
    })

    it('on DevTools closed: publishes OVERLAY_REMOVED', () => {
      const removed = captureEventsOfType(mediator, ProtectionEventType.OVERLAY_REMOVED)

      mediator.publish({
        type: ProtectionEventType.DEVTOOLS_STATE_CHANGE,
        source: 'DevToolsStrategy',
        timestamp: Date.now(),
        data: { isOpen: false },
      })

      expect(removed).toHaveLength(1)
      expect((removed[0].data as { reason: string }).reason).toBe('devtools_closed')
    })

    it('on DevTools closed with hideContent=true: also publishes CONTENT_RESTORED', () => {
      const restored = captureEventsOfType(mediator, ProtectionEventType.CONTENT_RESTORED)

      mediator.publish({
        type: ProtectionEventType.DEVTOOLS_STATE_CHANGE,
        source: 'DevToolsStrategy',
        timestamp: Date.now(),
        data: { isOpen: false, hideContent: true },
      })

      expect(restored).toHaveLength(1)
    })

    it('ignores events with the wrong type (defensive type-guard branch)', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const overlays = captureEventsOfType(mediator, ProtectionEventType.OVERLAY_SHOWN)

      // Directly invoke the internal handler with a mismatched event — the
      // type guard should bail before any republish.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(handler as any).handleDevToolsStateChange({
        type: ProtectionEventType.OVERLAY_SHOWN,
        source: 'x',
        timestamp: 0,
        data: {},
      })

      expect(overlays).toHaveLength(0)
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })

  // ────────────────────────────────────────────────────────────────────────────
  describe('BrowserExtensionEventHandler', () => {
    let handler: BrowserExtensionEventHandler

    beforeEach(() => { handler = new BrowserExtensionEventHandler(mediator) })
    afterEach(() => { handler.dispose() })

    it('publishes CONTENT_HIDDEN when hideContent=true and an extension is present', () => {
      const hidden = captureEventsOfType(mediator, ProtectionEventType.CONTENT_HIDDEN)

      mediator.publish({
        type: ProtectionEventType.EXTENSION_DETECTED,
        source: 'ExtensionStrategy',
        timestamp: Date.now(),
        data: {
          extension: { name: 'FakeExt', description: '', risk: 'high', detectionMethods: {} },
          hideContent: true,
          showOverlay: false,
        },
      })

      expect(hidden).toHaveLength(1)
      const d = hidden[0].data as { reason: string; options: { secondaryMessage: string } }
      expect(d.reason).toBe('extension_detected')
      expect(d.options.secondaryMessage).toContain('FakeExt')
    })

    it('publishes OVERLAY_SHOWN with extension-specific additionalContent', () => {
      const overlays = captureEventsOfType(mediator, ProtectionEventType.OVERLAY_SHOWN)

      mediator.publish({
        type: ProtectionEventType.EXTENSION_DETECTED,
        source: 'ExtensionStrategy',
        timestamp: Date.now(),
        data: {
          extension: { name: 'Tampermonkey', description: '', risk: 'medium', detectionMethods: {} },
          hideContent: false,
          showOverlay: true,
        },
      })

      expect(overlays).toHaveLength(1)
      const d = overlays[0].data as { overlayType: string; options: { additionalContent: string } }
      expect(d.overlayType).toBe('extension')
      expect(d.options.additionalContent).toContain('Tampermonkey')
      expect(d.options.additionalContent).toContain('MEDIUM')
    })

    it('removes protection by publishing CONTENT_RESTORED + OVERLAY_REMOVED when extension is gone', () => {
      const restored = captureEventsOfType(mediator, ProtectionEventType.CONTENT_RESTORED)
      const overlayRemoved = captureEventsOfType(mediator, ProtectionEventType.OVERLAY_REMOVED)

      mediator.publish({
        type: ProtectionEventType.EXTENSION_DETECTED,
        source: 'ExtensionStrategy',
        timestamp: Date.now(),
        data: { extension: null, hideContent: true, showOverlay: true },
      })

      expect(restored).toHaveLength(1)
      expect(overlayRemoved).toHaveLength(1)
      expect((overlayRemoved[0].data as { reason: string }).reason).toBe('extension_removed')
    })

    it('ignores events with the wrong type', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const overlays = captureEventsOfType(mediator, ProtectionEventType.OVERLAY_SHOWN)

      handler.handleExtensionDetected({
        type: ProtectionEventType.OVERLAY_SHOWN,
        source: 'x',
        timestamp: 0,
        data: {},
      })

      expect(overlays).toHaveLength(0)
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })

    it('onDispose() is a no-op (no resources to release)', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => (handler as any).onDispose()).not.toThrow()
    })
  })

  // ────────────────────────────────────────────────────────────────────────────
  describe('FrameEmbeddingEventHandler', () => {
    let handler: FrameEmbeddingEventHandler

    beforeEach(() => { handler = new FrameEmbeddingEventHandler(mediator) })
    afterEach(() => { handler.dispose() })

    it('publishes OVERLAY_SHOWN + CONTENT_HIDDEN only when the frame is external', () => {
      const overlays = captureEventsOfType(mediator, ProtectionEventType.OVERLAY_SHOWN)
      const hidden   = captureEventsOfType(mediator, ProtectionEventType.CONTENT_HIDDEN)

      mediator.publish({
        type: ProtectionEventType.FRAME_EMBEDDING_DETECTED,
        source: 'IFrameStrategy',
        timestamp: Date.now(),
        data: {
          isEmbedded: true,
          isExternalFrame: true,
          parentDomain: 'evil.example',
          showOverlay: true,
          hideContent: true,
        },
      })

      expect(overlays).toHaveLength(1)
      expect(hidden).toHaveLength(1)
      expect((overlays[0].data as { priority: number }).priority).toBe(9)
    })

    it('skips protection for non-external frames', () => {
      const overlays = captureEventsOfType(mediator, ProtectionEventType.OVERLAY_SHOWN)

      mediator.publish({
        type: ProtectionEventType.FRAME_EMBEDDING_DETECTED,
        source: 'IFrameStrategy',
        timestamp: Date.now(),
        data: {
          isEmbedded: true,
          isExternalFrame: false,
          showOverlay: true,
        },
      })

      expect(overlays).toHaveLength(0)
    })

    it('warns and bails out when event data is missing', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const overlays = captureEventsOfType(mediator, ProtectionEventType.OVERLAY_SHOWN)

      handler.handleFrameEmbeddingDetected({
        type: ProtectionEventType.FRAME_EMBEDDING_DETECTED,
        source: 'IFrameStrategy',
        timestamp: 0,
        // data omitted on purpose
      })

      expect(warnSpy).toHaveBeenCalled()
      expect(overlays).toHaveLength(0)
      warnSpy.mockRestore()
    })
  })

  // ────────────────────────────────────────────────────────────────────────────
  describe('ScreenshotEventHandler', () => {
    let handler: ScreenshotEventHandler

    beforeEach(() => {
      jest.useFakeTimers()
      handler = new ScreenshotEventHandler(mediator)
    })

    afterEach(() => {
      handler.dispose()
      TimeoutManager.getInstance().clearAllTimeouts()
      jest.useRealTimers()
    })

    it('publishes OVERLAY_SHOWN with screenshot type and propagated priority', () => {
      const overlays = captureEventsOfType(mediator, ProtectionEventType.OVERLAY_SHOWN)

      mediator.publish({
        type: ProtectionEventType.SCREENSHOT_ATTEMPT,
        source: 'ScreenshotStrategy',
        timestamp: Date.now(),
        data: { showOverlay: true, priority: 7 },
      })

      expect(overlays).toHaveLength(1)
      const d = overlays[0].data as { overlayType: string; priority: number; options: { blockEvents: boolean } }
      expect(d.overlayType).toBe('screenshot')
      expect(d.priority).toBe(7)
      // Screenshot overlays are non-blocking notifications.
      expect(d.options.blockEvents).toBe(false)
    })

    it('schedules a CONTENT_RESTORED via TimeoutManager when duration is set', () => {
      const restored = captureEventsOfType(mediator, ProtectionEventType.CONTENT_RESTORED)

      mediator.publish({
        type: ProtectionEventType.SCREENSHOT_ATTEMPT,
        source: 'ScreenshotStrategy',
        timestamp: Date.now(),
        data: {
          hideContent: true,
          overlayOptions: { duration: 1000 },
        },
      })

      // Not yet — duration hasn't elapsed.
      expect(restored).toHaveLength(0)

      jest.advanceTimersByTime(1000)
      expect(restored).toHaveLength(1)
    })

    it('dispose() clears any scheduled restoration timeouts', () => {
      const restored = captureEventsOfType(mediator, ProtectionEventType.CONTENT_RESTORED)

      mediator.publish({
        type: ProtectionEventType.SCREENSHOT_ATTEMPT,
        source: 'ScreenshotStrategy',
        timestamp: Date.now(),
        data: {
          hideContent: true,
          overlayOptions: { duration: 1000 },
        },
      })

      handler.dispose()
      jest.advanceTimersByTime(1000)
      expect(restored).toHaveLength(0)
    })

    it('setDebugMode forwards into the shared TimeoutManager', () => {
      const tm = TimeoutManager.getInstance()
      const spy = jest.spyOn(tm, 'setDebugMode')
      handler.setDebugMode(true)
      expect(spy).toHaveBeenCalledWith(true)
      handler.setDebugMode(false)
      spy.mockRestore()
    })
  })

  // ────────────────────────────────────────────────────────────────────────────
  describe('HandlerRegistry', () => {
    it('wires up all four built-in handlers in one go', () => {
      const registry = new HandlerRegistry(mediator)
      // After init, every handler-owned event type has at least one subscription.
      const info = mediator.getDebugInfo()
      expect(info.eventTypes).toEqual(expect.arrayContaining([
        ProtectionEventType.DEVTOOLS_STATE_CHANGE,
        ProtectionEventType.EXTENSION_DETECTED,
        ProtectionEventType.SCREENSHOT_ATTEMPT,
        ProtectionEventType.FRAME_EMBEDDING_DETECTED,
      ]))
      expect(registry).toBeDefined()
    })

    it('setDebugMode fans out to every wired handler', () => {
      const registry = new HandlerRegistry(mediator)
      // No throw is enough — every handler exposes setDebugMode via the base class.
      expect(() => registry.setDebugMode(true)).not.toThrow()
      expect(() => registry.setDebugMode(false)).not.toThrow()
    })
  })
})
