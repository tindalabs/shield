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
})