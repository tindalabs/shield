import { describe, it, expect, jest, beforeEach, beforeAll, afterEach } from '@jest/globals'
import { ProtectionEventType } from '../../core/mediator/protection-event'
import type { FrameEmbeddingOptions } from '../../types'
import type { ProtectionMediator } from '../../core/mediator/types'
import type { FrameEmbeddingEvent } from '../../core/mediator/protection-event'
import type { FrameEmbeddingProtectionStrategy as FrameEmbeddingProtectionStrategyType } from '../../strategies/IFrameStrategy'

// ESM mode: jest.mock() does NOT hoist — must use jest.unstable_mockModule
// and dynamic imports. windowFrame is mocked because jsdom 30 makes
// `window.top` non-configurable, so we route frame detection through the
// helper module and stub it here rather than fighting jsdom's lockdown.
jest.unstable_mockModule('../../utils/intervalManager', () => ({
  intervalManager: {
    registerTask: jest.fn().mockReturnValue('iframe-task-id'),
    unregisterTask: jest.fn(),
    dispose: jest.fn(),
    setDebugMode: jest.fn(),
  },
}))

jest.unstable_mockModule('../../utils/windowFrame', () => ({
  isEmbedded: jest.fn(() => false),
  readParentOrigin: jest.fn(() => ({ parentHostname: 'example.com', crossOrigin: false })),
}))

let FrameEmbeddingProtectionStrategy: typeof FrameEmbeddingProtectionStrategyType
let isEmbeddedMock: jest.Mock<() => boolean>
let readParentOriginMock: jest.Mock<() => { parentHostname: string | null; crossOrigin: boolean }>

beforeAll(async () => {
  const strategyMod = await import('../../strategies/IFrameStrategy')
  FrameEmbeddingProtectionStrategy = strategyMod.FrameEmbeddingProtectionStrategy
  const wfMod = await import('../../utils/windowFrame')
  isEmbeddedMock = wfMod.isEmbedded as unknown as jest.Mock<() => boolean>
  readParentOriginMock = wfMod.readParentOrigin as unknown as jest.Mock<() => { parentHostname: string | null; crossOrigin: boolean }>
})

