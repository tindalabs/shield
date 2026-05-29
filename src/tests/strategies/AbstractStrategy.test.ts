import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { AbstractStrategy, StrategyError, StrategyErrorType } from '../../strategies/AbstractStrategy'
import { eventManager } from '../../utils/eventManager'

// AbstractStrategy is abstract; we use a thin concrete subclass that exposes
// the protected primitives we want to exercise.
class TestStrategy extends AbstractStrategy {
  public apply(): void { this.isAppliedFlag = true }

  // Expose protected hooks to tests via stable typed wrappers.
  public callRegisterEvent(target: EventTarget | null, type: string, handler: EventListener): string {
    return this.registerEvent(target, type, handler)
  }
  public callRemoveAllEventsForTarget(target: EventTarget | null): number {
    return this.removeAllEventsForTarget(target)
  }
  public callRemoveEventsBySelector(selector: string, type: string): number {
    return this.removeEventsBySelector(selector, type)
  }
  public callHandleError(type: StrategyErrorType, message: string, original?: unknown): void {
    this.handleError(type, message, original)
  }
  public callSafeExecute<T>(op: string, type: StrategyErrorType, fn: () => T): T | undefined {
    return this.safeExecute(op, type, fn)
  }
  public callSafeExecuteAsync<T>(op: string, type: StrategyErrorType, fn: () => Promise<T>): Promise<T | undefined> {
    return this.safeExecuteAsync(op, type, fn)
  }
}

