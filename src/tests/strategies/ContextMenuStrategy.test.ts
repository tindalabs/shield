import { describe, it, expect, jest } from '@jest/globals'
import { ContextMenuStrategy } from '../../strategies/ContextMenuStrategy'

describe('ContextMenuStrategy', () => {
  it('prevents default and calls custom handler on contextmenu', () => {
    const customHandler = jest.fn()

    const strategy = new ContextMenuStrategy({}, document.body, customHandler, false)
    strategy.apply()

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)

    expect(customHandler).toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)

    strategy.remove()
  })

  it('protects iframe content from context menu when same-origin', () => {
    const customHandler = jest.fn()

    // Create an iframe and ensure same-origin availability
    const iframe = document.createElement('iframe')
    // No src means same-origin in jsdom
    document.body.appendChild(iframe)

    const strategy = new ContextMenuStrategy({}, document.body, customHandler, false)
    strategy.apply()

    const iframeDoc = iframe.contentDocument as Document
    expect(iframeDoc).toBeDefined()

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    // Dispatch on the iframe document body
    iframeDoc.body.dispatchEvent(event)

    expect(customHandler).toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)

    strategy.remove()

    // clean up
    if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe)
  })
})