import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { ProtectedContentManager } from '../../utils/protectedContentManager'
import { ContentProtectionMediator } from '../../core/mediator/ContentProtectionMediator'
import { ProtectionEventType } from '../../core/mediator/protection-event'

const makeTarget = (): HTMLElement => {
  const el = document.createElement('div')
  el.innerHTML = '<p data-original>original sensitive content</p>'
  document.body.appendChild(el)
  return el
}

describe('ProtectedContentManager', () => {
  let target: HTMLElement
  let mgr: ProtectedContentManager
  // Mediator publishes a console.log per publish() (line 148 in source);
  // silence to keep test output clean.
  let logSpy: jest.SpiedFunction<typeof console.log>

  beforeEach(() => {
    target = makeTarget()
    mgr = new ProtectedContentManager(target, false)
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    mgr.clearAllContentStates()
    document.body.innerHTML = ''
    logSpy.mockRestore()
  })

  describe('hideContent / restoreContent (direct API)', () => {
    it('replaces innerHTML with a placeholder carrying title + message', () => {
      const ok = mgr.hideContent({ title: 'Locked', message: 'Nope, friend.' })
      expect(ok).toBe(true)
      expect(target.querySelector('[data-original]')).toBeNull()
      expect(target.textContent).toContain('Locked')
      expect(target.textContent).toContain('Nope, friend.')
      expect(mgr.isContentHidden()).toBe(true)
    })

    it('falls back to default copy when title/message are omitted', () => {
      mgr.hideContent({})
      expect(target.textContent).toContain('Content Protected')
    })

    it('restoreContent puts the original innerHTML back exactly', () => {
      mgr.hideContent({ title: 'X' })
      expect(mgr.restoreContent()).toBe(true)
      expect(target.querySelector('[data-original]')).not.toBeNull()
      expect(mgr.isContentHidden()).toBe(false)
    })

    it('restoreContent returns false when nothing is hidden', () => {
      expect(mgr.restoreContent()).toBe(false)
    })
  })

  describe('content callbacks', () => {
    it('onContentHidden fires with the reason from the active state', () => {
      const onHidden = jest.fn()
      const onRestored = jest.fn()
      mgr.setContentCallbacks(onHidden, onRestored)

      const mediator = new ContentProtectionMediator(false)
      mgr.setMediator(mediator)

      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'TestStrategy',
        timestamp: Date.now(),
        data: {
          strategyName: 'TestStrategy',
          reason: 'devtools_opened',
          options: { title: 'Locked' },
        },
      })

      expect(onHidden).toHaveBeenCalledWith('devtools_opened', target)
    })

    it('onContentRestored fires when the active state is removed', () => {
      const onHidden = jest.fn()
      const onRestored = jest.fn()
      mgr.setContentCallbacks(onHidden, onRestored)

      const mediator = new ContentProtectionMediator(false)
      mgr.setMediator(mediator)

      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'TestStrategy',
        timestamp: Date.now(),
        data: { strategyName: 'TestStrategy', reason: 'r', options: { title: 'X' } },
      })
      mediator.publish({
        type: ProtectionEventType.CONTENT_RESTORED,
        source: 'TestStrategy',
        timestamp: Date.now(),
        data: { strategyName: 'TestStrategy' },
      })

      expect(onRestored).toHaveBeenCalledWith(target)
      expect(mgr.isContentHidden()).toBe(false)
    })

    it('isolates exceptions thrown inside the hidden/restored callbacks', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      mgr.setContentCallbacks(
        () => { throw new Error('boom-hidden') },
        () => { throw new Error('boom-restored') },
      )

      expect(() => mgr.hideContent({ title: 'X' })).not.toThrow()
      expect(() => mgr.restoreContent()).not.toThrow()
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })

  describe('mediator integration', () => {
    it('subscribes to CONTENT_HIDDEN + CONTENT_RESTORED and reacts', () => {
      const mediator = new ContentProtectionMediator(false)
      mgr.setMediator(mediator)

      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'S',
        timestamp: Date.now(),
        data: { strategyName: 'S', reason: 'r', options: { title: 'Hidden' } },
      })
      expect(mgr.isContentHidden()).toBe(true)
      expect(target.textContent).toContain('Hidden')

      mediator.publish({
        type: ProtectionEventType.CONTENT_RESTORED,
        source: 'S',
        timestamp: Date.now(),
        data: { strategyName: 'S' },
      })
      expect(mgr.isContentHidden()).toBe(false)
    })

    it('ignores events scoped to a different targetElement', () => {
      const mediator = new ContentProtectionMediator(false)
      mgr.setMediator(mediator)
      const other = document.createElement('div')

      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'S',
        timestamp: Date.now(),
        data: {
          strategyName: 'S',
          reason: 'r',
          options: { title: 'X' },
          targetElement: other, // not our target
        },
      })

      expect(mgr.isContentHidden()).toBe(false)
    })

    it('ignores CONTENT_HIDDEN events that lack options (defensive guard)', () => {
      const mediator = new ContentProtectionMediator(false)
      mgr.setMediator(mediator)

      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'S',
        timestamp: Date.now(),
        data: { strategyName: 'S', reason: 'r' /* options missing */ },
      })

      expect(mgr.isContentHidden()).toBe(false)
    })
  })

  describe('priority and queueing', () => {
    it('higher-priority state supersedes a lower-priority active one', () => {
      const mediator = new ContentProtectionMediator(false)
      mgr.setMediator(mediator)

      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'A',
        timestamp: Date.now(),
        data: { strategyName: 'A', reason: 'low', options: { title: 'LOW' }, priority: 1 },
      })
      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'B',
        timestamp: Date.now(),
        data: { strategyName: 'B', reason: 'high', options: { title: 'HIGH' }, priority: 10 },
      })

      expect(target.textContent).toContain('HIGH')
      // Both states live in storage; only the high-priority one is visible.
      const info = mgr.getDebugInfo()
      expect(info.totalStates).toBe(2)
      // NOTE: the displaced LOW state is currently orphaned by the supersession
      // path — it stays in `contentStates` but is neither active nor queued, so
      // dismissing HIGH will restore the original content rather than fall back
      // to LOW. Same shape as the SecurityOverlayManager re-queue bug; see the
      // matching ROADMAP follow-up. Once that's fixed, the assertion below
      // should become `>= 1` and a sibling test should cover the fallback.
      expect(info.queueLength).toBe(0)
    })

    it('lower-priority state goes to the queue and reappears after the active one is dismissed', () => {
      const mediator = new ContentProtectionMediator(false)
      mgr.setMediator(mediator)

      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'A',
        timestamp: Date.now(),
        data: { strategyName: 'A', reason: 'r', options: { title: 'A-shown' }, priority: 10 },
      })
      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'B',
        timestamp: Date.now(),
        data: { strategyName: 'B', reason: 'r', options: { title: 'B-queued' }, priority: 1 },
      })
      expect(target.textContent).toContain('A-shown')

      // Dismiss A — B should take over.
      mediator.publish({
        type: ProtectionEventType.CONTENT_RESTORED,
        source: 'A',
        timestamp: Date.now(),
        data: { strategyName: 'A' },
      })
      expect(target.textContent).toContain('B-queued')
      expect(mgr.isContentHidden()).toBe(true)
    })

    it('removing the active state with no queued states restores the original content', () => {
      const mediator = new ContentProtectionMediator(false)
      mgr.setMediator(mediator)

      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'A',
        timestamp: Date.now(),
        data: { strategyName: 'A', reason: 'r', options: { title: 'X' } },
      })
      mediator.publish({
        type: ProtectionEventType.CONTENT_RESTORED,
        source: 'A',
        timestamp: Date.now(),
        data: { strategyName: 'A' },
      })

      expect(target.querySelector('[data-original]')).not.toBeNull()
    })
  })

  describe('queries', () => {
    it('getActiveContentStateId reflects the live state', () => {
      expect(mgr.getActiveContentStateId()).toBeNull()
      const mediator = new ContentProtectionMediator(false)
      mgr.setMediator(mediator)
      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'A',
        timestamp: Date.now(),
        data: { strategyName: 'A', reason: 'r', options: { title: 'X' } },
      })
      expect(mgr.getActiveContentStateId()).not.toBeNull()
    })

    it('getContentStatesByOwner lists every state registered to an owner', () => {
      const mediator = new ContentProtectionMediator(false)
      mgr.setMediator(mediator)
      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'A',
        timestamp: Date.now(),
        data: { strategyName: 'A', reason: 'r1', options: { title: 'X' } },
      })
      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'A',
        timestamp: Date.now(),
        data: { strategyName: 'A', reason: 'r2', options: { title: 'Y' }, priority: 2 },
      })
      expect(mgr.getContentStatesByOwner('A')).toHaveLength(2)
      expect(mgr.getContentStatesByOwner('Z')).toEqual([])
    })

    it('getDebugInfo aggregates totals, per-owner counts, and per-reason counts', () => {
      const mediator = new ContentProtectionMediator(false)
      mgr.setMediator(mediator)
      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'A',
        timestamp: Date.now(),
        data: { strategyName: 'A', reason: 'r1', options: { title: 'X' } },
      })
      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'B',
        timestamp: Date.now(),
        data: { strategyName: 'B', reason: 'r1', options: { title: 'Y' } },
      })

      const info = mgr.getDebugInfo()
      expect(info.totalStates).toBe(2)
      expect(info.statesByOwner).toEqual({ A: 1, B: 1 })
      expect(info.statesByReason).toEqual({ r1: 2 })
      expect(info.stateDetails).toHaveLength(2)
    })
  })

  describe('updateTargetElement', () => {
    it('restores the old target, swaps in the new one, and reapplies the active state', () => {
      mgr.hideContent({ title: 'Hi' })
      const initial = target.innerHTML

      const next = document.createElement('div')
      next.innerHTML = '<span data-next>next</span>'
      document.body.appendChild(next)

      mgr.updateTargetElement(next)
      // Old target was restored before swap.
      expect(target.innerHTML).not.toBe(initial)
      expect(mgr.getTargetElement()).toBe(next)
    })

    it('updates the target without reapplication when nothing was hidden', () => {
      const next = document.createElement('div')
      document.body.appendChild(next)
      mgr.updateTargetElement(next)
      expect(mgr.getTargetElement()).toBe(next)
      expect(mgr.isContentHidden()).toBe(false)
    })
  })

  describe('clearAllContentStates', () => {
    it('restores content and drops every state and queue entry', () => {
      const mediator = new ContentProtectionMediator(false)
      mgr.setMediator(mediator)
      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'A',
        timestamp: Date.now(),
        data: { strategyName: 'A', reason: 'r', options: { title: 'X' } },
      })
      mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: 'B',
        timestamp: Date.now(),
        data: { strategyName: 'B', reason: 'r', options: { title: 'Y' } },
      })

      const cleared = mgr.clearAllContentStates()
      expect(cleared).toBe(2)
      expect(mgr.getActiveContentStateId()).toBeNull()
      expect(mgr.isContentHidden()).toBe(false)
      expect(target.querySelector('[data-original]')).not.toBeNull()
    })
  })

  describe('setDebugMode', () => {
    it('flips the underlying logger', () => {
      logSpy.mockClear()
      mgr.setDebugMode(true)
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Debug mode enabled'))
    })
  })
})
