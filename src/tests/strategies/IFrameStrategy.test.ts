import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { FrameEmbeddingProtectionStrategy } from '../../strategies/IFrameStrategy'
import { ProtectionEventType } from '../../core/mediator/protection-event'
import type { FrameEmbeddingOptions } from '../../types'
import type { ProtectionMediator } from '../../core/mediator/types'
import type { FrameEmbeddingEvent } from '../../core/mediator/protection-event'

// The intervalManager is a module-level singleton. Without mocking it, its
// 500ms base interval fires between tests and causes cross-test contamination.
jest.mock('../../utils/intervalManager', () => ({
  intervalManager: {
    registerTask: jest.fn().mockReturnValue('iframe-task-id'),
    unregisterTask: jest.fn(),
    dispose: jest.fn(),
    setDebugMode: jest.fn(),
  },
}))

describe('FrameEmbeddingProtectionStrategy', () => {
  beforeEach(() => {
    // Reset window to a same-origin, non-framed state before each test.
    // Use getter form — value-based defineProperty for window.parent does not
    // reliably restore after jsdom converts it to a plain value descriptor.
    jest.useFakeTimers()
    Object.defineProperty(window, 'top', { get: () => window, configurable: true })
    Object.defineProperty(window, 'parent', { get: () => window, configurable: true })
    Object.defineProperty(window, 'self', { get: () => window, configurable: true })
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('publishes event when embedded in external iframe', () => {
    const mediator: ProtectionMediator = {
      publish: jest.fn(),
      subscribe: jest.fn(() => 'sub-1'),
      unsubscribe: jest.fn(() => true),
      getSubscriptions: jest.fn(() => []),
      setDebugMode: jest.fn(),
    }

    type FakeWindowLike = { location: { hostname: string } }
    const fakeParent: FakeWindowLike = { location: { hostname: 'evil.com' } }
    const fakeTop: FakeWindowLike = { location: { hostname: 'evil.com' } }

    Object.defineProperty(window, 'top', { value: fakeTop as unknown as Window, configurable: true })
    Object.defineProperty(window, 'parent', { value: fakeParent as unknown as Window, configurable: true })
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

    expect(mediator.publish).not.toHaveBeenCalled()

    strategy.remove()
  })
})
