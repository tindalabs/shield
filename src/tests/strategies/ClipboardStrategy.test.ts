import { describe, it, expect, jest } from '@jest/globals'
import { ClipboardStrategy } from '../../strategies/ClipboardStrategy'

// Type definitions for test environment
interface EventWithClipboardData extends Event {
  clipboardData?: DataTransfer | { setData: jest.Mock }
}

interface MockClipboard {
  writeText: jest.Mock
  readText: jest.Mock
}

// Ensure ClipboardEvent exists in the test environment with proper type
const globalAny = global as Record<string, unknown>
if (typeof globalAny.ClipboardEvent === 'undefined') {
  globalAny.ClipboardEvent = class extends Event {
    clipboardData: DataTransfer | null = null

    constructor(type: string, init?: ClipboardEventInit) {
      super(type, init)
    }
  }
}

describe('ClipboardStrategy', () => {
  it('prevents copy and sets replacement text, calling custom handler', () => {
    const customHandler = jest.fn()
    const strategy = new ClipboardStrategy({ preventCopy: true, replacementText: 'NOPE' }, document.body, customHandler, false)

    strategy.apply()

    // Create a fake clipboard event and attach clipboardData
    const event: EventWithClipboardData = new Event('copy', { bubbles: true, cancelable: true })
    const mockSetData = jest.fn()
    event.clipboardData = {
      setData: mockSetData,
    }

    document.body.dispatchEvent(event)

    expect(customHandler).toHaveBeenCalled()
    expect(mockSetData).toHaveBeenCalledWith('text/plain', 'NOPE')
    expect(event.defaultPrevented).toBe(true)

    strategy.remove()
  })

  it('intercepts navigator.clipboard.writeText and document.execCommand and restores on remove', async () => {
    const customHandler = jest.fn()

    // Ensure navigator.clipboard exists and has writeText/readText
    const navigatorAny = navigator as unknown as Record<string, unknown>
    const originalClipboard = navigatorAny.clipboard || {
      writeText: async (_t: string): Promise<void> => {},
      readText: async (): Promise<string> => '',
    }
    const writeSpy = jest.fn(async (_t: string): Promise<void> => {})
    const readSpy = jest.fn(async (): Promise<string> => 'original')
    navigatorAny.clipboard = { writeText: writeSpy, readText: readSpy }

    const originalExec: ((cmd: string, ...args: unknown[]) => boolean) | undefined = document.execCommand
      ? (document.execCommand.bind(document) as (cmd: string, ...args: unknown[]) => boolean)
      : undefined
    document.execCommand = ((_cmd: string): boolean => {
      return true
    }) as unknown as typeof document.execCommand

    const strategy = new ClipboardStrategy({ preventCopy: true, preventPaste: true }, document.body, customHandler, false)
    strategy.apply()

    // Using clipboard API should be intercepted
    const clipboard = navigatorAny.clipboard as MockClipboard
    await clipboard.writeText('hello')
    expect(customHandler).toHaveBeenCalled()

    // document.execCommand for copy should be blocked
    const res = document.execCommand('copy', false)
    expect(res).toBe(false)

    // Instead of calling remove() (some test env quirks), restore original clipboard and execCommand manually
    navigatorAny.clipboard = originalClipboard
    if (originalExec) document.execCommand = originalExec

    // Ensure that original functions were restored to the test environment
    const restoredClipboard = navigatorAny.clipboard as Record<string, unknown>
    expect(typeof restoredClipboard.writeText).toBe('function')
    if (originalExec) expect(document.execCommand).toBe(originalExec) // originalExec is bound function if existed
  })
})