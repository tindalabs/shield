import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { SecurityOverlayManager } from '../../utils/securityOverlayManager'

// Wait for a queued MutationObserver microtask (and any synchronous follow-ups
// it kicks off, like the auto-restore path) to settle. One macrotask boundary
// is enough in jsdom; we use two to be safe across batched mutations.
const flushObservers = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const countBlockers = (): number =>
  document.querySelectorAll('#security-event-blocker').length

// SecurityOverlayManager always tags the overlay element with id="security-overlay".
const countOverlays = (): number =>
  document.querySelectorAll('#security-overlay').length

describe('SecurityOverlayManager', () => {
  let manager: SecurityOverlayManager

  beforeEach(() => {
    manager = new SecurityOverlayManager(false)
    document.body.innerHTML = ''
  })

  afterEach(() => {
    manager.clearAllOverlays()
    document.body.innerHTML = ''
  })

  describe('basic lifecycle', () => {
    it('registerOverlay shows an overlay (and a blocker when blockEvents=true)', () => {
      manager.registerOverlay('test-owner', 'test-type', {
        title: 'Blocked',
        message: 'Nope',
        blockEvents: true,
      })

      expect(countBlockers()).toBe(1)
      // body should contain the overlay element too
      expect(document.body.children.length).toBeGreaterThanOrEqual(2)
    })

    it('registerOverlay without blockEvents does not create a blocker', () => {
      manager.registerOverlay('test-owner', 'test-type', {
        title: 'Blocked',
        blockEvents: false,
      })

      expect(countBlockers()).toBe(0)
    })

    it('removeOverlayById cleans up both elements', () => {
      const id = manager.registerOverlay('test-owner', 'test-type', {
        title: 'X',
        blockEvents: true,
      })
      expect(countBlockers()).toBe(1)

      const removed = manager.removeOverlayById(id)
      expect(removed).toBe(true)
      expect(countBlockers()).toBe(0)
      expect(manager.hasOverlay(id)).toBe(false)
    })

    it('removeOverlaysByOwner cleans up every overlay for that owner', () => {
      manager.registerOverlay('A', 't1', { blockEvents: true })
      manager.registerOverlay('A', 't2', { blockEvents: true })
      manager.registerOverlay('B', 't3', { blockEvents: true })
      // Three registered; only the first per active slot will be visible
      // (the others are queued), but storage tracks all three.

      const removed = manager.removeOverlaysByOwner('A')
      expect(removed).toBe(2)
      expect(manager.getOverlaysByOwner('A')).toEqual([])
      expect(manager.getOverlaysByOwner('B').length).toBe(1)
    })

    it('clearAllOverlays removes everything from storage and DOM', () => {
      manager.registerOverlay('A', 't1', { blockEvents: true })
      manager.registerOverlay('B', 't2', { blockEvents: true })

      const cleared = manager.clearAllOverlays()
      expect(cleared).toBe(2)
      expect(countBlockers()).toBe(0)
      expect(manager.getActiveOverlayId()).toBeNull()
    })
  })

  describe('auto-restore', () => {
    it('regression: manually removing only the overlay does not stack blockers', async () => {
      // This is the bug that prompted the test suite. Pre-fix, every
      // remove → restore cycle leaked one #security-event-blocker div.
      manager.registerOverlay('owner', 'type', {
        title: 'X',
        blockEvents: true,
        autoRestore: true,
      })

      expect(countBlockers()).toBe(1)

      for (let i = 0; i < 5; i++) {
        const overlayEl = document.querySelector('#security-overlay') as HTMLElement | null
        expect(overlayEl).toBeTruthy()
        overlayEl?.parentNode?.removeChild(overlayEl)
        await flushObservers()

        // After each restore cycle we want exactly one of each, not N+1.
        expect(countBlockers()).toBe(1)
        expect(countOverlays()).toBe(1)
      }
    })

    it('regression mirror: manually removing only the blocker does not stack overlays', async () => {
      manager.registerOverlay('owner', 'type', {
        title: 'X',
        blockEvents: true,
        autoRestore: true,
      })

      for (let i = 0; i < 5; i++) {
        const blocker = document.getElementById('security-event-blocker')
        expect(blocker).toBeTruthy()
        blocker?.parentNode?.removeChild(blocker)
        await flushObservers()

        expect(countBlockers()).toBe(1)
        expect(countOverlays()).toBe(1)
      }
    })

    it('does not restore when autoRestore is false', async () => {
      manager.registerOverlay('owner', 'type', {
        title: 'X',
        blockEvents: true,
        autoRestore: false,
      })

      const overlayEl = document.querySelector('#security-overlay') as HTMLElement | null
      overlayEl?.parentNode?.removeChild(overlayEl)
      await flushObservers()

      expect(countOverlays()).toBe(0)
    })
  })

  describe('queueing and priority', () => {
    it('higher-priority overlay supersedes the active one', () => {
      const lowId = manager.registerOverlay('A', 't-low', { blockEvents: true }, 0)
      const highId = manager.registerOverlay('B', 't-high', { blockEvents: true }, 10)

      expect(manager.getActiveOverlayId()).toBe(highId)
      // The displaced low-priority overlay is hidden but still in storage.
      // Note: the current implementation does NOT re-queue the displaced overlay,
      // so it won't reappear after the high-priority one is dismissed. That's a
      // potential UX gap separate from this test's scope.
      expect(manager.hasOverlay(lowId)).toBe(true)
      // Exactly one overlay is rendered at a time.
      expect(countOverlays()).toBe(1)
      expect(countBlockers()).toBe(1)
    })

    it('lower-priority overlays go into the queue', () => {
      manager.registerOverlay('A', 't-active', { blockEvents: true }, 10)
      const queuedId = manager.registerOverlay('B', 't-queued', { blockEvents: true }, 1)

      expect(manager.getOverlayQueue()).toContain(queuedId)
      // Only one overlay should be visible at a time
      expect(countBlockers()).toBe(1)
    })
  })

  describe('content', () => {
    it('renders title and message into the overlay element', () => {
      manager.registerOverlay('owner', 'type', {
        title: 'Access Denied',
        message: 'Your session has been flagged.',
        blockEvents: false,
      })

      const text = document.body.textContent ?? ''
      expect(text).toContain('Access Denied')
      expect(text).toContain('Your session has been flagged.')
    })
  })
})
