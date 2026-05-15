import { describe, it, expect, jest } from '@jest/globals'
import { FrameEmbeddingProtectionStrategy } from '../../strategies/IFrameStrategy'
import { ProtectionEventType } from '../../core/mediator/protection-event'
import type { FrameEmbeddingOptions } from '../../types'
import type { ProtectionMediator } from '../../core/mediator/types'
import type { FrameEmbeddingEvent } from '../../core/mediator/protection-event'

describe('FrameEmbeddingProtectionStrategy', () => {
  it('publishes event when embedded in external iframe', () => {
    const mediator: ProtectionMediator = {
      publish: jest.fn(),
      subscribe: jest.fn(() => 'sub-1'),
      unsubscribe: jest.fn(() => true),
      getSubscriptions: jest.fn(() => []),
      setDebugMode: jest.fn(),
    }

    // Simulate being inside an external iframe
    type FakeWindowLike = { location: { hostname: string } }
    const fakeParent: FakeWindowLike = { location: { hostname: 'evil.com' } }
    const fakeTop: FakeWindowLike = { location: { hostname: 'evil.com' } }

    // Override window.top and window.parent
    Object.defineProperty(window, 'top', { value: fakeTop as unknown as Window, configurable: true })
    Object.defineProperty(window, 'parent', { value: fakeParent as unknown as Window, configurable: true })

    // Ensure current location is different
    Object.defineProperty(window, 'location', { value: { hostname: 'example.com' }, configurable: true })

    const strategy = new FrameEmbeddingProtectionStrategy({ showOverlay: true, allowedDomains: [] } as FrameEmbeddingOptions, document.body, undefined, false)
    strategy.setMediator(mediator)

    strategy.apply()

    expect(mediator.publish).toHaveBeenCalled()
    const published = (mediator.publish as jest.Mock).mock.calls[0][0] as FrameEmbeddingEvent
    expect(published.type).toBe(ProtectionEventType.FRAME_EMBEDDING_DETECTED)
    expect(published.data.isExternalFrame).toBe(true)
    expect(published.data.parentDomain).toBe('evil.com')

    strategy.remove()

    // Restore defaults - jsdom may allow reassignment, but be safe
    Object.defineProperty(window, 'top', { value: window, configurable: true })
    Object.defineProperty(window, 'parent', { value: window, configurable: true })
    Object.defineProperty(window, 'location', { value: window.location, configurable: true })
  })

  it('does not publish when parent domain is allowed', () => {
    const mediator: ProtectionMediator = {
      publish: jest.fn(),
      subscribe: jest.fn(() => 'sub-2'),
      unsubscribe: jest.fn(() => true),
      getSubscriptions: jest.fn(() => []),
      setDebugMode: jest.fn(),
    }

    type FakeWindowLike = { location: { hostname: string } }
    const fakeParent: FakeWindowLike = { location: { hostname: 'allowed.com' } }
    Object.defineProperty(window, 'top', { value: fakeParent as unknown as Window, configurable: true })
    Object.defineProperty(window, 'parent', { value: fakeParent as unknown as Window, configurable: true })
    Object.defineProperty(window, 'location', { value: { hostname: 'example.com' }, configurable: true })

    const strategy = new FrameEmbeddingProtectionStrategy({ allowedDomains: ['allowed.com'] } as FrameEmbeddingOptions, document.body, undefined, false)
    strategy.setMediator(mediator)

    strategy.apply()

    // Should not have published since parent is allowed
    expect(mediator.publish).not.toHaveBeenCalled()

    strategy.remove()

    Object.defineProperty(window, 'top', { value: window, configurable: true })
    Object.defineProperty(window, 'parent', { value: window, configurable: true })
    Object.defineProperty(window, 'location', { value: window.location, configurable: true })
  })
})