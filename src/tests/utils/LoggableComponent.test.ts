import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { LoggableComponent } from '../../utils/base/LoggableComponent'

// Concrete subclass — LoggableComponent is abstract, so we need a thin shim
// that exposes the protected log/warn/error helpers for testing.
class TestComponent extends LoggableComponent {
  public callLog(msg: string, ...args: unknown[]): void { this.log(msg, ...args) }
  public callWarn(msg: string, ...args: unknown[]): void { this.warn(msg, ...args) }
  public callError(msg: string, ...args: unknown[]): void { this.error(msg, ...args) }
}

describe('LoggableComponent', () => {
  let logSpy: jest.SpiedFunction<typeof console.log>
  let warnSpy: jest.SpiedFunction<typeof console.warn>
  let errorSpy: jest.SpiedFunction<typeof console.error>

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  describe('construction', () => {
    it('exposes COMPONENT_NAME and defaults debugMode to false', () => {
      const c = new TestComponent('MyComponent')
      expect(c.COMPONENT_NAME).toBe('MyComponent')
      expect(c.isDebugEnabled()).toBe(false)
    })

    it('honours debugMode=true at construction', () => {
      const c = new TestComponent('MyComponent', true)
      expect(c.isDebugEnabled()).toBe(true)
    })
  })

  describe('log gating', () => {
    it('log() is suppressed when debug is off', () => {
      const c = new TestComponent('C')
      c.callLog('hidden')
      expect(logSpy).not.toHaveBeenCalled()
    })

    it('log() passes through when debug is on, prefixed with the component name', () => {
      const c = new TestComponent('C', true)
      c.callLog('visible', 1, 2)
      expect(logSpy).toHaveBeenCalledWith('C: visible', 1, 2)
    })
  })

  describe('warn behaviour', () => {
    it('warn() drops args in non-debug mode (brief form)', () => {
      const c = new TestComponent('C')
      c.callWarn('warning', { detail: 'x' })
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy).toHaveBeenCalledWith('C: warning')
    })

    it('warn() includes args in debug mode (verbose form)', () => {
      const c = new TestComponent('C', true)
      c.callWarn('warning', { detail: 'x' })
      expect(warnSpy).toHaveBeenCalledWith('C: warning', { detail: 'x' })
    })
  })

  describe('error', () => {
    it('error() always prints with args, regardless of debug mode', () => {
      const c = new TestComponent('C')
      c.callError('boom', new Error('oops'))
      expect(errorSpy).toHaveBeenCalledWith('C: boom', expect.any(Error))
    })
  })

  describe('setDebugMode', () => {
    it('toggling on emits a confirmation log line', () => {
      const c = new TestComponent('C')
      c.setDebugMode(true)
      expect(c.isDebugEnabled()).toBe(true)
      expect(logSpy).toHaveBeenCalledWith('C: Debug mode enabled')
    })

    it('toggling off updates state silently (logger gates the disable line)', () => {
      const c = new TestComponent('C', true)
      logSpy.mockClear()
      c.setDebugMode(false)
      expect(c.isDebugEnabled()).toBe(false)
      // Logger sees debugMode=false before the log fires, so the line is gated out.
      expect(logSpy).not.toHaveBeenCalled()
    })
  })
})
