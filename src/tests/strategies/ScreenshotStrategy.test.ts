import { describe, it, expect, jest } from '@jest/globals'
import { ScreenshotStrategy } from '../../strategies/ScreenshotStrategy'
import { ProtectionEventType } from '../../core/mediator/protection-event'
import type { ProtectionMediator } from '../../core/mediator/types'

describe('ScreenshotStrategy', () => {
  it('publishes overlay shown with custom title when showing screenshot notification', () => {
    const mediator: ProtectionMediator = {
      publish: jest.fn(),
      subscribe: jest.fn(() => ''),
      unsubscribe: jest.fn(() => true),
      getSubscriptions: jest.fn(() => []),
      setDebugMode: jest.fn(),
    }
    const customHandler = jest.fn()

    const strategy = new ScreenshotStrategy({ overlayOptions: { title: 'No screenshots' }, showOverlay: true }, document.body, customHandler, false)

    strategy.setMediator(mediator)

    // Call the private notification method via typed access
    ;(strategy as unknown as { showScreenshotNotification: () => void }).showScreenshotNotification()

    expect(mediator.publish).toHaveBeenCalled()
    const published = (mediator.publish as jest.Mock).mock.calls[0][0] as { type: ProtectionEventType; data?: { options?: { title?: string } } }
    expect(published.type).toBe(ProtectionEventType.OVERLAY_SHOWN)
    expect(published.data).toBeDefined()
    expect(published.data!.options).toBeDefined()
    expect(published.data!.options!.title).toBe('No screenshots')

    // Clean up any listeners if strategy registered them
    strategy.remove()
  })
})