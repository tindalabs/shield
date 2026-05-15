import { describe, it, expect, jest } from '@jest/globals'
import { SelectionStrategy } from '../../strategies/SelectionStrategy'

describe('SelectionStrategy', () => {
  it('injects selection-blocking CSS and prevents selectstart', () => {
    const customHandler = jest.fn()
    const strategy = new SelectionStrategy(document.body, customHandler, false)

    strategy.apply()

    const style = document.querySelector('style[data-content-security="selection-blocker"]')
    expect(style).toBeTruthy()

    // Spy on selection removal
    const sel = window.getSelection()
    const removeSpy = sel ? jest.spyOn(sel, 'removeAllRanges') : jest.fn()

    const event = new Event('selectstart', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)

    expect(customHandler).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalled()

    strategy.remove()

    const after = document.querySelector('style[data-content-security="selection-blocker"]')
    expect(after).toBeNull()
  })

  it('prevents dragstart and calls custom handler', () => {
    const customHandler = jest.fn()
    const strategy = new SelectionStrategy(document.body, customHandler, false)

    strategy.apply()

    const dragEvent = new Event('dragstart', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(dragEvent)

    expect(customHandler).toHaveBeenCalled()

    strategy.remove()
  })
})