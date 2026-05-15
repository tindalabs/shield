import { describe, it, expect, jest } from '@jest/globals'
import { DevToolsStrategy } from '../../strategies/DevToolsStrategy'
import { ProtectionEventType } from '../../core/mediator/protection-event'
import type { ProtectionMediator } from '../../core/mediator/types'
import type { DevToolsEvent } from '../../core/mediator/protection-event'

describe('DevToolsStrategy', () => {
  it('calls custom handler and publishes state change with overlay options', () => {
    const mediator: ProtectionMediator = {
      publish: jest.fn(),
      subscribe: jest.fn(() => ''),
      unsubscribe: jest.fn(() => true),
      getSubscriptions: jest.fn(() => []),
      setDebugMode: jest.fn(),
    }
    const customHandler = jest.fn()

    const strategy = new DevToolsStrategy({ showOverlay: true, overlayOptions: { title: 'Custom DevTools' } }, document.body, customHandler, false)

    // Attach mocked mediator using the public API
    strategy.setMediator(mediator)

    // Simulate devtools open using a typed access
    ;(strategy as unknown as { handleDevToolsStateChange: (isOpen: boolean) => void }).handleDevToolsStateChange(true)

    // Custom handler should be called
    expect(customHandler).toHaveBeenCalledWith(true)

    // Mediator should be published with DEVTOOLS_STATE_CHANGE and overlay options
    expect(mediator.publish).toHaveBeenCalled()
    const published = (mediator.publish as jest.Mock).mock.calls[0][0] as DevToolsEvent
    expect(published.type).toBe(ProtectionEventType.DEVTOOLS_STATE_CHANGE)
    expect(published.data).toBeDefined()
    expect(published.data.overlayOptions).toBeDefined()
    expect(published.data.overlayOptions!.title).toBe('Custom DevTools')

    // Clean up timeouts/intervals created by the strategy
    strategy.remove()
  })
})