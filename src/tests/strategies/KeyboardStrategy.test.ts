import { describe, it, expect, jest, afterEach } from '@jest/globals'
import { KeyboardStrategy } from '../../strategies/KeyboardStrategy'
import { KeyboardShortcutManager } from '../../utils/keyboardShortcutManager/keyboardShortcutManager'
import { ShortcutCategory, type KeyboardShortcut } from '../../utils/keyboardShortcutManager/keyboardShortcuts'

describe('KeyboardStrategy', () => {
  afterEach(() => {
    // Clean up any listeners and restore mocks
    jest.restoreAllMocks()
  })

  it('blocks recognized keyboard shortcuts and calls custom handler', () => {
    const customHandler = jest.fn()

    // Create a fake shortcut manager to force a match
    const fakeShortcut: KeyboardShortcut = { id: 'copy', category: ShortcutCategory.COPY, description: 'Copy', keys: ['Control', 'c'] }
    const fakeManager: Partial<KeyboardShortcutManager> = {
      matchesShortcut: jest.fn().mockReturnValue(fakeShortcut) as unknown as (event: KeyboardEvent, categories?: ShortcutCategory[]) => KeyboardShortcut | null,
      getShortcutDescription: jest.fn().mockReturnValue('Ctrl+C') as unknown as (shortcut: KeyboardShortcut) => string,
    }

    // Spy on the singleton accessor and return our fake manager
    const spy = jest.spyOn(KeyboardShortcutManager, 'getInstance').mockReturnValue(fakeManager as KeyboardShortcutManager)

    const strategy = new KeyboardStrategy(customHandler, false)
    strategy.apply()

    // Simulate Ctrl+C
    const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true })
    document.dispatchEvent(event)

    expect(customHandler).toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)

    strategy.remove()

    spy.mockRestore()
  })
})