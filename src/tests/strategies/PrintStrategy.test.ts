import { describe, it, expect, jest } from '@jest/globals'

// Ensure matchMedia exists in jsdom for print detection
if (typeof window.matchMedia === 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({
      matches: false,
      media: query,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  })
}

import { PrintStrategy } from '../../strategies/PrintStrategy'

describe('PrintStrategy', () => {
  it('injects and removes print-blocking CSS', () => {
    const strategy = new PrintStrategy(undefined, false)

    strategy.apply()

    const style = document.querySelector('style[data-content-security="print-blocker"]')
    expect(style).toBeTruthy()

    strategy.remove()

    const after = document.querySelector('style[data-content-security="print-blocker"]')
    expect(after).toBeNull()
  })

  it('calls custom handler and stops printing on beforeprint', async () => {
    const customHandler = jest.fn()
    const stopSpy = jest.spyOn(window, 'stop').mockImplementation(() => {})

    const strategy = new PrintStrategy(customHandler, false)

    // Ensure handler is registered and then dispatch event so the scheduled stop runs
    strategy.apply()
    window.dispatchEvent(new Event('beforeprint'))

    // Wait a tick for the setTimeout in the handler
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(customHandler).toHaveBeenCalled()
    expect(stopSpy).toHaveBeenCalled()

    stopSpy.mockRestore()
  })
})