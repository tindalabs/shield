import { describe, it, expect } from '@jest/globals'
import { WatermarkStrategy } from '../../strategies/WatermarkStrategy'

describe('WatermarkStrategy', () => {
  it('creates and removes watermarks', () => {
    const strategy = new WatermarkStrategy({ text: 'TEST', density: 1 }, document.body, false)

    // Apply watermarks
    strategy.apply()

    const container = document.querySelector('.content-security-watermark-container')
    expect(container).toBeDefined()
    expect(container?.querySelectorAll('.content-security-watermark').length).toBeGreaterThan(0)

    // Remove and ensure container removed
    strategy.remove()
    const after = document.querySelector('.content-security-watermark-container')
    expect(after).toBeNull()
  })

  it('auto-restores watermarks when removed', async () => {
    const strategy = new WatermarkStrategy({ text: 'AUTORESTORE', density: 1 }, document.body, false)

    strategy.apply()

    let container = document.querySelector('.content-security-watermark-container') as HTMLElement | null
    expect(container).toBeTruthy()

    // Remove the container from the DOM to simulate tampering
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }

    // Wait a tick for MutationObserver callbacks to run
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The strategy should have recreated the watermark
    container = document.querySelector('.content-security-watermark-container') as HTMLElement | null
    expect(container).toBeTruthy()

    // Clean up
    strategy.remove()
  })

  it('two concurrent instances on the same element do not remove each other (no restore loop)', async () => {
    const a = new WatermarkStrategy({ text: 'A', density: 1 }, document.body, false)
    const b = new WatermarkStrategy({ text: 'B', density: 1 }, document.body, false)

    a.apply()
    b.apply()

    // Both instances' containers must coexist — pre-fix, b.apply() globally
    // removed a's container, kicking off an infinite cross-instance restore loop.
    const containers = document.querySelectorAll('.content-security-watermark-container')
    expect(containers.length).toBe(2)

    // Let any observer callbacks settle; the count must stay stable (no loop).
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(document.querySelectorAll('.content-security-watermark-container').length).toBe(2)

    // Removing one leaves the other intact.
    a.remove()
    expect(document.querySelectorAll('.content-security-watermark-container').length).toBe(1)

    b.remove()
    expect(document.querySelectorAll('.content-security-watermark-container').length).toBe(0)
  })
})