describe('FrameEmbeddingProtectionStrategy', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    isEmbeddedMock.mockReturnValue(false)
    readParentOriginMock.mockReturnValue({ parentHostname: 'localhost', crossOrigin: false })
    // jsdom 30 makes `window.location` non-configurable AND attempts to navigate
    // on hostname assignment, so we can't override the current-page hostname.
    // Tests use parent hostnames that differ from jsdom's default 'localhost'
    // to exercise the external-frame branch.
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

    isEmbeddedMock.mockReturnValue(true)
    readParentOriginMock.mockReturnValue({ parentHostname: 'evil.com', crossOrigin: false })

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

    isEmbeddedMock.mockReturnValue(true)
    readParentOriginMock.mockReturnValue({ parentHostname: 'allowed.com', crossOrigin: false })

    const strategy = new FrameEmbeddingProtectionStrategy({ allowedDomains: ['allowed.com'] } as FrameEmbeddingOptions, document.body, undefined, false)
    strategy.setMediator(mediator)

    strategy.apply()

    expect(mediator.publish).not.toHaveBeenCalled()

    strategy.remove()
  })

  it('treats cross-origin parent access exceptions as external frame', () => {
    const mediator: ProtectionMediator = {
      publish: jest.fn(),
      subscribe: jest.fn(() => ''),
      unsubscribe: jest.fn(() => true),
      getSubscriptions: jest.fn(() => []),
      setDebugMode: jest.fn(),
    }

    isEmbeddedMock.mockReturnValue(true)
    readParentOriginMock.mockReturnValue({ parentHostname: null, crossOrigin: true })

    const strategy = new FrameEmbeddingProtectionStrategy(
      { allowedDomains: [] } as FrameEmbeddingOptions,
      document.body,
      undefined,
      false,
    )
    strategy.setMediator(mediator)
    strategy.apply()

    expect(mediator.publish).toHaveBeenCalled()
    const ev = (mediator.publish as jest.Mock).mock.calls[0][0] as FrameEmbeddingEvent
    expect(ev.data.isExternalFrame).toBe(true)
    expect(ev.data.parentDomain).toBeUndefined()
    strategy.remove()
  })

  it('blockAllFrames=true treats even same-origin frames as external', () => {
    const mediator: ProtectionMediator = {
      publish: jest.fn(),
      subscribe: jest.fn(() => ''),
      unsubscribe: jest.fn(() => true),
      getSubscriptions: jest.fn(() => []),
      setDebugMode: jest.fn(),
    }

    isEmbeddedMock.mockReturnValue(true)
    // Same-origin parent (matches jsdom's default 'localhost'): blockAllFrames
    // should still flag it as external.
    readParentOriginMock.mockReturnValue({ parentHostname: 'localhost', crossOrigin: false })

    const strategy = new FrameEmbeddingProtectionStrategy(
      { blockAllFrames: true, allowedDomains: [] } as FrameEmbeddingOptions,
      document.body,
      undefined,
      false,
    )
    strategy.setMediator(mediator)
    strategy.apply()

    expect(mediator.publish).toHaveBeenCalled()
    strategy.remove()
  })

  describe('apply / remove lifecycle', () => {
    it('apply is idempotent', () => {
      const strategy = new FrameEmbeddingProtectionStrategy({} as FrameEmbeddingOptions, document.body)
      strategy.apply()
      expect(() => strategy.apply()).not.toThrow()
      strategy.remove()
    })

    it('remove without apply is safe', () => {
      const strategy = new FrameEmbeddingProtectionStrategy({} as FrameEmbeddingOptions, document.body)
      expect(() => strategy.remove()).not.toThrow()
    })

    it('remove publishes STRATEGY_REMOVED when mediator is attached', () => {
      const mediator: ProtectionMediator = {
        publish: jest.fn(),
        subscribe: jest.fn(() => ''),
        unsubscribe: jest.fn(() => true),
        getSubscriptions: jest.fn(() => []),
        setDebugMode: jest.fn(),
      }
      const strategy = new FrameEmbeddingProtectionStrategy({} as FrameEmbeddingOptions, document.body)
      strategy.setMediator(mediator)
      strategy.apply()
      ;(mediator.publish as jest.Mock).mockClear()
      strategy.remove()

      const types = (mediator.publish as jest.Mock).mock.calls.map(
        (c) => (c[0] as { type: ProtectionEventType }).type,
      )
      expect(types).toContain(ProtectionEventType.STRATEGY_REMOVED)
    })
  })

  describe('updateOptions + setDebugMode', () => {
    it('rejects null options without throwing', () => {
      const strategy = new FrameEmbeddingProtectionStrategy({} as FrameEmbeddingOptions, document.body)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => strategy.updateOptions(null as any)).not.toThrow()
      strategy.remove()
    })

    it('republishes when critical options change while embedded externally', () => {
      const mediator: ProtectionMediator = {
        publish: jest.fn(),
        subscribe: jest.fn(() => ''),
        unsubscribe: jest.fn(() => true),
        getSubscriptions: jest.fn(() => []),
        setDebugMode: jest.fn(),
      }

      isEmbeddedMock.mockReturnValue(true)
      readParentOriginMock.mockReturnValue({ parentHostname: 'evil.com', crossOrigin: false })

      const strategy = new FrameEmbeddingProtectionStrategy(
        { allowedDomains: [], blockAllFrames: false } as FrameEmbeddingOptions,
        document.body,
        undefined,
        false,
      )
      strategy.setMediator(mediator)
      strategy.apply()
      ;(mediator.publish as jest.Mock).mockClear()

      // Toggle blockAllFrames — critical option, should re-publish.
      strategy.updateOptions({ blockAllFrames: true })
      expect(mediator.publish).toHaveBeenCalled()
      strategy.remove()
    })

    it('setDebugMode does not throw', () => {
      const strategy = new FrameEmbeddingProtectionStrategy({} as FrameEmbeddingOptions, document.body)
      expect(() => strategy.setDebugMode(true)).not.toThrow()
      expect(() => strategy.setDebugMode(false)).not.toThrow()
      strategy.remove()
    })
  })
})