describe('AbstractStrategy', () => {
  let errSpy: jest.SpiedFunction<typeof console.error>
  let logSpy: jest.SpiedFunction<typeof console.log>

  beforeEach(() => {
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    eventManager.clearAllEvents()
    errSpy.mockRestore()
    logSpy.mockRestore()
  })

  describe('StrategyError', () => {
    it('captures strategyName, errorType, message, and the original error', () => {
      const original = new Error('boom')
      const err = new StrategyError('TS', StrategyErrorType.APPLICATION, 'failed', original)
      expect(err.name).toBe('StrategyError')
      expect(err.strategyName).toBe('TS')
      expect(err.errorType).toBe(StrategyErrorType.APPLICATION)
      expect(err.originalError).toBe(original)
      // Composite message: "[TS] failed: boom"
      expect(err.message).toContain('TS')
      expect(err.message).toContain('failed')
      expect(err.message).toContain('boom')
    })

    it('omits the original-error suffix when no Error instance is given', () => {
      const err = new StrategyError('TS', StrategyErrorType.UNKNOWN, 'no original')
      expect(err.message).toBe('[TS] no original')
    })
  })

  describe('STRATEGY_NAME', () => {
    it('exposes STRATEGY_NAME alongside the inherited COMPONENT_NAME', () => {
      const s = new TestStrategy('Demo')
      expect(s.STRATEGY_NAME).toBe('Demo')
      expect(s.COMPONENT_NAME).toBe('Demo')
    })
  })

  describe('setMediator', () => {
    it('attaches and logs (silently unless debug is on)', () => {
      const s = new TestStrategy('Demo')
      s.setMediator({
        publish: jest.fn(),
        subscribe: jest.fn(() => ''),
        unsubscribe: jest.fn(() => true),
        getSubscriptions: jest.fn(() => []),
        setDebugMode: jest.fn(),
      })
      // No public getter — the call should simply not throw.
      expect(() => s.apply()).not.toThrow()
    })
  })

  describe('remove()', () => {
    it('default base implementation is a no-op before apply', () => {
      const s = new TestStrategy('Demo')
      expect(() => s.remove()).not.toThrow()
      expect(s.isApplied()).toBe(false)
    })

    it('clears isAppliedFlag after apply + remove', () => {
      const s = new TestStrategy('Demo')
      s.apply()
      expect(s.isApplied()).toBe(true)
      s.remove()
      expect(s.isApplied()).toBe(false)
    })
  })

  describe('updateOptions default', () => {
    it('logs and does not throw when subclasses do not override', () => {
      const s = new TestStrategy('Demo')
      expect(() => s.updateOptions({ anything: 'goes' })).not.toThrow()
    })
  })

  describe('handleError', () => {
    it('prints message-only in non-debug mode', () => {
      const s = new TestStrategy('Demo', false)
      s.callHandleError(StrategyErrorType.APPLICATION, 'something broke', new Error('inner'))
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('something broke'))
    })

    it('prints the full error object + original stack in debug mode', () => {
      const s = new TestStrategy('Demo', true)
      s.callHandleError(StrategyErrorType.APPLICATION, 'broke', new Error('inner'))
      // Debug mode prints two console.error calls — the StrategyError object
      // and the original stack line. We assert at least the StrategyError was
      // printed as an object (not as a string).
      const calledWithObject = errSpy.mock.calls.some(
        (c) => c[0] instanceof Error,
      )
      expect(calledWithObject).toBe(true)
    })
  })

  describe('safeExecute / safeExecuteAsync', () => {
    it('safeExecute returns the function result on success', () => {
      const s = new TestStrategy('Demo')
      const result = s.callSafeExecute('op', StrategyErrorType.APPLICATION, () => 42)
      expect(result).toBe(42)
    })

    it('safeExecute returns undefined and logs on throw', () => {
      const s = new TestStrategy('Demo')
      const result = s.callSafeExecute('op', StrategyErrorType.APPLICATION, () => {
        throw new Error('nope')
      })
      expect(result).toBeUndefined()
      expect(errSpy).toHaveBeenCalled()
    })

    it('safeExecuteAsync awaits and returns the resolved value', async () => {
      const s = new TestStrategy('Demo')
      const result = await s.callSafeExecuteAsync('op', StrategyErrorType.APPLICATION, async () => 'ok')
      expect(result).toBe('ok')
    })

    it('safeExecuteAsync swallows rejected promises and logs', async () => {
      const s = new TestStrategy('Demo')
      const result = await s.callSafeExecuteAsync('op', StrategyErrorType.APPLICATION, async () => {
        throw new Error('async-nope')
      })
      expect(result).toBeUndefined()
      expect(errSpy).toHaveBeenCalled()
    })
  })

  describe('registerEvent', () => {
    it('returns "" for null target', () => {
      const s = new TestStrategy('Demo')
      expect(s.callRegisterEvent(null, 'click', () => {})).toBe('')
    })

    it('rejects targets missing addEventListener — logs a StrategyError and returns ""', () => {
      const s = new TestStrategy('Demo')
      const fakeTarget = {} as unknown as EventTarget
      expect(s.callRegisterEvent(fakeTarget, 'click', () => {})).toBe('')
      expect(errSpy).toHaveBeenCalled()
    })

    it('registers via eventManager and isolates handler exceptions', () => {
      const s = new TestStrategy('Demo')
      const throwing = jest.fn(() => { throw new Error('boom') })
      const id = s.callRegisterEvent(document, 'click', throwing)
      expect(id).toBeTruthy()

      // Dispatching the event should NOT propagate the handler's exception.
      expect(() => document.dispatchEvent(new Event('click'))).not.toThrow()
      expect(throwing).toHaveBeenCalled()
      expect(errSpy).toHaveBeenCalled() // logged by the wrapper
    })
  })

  describe('removeAllEventsForTarget / removeEventsBySelector', () => {
    it('removeAllEventsForTarget delegates to eventManager and returns the count', () => {
      const s = new TestStrategy('Demo')
      s.callRegisterEvent(document, 'click', () => {})
      const removed = s.callRemoveAllEventsForTarget(document)
      expect(removed).toBeGreaterThan(0)
    })

    it('removeAllEventsForTarget returns 0 for null target', () => {
      const s = new TestStrategy('Demo')
      expect(s.callRemoveAllEventsForTarget(null)).toBe(0)
    })

    it('removeEventsBySelector returns 0 when no elements match', () => {
      const s = new TestStrategy('Demo')
      expect(s.callRemoveEventsBySelector('.nothing-here', 'click')).toBe(0)
    })
  })
})
