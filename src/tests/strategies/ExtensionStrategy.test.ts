import { describe, it, expect, jest } from '@jest/globals'
import { BrowserExtensionDetectionStrategy } from '../../strategies/ExtensionStrategy'
import { ProtectionEventType } from '../../core/mediator/protection-event'
import type { BrowserExtensionOptions } from '../../types'
import type { ProtectionMediator } from '../../core/mediator/types'
import type { ExtensionEvent } from '../../core/mediator/protection-event'

describe('BrowserExtensionDetectionStrategy', () => {
  it('detects extension via JS signature, calls custom handler and publishes event', async () => {
    const mediator: ProtectionMediator = {
      publish: jest.fn(),
      subscribe: jest.fn(() => ''),
      unsubscribe: jest.fn(() => true),
      getSubscriptions: jest.fn(() => []),
      setDebugMode: jest.fn(),
    }

    const customHandler = jest.fn()

    const options: BrowserExtensionOptions = {
      extensionsConfig: {
        ext1: {
          name: 'EvilExt',
          risk: 'high',
          detectionMethods: {
            jsSignatures: ['__MY_EXT__'],
            domSelectors: [],
          },
        },
      },
      showOverlay: true,
    }

    const strategy = new BrowserExtensionDetectionStrategy(options, document.body, customHandler, false)
    strategy.setMediator(mediator)

    // Simulate extension presence in global scope
    type ExtWindow = Window & { __MY_EXT__?: { version: string } }
    ;(window as ExtWindow).__MY_EXT__ = { version: '1.0' }

    await strategy.apply()

    // Custom handler should be called with extension id, name and risk
    expect(customHandler).toHaveBeenCalledWith('ext1', 'EvilExt', 'high')

    // Mediator should be published with EXTENSION_DETECTED
    expect(mediator.publish).toHaveBeenCalled()
    const published = (mediator.publish as jest.Mock).mock.calls[0][0] as ExtensionEvent
    expect(published.type).toBe(ProtectionEventType.EXTENSION_DETECTED)
    expect(published.data).toBeDefined()
    expect(published.data.extension!.name).toBe('EvilExt')

    // Clean up
    delete (window as ExtWindow).__MY_EXT__
    strategy.remove()
  })

  describe('DOM selector detection', () => {
    it('detects an extension via injected DOM selector and publishes EXTENSION_DETECTED', async () => {
      const mediator: ProtectionMediator = {
        publish: jest.fn(),
        subscribe: jest.fn(() => ''),
        unsubscribe: jest.fn(() => true),
        getSubscriptions: jest.fn(() => []),
        setDebugMode: jest.fn(),
      }
      const customHandler = jest.fn()

      // Plant a DOM marker the strategy's selector will find.
      const marker = document.createElement('div')
      marker.id = 'planted-by-ext'
      document.body.appendChild(marker)

      const strategy = new BrowserExtensionDetectionStrategy(
        {
          extensionsConfig: {
            'dom-ext': {
              name: 'DomExt',
              risk: 'medium',
              detectionMethods: { domSelectors: ['#planted-by-ext'], jsSignatures: [] },
            },
          },
        } as BrowserExtensionOptions,
        document.body,
        customHandler,
        false,
      )
      strategy.setMediator(mediator)

      await strategy.apply()

      expect(customHandler).toHaveBeenCalledWith('dom-ext', 'DomExt', 'medium')
      expect(mediator.publish).toHaveBeenCalled()

      marker.remove()
      strategy.remove()
    })

    it('does not double-publish when the same extension is detected twice', async () => {
      const mediator: ProtectionMediator = {
        publish: jest.fn(),
        subscribe: jest.fn(() => ''),
        unsubscribe: jest.fn(() => true),
        getSubscriptions: jest.fn(() => []),
        setDebugMode: jest.fn(),
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__DEDUPE_EXT__ = true

      const strategy = new BrowserExtensionDetectionStrategy(
        {
          extensionsConfig: {
            ext: {
              name: 'DedupeExt',
              risk: 'low',
              detectionMethods: { jsSignatures: ['__DEDUPE_EXT__'], domSelectors: [] },
            },
          },
        } as BrowserExtensionOptions,
        document.body,
        undefined,
        false,
      )
      strategy.setMediator(mediator)

      await strategy.apply()
      const firstCount = (mediator.publish as jest.Mock).mock.calls.length

      // Re-run detection — already-seen extension should not republish.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (strategy as any).runAllDetectionMethods()
      expect((mediator.publish as jest.Mock).mock.calls.length).toBe(firstCount)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__DEDUPE_EXT__
      strategy.remove()
    })

    it('handles invalid selectors gracefully (skips the offender, continues with rest)', async () => {
      const strategy = new BrowserExtensionDetectionStrategy(
        {
          extensionsConfig: {
            bad: {
              name: 'BadSelector',
              risk: 'low',
              detectionMethods: { domSelectors: ['>>> not valid <<<'], jsSignatures: [] },
            },
          },
        } as BrowserExtensionOptions,
        document.body,
        undefined,
        false,
      )

      await expect(strategy.apply()).resolves.not.toThrow()
      strategy.remove()
    })
  })

  describe('lifecycle', () => {
    it('apply is idempotent', async () => {
      const strategy = new BrowserExtensionDetectionStrategy(
        { extensionsConfig: {} } as BrowserExtensionOptions,
        document.body,
        undefined,
        false,
      )
      await strategy.apply()
      await expect(strategy.apply()).resolves.not.toThrow()
      strategy.remove()
    })

    it('remove without apply is safe', () => {
      const strategy = new BrowserExtensionDetectionStrategy(
        { extensionsConfig: {} } as BrowserExtensionOptions,
        document.body,
        undefined,
        false,
      )
      expect(() => strategy.remove()).not.toThrow()
    })

    it('remove publishes CONTENT_RESTORED + OVERLAY_REMOVED when extensions were detected', async () => {
      const mediator: ProtectionMediator = {
        publish: jest.fn(),
        subscribe: jest.fn(() => ''),
        unsubscribe: jest.fn(() => true),
        getSubscriptions: jest.fn(() => []),
        setDebugMode: jest.fn(),
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__REMOVE_EXT__ = true

      const strategy = new BrowserExtensionDetectionStrategy(
        {
          extensionsConfig: {
            r: {
              name: 'RemoveExt',
              risk: 'low',
              detectionMethods: { jsSignatures: ['__REMOVE_EXT__'], domSelectors: [] },
            },
          },
          hideContent: true,
          showOverlay: true,
        } as BrowserExtensionOptions,
        document.body,
        undefined,
        false,
      )
      strategy.setMediator(mediator)
      await strategy.apply()

      ;(mediator.publish as jest.Mock).mockClear()
      strategy.remove()

      const types = (mediator.publish as jest.Mock).mock.calls.map(
        (c) => (c[0] as { type: ProtectionEventType }).type,
      )
      expect(types).toEqual(expect.arrayContaining([
        ProtectionEventType.CONTENT_RESTORED,
        ProtectionEventType.OVERLAY_REMOVED,
      ]))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__REMOVE_EXT__
    })
  })

  describe('updateOptions + setDebugMode', () => {
    it('updateOptions does not throw on extensionsConfig replacement', async () => {
      const strategy = new BrowserExtensionDetectionStrategy(
        { extensionsConfig: {} } as BrowserExtensionOptions,
        document.body,
        undefined,
        false,
      )
      await strategy.apply()
      expect(() => strategy.updateOptions({
        extensionsConfig: {
          new: {
            name: 'New',
            risk: 'low' as const,
            detectionMethods: { jsSignatures: [], domSelectors: [] },
          },
        },
      })).not.toThrow()
      strategy.remove()
    })

    it('updateOptions handles null options safely', () => {
      const strategy = new BrowserExtensionDetectionStrategy(
        { extensionsConfig: {} } as BrowserExtensionOptions,
        document.body,
        undefined,
        false,
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => strategy.updateOptions(null as any)).not.toThrow()
      strategy.remove()
    })

    it('setDebugMode does not throw', () => {
      const strategy = new BrowserExtensionDetectionStrategy(
        { extensionsConfig: {} } as BrowserExtensionOptions,
        document.body,
        undefined,
        false,
      )
      expect(() => strategy.setDebugMode(true)).not.toThrow()
      expect(() => strategy.setDebugMode(false)).not.toThrow()
      strategy.remove()
    })
  })

  describe('checkPropertyExists (dot-path traversal)', () => {
    it('returns true for an existing nested property and false otherwise', () => {
      const strategy = new BrowserExtensionDetectionStrategy(
        { extensionsConfig: {} } as BrowserExtensionOptions,
        document.body,
        undefined,
        false,
      )

      const obj = { a: { b: { c: 1 } } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((strategy as any).checkPropertyExists(obj, 'a.b.c')).toBe(true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((strategy as any).checkPropertyExists(obj, 'a.b.x')).toBe(false)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((strategy as any).checkPropertyExists(null, 'a')).toBe(false)
      strategy.remove()
    })
  })
})