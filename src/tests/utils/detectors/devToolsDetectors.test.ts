import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import { SizeDetector } from '../../../utils/detectors/sizeDetector'
import { TimingDetector } from '../../../utils/detectors/timingDetector'
import { DateToStringDetector } from '../../../utils/detectors/dateToStringDetector'
import { FuncToStringDetector } from '../../../utils/detectors/funcToStringDetector'
import { RegToStringDetector } from '../../../utils/detectors/regToStringDetector'
import { DefineGetterDetector } from '../../../utils/detectors/defineGetterDetector'
import { DebugLibDetector } from '../../../utils/detectors/debugLibDetector'
import { DebuggerDetector } from '../../../utils/detectors/debuggerDetector'
import { intervalManager } from '../../../utils/intervalManager'
import { eventManager } from '../../../utils/eventManager'

// Each detector silently logs to console (some unconditionally). We silence
// console output globally for the suite so the test output stays readable;
// detectors that NEED to see console-mock counts spin their own spies.
let consoleLogSpy: jest.SpiedFunction<typeof console.log>
let consoleClearSpy: jest.SpiedFunction<typeof console.clear>
let consoleTableSpy: jest.SpiedFunction<typeof console.table>

beforeEach(() => {
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  consoleClearSpy = jest.spyOn(console, 'clear').mockImplementation(() => {})
  consoleTableSpy = jest.spyOn(console, 'table').mockImplementation(() => {})
})

afterEach(() => {
  consoleLogSpy.mockRestore()
  consoleClearSpy.mockRestore()
  consoleTableSpy.mockRestore()
})

// ─── SizeDetector ────────────────────────────────────────────────────────────
describe('SizeDetector', () => {
  let originalInnerW: number, originalOuterW: number, originalInnerH: number, originalOuterH: number

  beforeEach(() => {
    originalInnerW = window.innerWidth; originalOuterW = window.outerWidth
    originalInnerH = window.innerHeight; originalOuterH = window.outerHeight
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth',  { value: originalInnerW, configurable: true })
    Object.defineProperty(window, 'outerWidth',  { value: originalOuterW, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: originalInnerH, configurable: true })
    Object.defineProperty(window, 'outerHeight', { value: originalOuterH, configurable: true })
    eventManager.clearAllEvents()
  })

  const setWindowDims = (innerW: number, outerW: number, innerH: number, outerH: number): void => {
    Object.defineProperty(window, 'innerWidth',  { value: innerW, configurable: true })
    Object.defineProperty(window, 'outerWidth',  { value: outerW, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: innerH, configurable: true })
    Object.defineProperty(window, 'outerHeight', { value: outerH, configurable: true })
  }

  it('reports closed when window dimensions are roughly equal', () => {
    setWindowDims(1024, 1024, 768, 768)
    const cb = jest.fn()
    const d = new SizeDetector({ onDevToolsChange: cb })
    expect(d.isOpen()).toBe(false)
    expect(cb).not.toHaveBeenCalled()
    d.dispose()
  })

  it('reports open + fires callback when width diff exceeds threshold', () => {
    setWindowDims(800, 1200, 600, 600) // width diff = 400px (after zoom=1)
    const cb = jest.fn()
    const d = new SizeDetector({ onDevToolsChange: cb, widthThreshold: 200 })
    expect(d.isOpen()).toBe(true)
    expect(cb).toHaveBeenCalledWith(true)
    d.dispose()
  })

  it('isSupported returns false inside an iframe', () => {
    // Force window.self !== window.top.
    const originalTop = window.top
    Object.defineProperty(window, 'top', { value: {}, configurable: true })
    expect(SizeDetector.isSupported()).toBe(false)
    Object.defineProperty(window, 'top', { value: originalTop, configurable: true })
  })

  it('dispose removes the resize listener from eventManager', () => {
    const d = new SizeDetector()
    expect(eventManager.getEventCount()).toBeGreaterThan(0)
    d.dispose()
    expect(eventManager.getEventsByOwner('SizeDetector')).toEqual([])
  })
})

// ─── TimingDetector ─────────────────────────────────────────────────────────
describe('TimingDetector', () => {
  it('constructs and reports closed under normal timing', () => {
    const d = new TimingDetector()
    d.checkDevTools()
    expect(d.isOpen()).toBe(false)
    d.dispose()
  })

  it('dispose clears internal state', () => {
    const d = new TimingDetector()
    expect(() => d.dispose()).not.toThrow()
  })

  it('isSupported returns true when console + performance are available', () => {
    expect(TimingDetector.isSupported()).toBe(true)
  })
})

// ─── DateToStringDetector ───────────────────────────────────────────────────
describe('DateToStringDetector', () => {
  it('fires callback with isOpen=true when toString is called above threshold', () => {
    // checkDevTools resets the counter, calls console.log(date), and reads the
    // counter back. DevTools triggers toString twice during inspection — we
    // simulate that here by spying console.log to do the same.
    consoleLogSpy.mockImplementation((arg: unknown) => {
      if (arg && typeof (arg as { toString?: () => string }).toString === 'function') {
        ;(arg as { toString: () => string }).toString()
        ;(arg as { toString: () => string }).toString()
      }
    })

    const cb = jest.fn()
    const d = new DateToStringDetector({ onDevToolsChange: cb, threshold: 2 })

    d.checkDevTools()
    expect(d.isOpen()).toBe(true)
    expect(cb).toHaveBeenCalledWith(true)
    d.dispose()
  })

  it('reports closed when toString count stays below threshold', () => {
    const d = new DateToStringDetector({ threshold: 5 })
    d.checkDevTools()
    expect(d.isOpen()).toBe(false)
    d.dispose()
  })

  it('isSupported returns true on desktop', () => {
    expect(DateToStringDetector.isSupported()).toBe(true)
  })
})

// ─── FuncToStringDetector ───────────────────────────────────────────────────
describe('FuncToStringDetector', () => {
  it('fires callback with isOpen=true when toString is called above threshold', () => {
    consoleLogSpy.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        ;(arg as { toString: () => string }).toString()
        ;(arg as { toString: () => string }).toString()
      }
    })

    const cb = jest.fn()
    const d = new FuncToStringDetector({ onDevToolsChange: cb, threshold: 2 })

    d.checkDevTools()
    expect(d.isOpen()).toBe(true)
    expect(cb).toHaveBeenCalledWith(true)
    d.dispose()
  })

  it('reports closed when toString stays below threshold', () => {
    const d = new FuncToStringDetector({ threshold: 5 })
    d.checkDevTools()
    expect(d.isOpen()).toBe(false)
    d.dispose()
  })

  it('isSupported returns true on desktop', () => {
    expect(FuncToStringDetector.isSupported()).toBe(true)
  })
})

// ─── RegToStringDetector ────────────────────────────────────────────────────
describe('RegToStringDetector', () => {
  it('constructs without throwing on a non-Firefox/QQ UA (the default jsdom UA)', () => {
    const d = new RegToStringDetector()
    expect(() => d.checkDevTools()).not.toThrow()
    d.dispose()
  })

  it('dispose nulls the internal regex', () => {
    const d = new RegToStringDetector()
    d.dispose()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((d as any).reg).toBeNull()
  })

  it('isSupported returns false for non-Firefox/non-QQ browsers', () => {
    // Default jsdom UA is not Firefox/QQ.
    expect(RegToStringDetector.isSupported()).toBe(false)
  })
})

// ─── DefineGetterDetector ───────────────────────────────────────────────────
describe('DefineGetterDetector', () => {
  it('fires callback with isOpen=true when the getter is accessed multiple times in quick succession', () => {
    const cb = jest.fn()
    const d = new DefineGetterDetector({ onDevToolsChange: cb })

    // Access the getter twice rapidly — simulates DevTools inspecting.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const div: HTMLElement = (d as any).div
    void div.id
    void div.id

    expect(d.isOpen()).toBe(true)
    expect(cb).toHaveBeenCalledWith(true)
    d.dispose()
  })

  it('checkDevTools does not throw and respects isChecking guard', () => {
    const d = new DefineGetterDetector()
    expect(() => d.checkDevTools()).not.toThrow()
    // Second invocation while still "checking" should bail early.
    expect(() => d.checkDevTools()).not.toThrow()
    d.dispose()
  })

  it('isSupported returns true in jsdom (defineProperty works)', () => {
    expect(DefineGetterDetector.isSupported()).toBe(true)
  })
})

// ─── DebugLibDetector ───────────────────────────────────────────────────────
describe('DebugLibDetector', () => {
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).eruda
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__FAKE_LIB__
    intervalManager.dispose()
  })

  it('detects a known debug library when its global is present', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).eruda = { version: '1.0' }

    const cb = jest.fn()
    const d = new DebugLibDetector({ onDevToolsChange: cb })
    d.checkDevTools()
    expect(d.isOpen()).toBe(true)
    expect(cb).toHaveBeenCalledWith(true)
    d.dispose()
  })

  it('detects user-supplied additional libraries', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__FAKE_LIB__ = true
    const d = new DebugLibDetector({
      additionalLibraries: [{ name: 'FakeLib', globalVar: '__FAKE_LIB__' }],
    })
    d.checkDevTools()
    expect(d.isOpen()).toBe(true)
    d.dispose()
  })

  it('reports closed when no debug libraries are present', () => {
    const d = new DebugLibDetector()
    d.checkDevTools()
    expect(d.isOpen()).toBe(false)
    d.dispose()
  })

  it('startDetection registers an interval task; stopDetection unregisters it', () => {
    const d = new DebugLibDetector({ checkInterval: 1000 })
    d.startDetection()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((d as any).taskId).toBeTruthy()
    d.stopDetection()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((d as any).taskId).toBeNull()
    d.dispose()
  })

  it('isAnyDebugLibPresent static returns true when a debug global is set', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).eruda = {}
    expect(DebugLibDetector.isAnyDebugLibPresent()).toBe(true)
  })

  it('isSupported returns true in jsdom', () => {
    expect(DebugLibDetector.isSupported()).toBe(true)
  })
})

// ─── DebuggerDetector ───────────────────────────────────────────────────────
describe('DebuggerDetector', () => {
  // jsdom has limited Web Worker support — these tests cover the constructor,
  // dispose, isOpen contract, and isSupported. End-to-end heartbeat behaviour
  // is exercised through the manager-level integration tests.
  it('constructs without throwing', () => {
    expect(() => new DebuggerDetector()).not.toThrow()
  })

  it('dispose is idempotent and safe', () => {
    const d = new DebuggerDetector()
    d.dispose()
    expect(() => d.dispose()).not.toThrow()
  })

  it('isOpen starts false', () => {
    const d = new DebuggerDetector()
    expect(d.isOpen()).toBe(false)
    d.dispose()
  })

  it('checkDevTools is a no-op before the worker is initialised', () => {
    const d = new DebuggerDetector()
    expect(() => d.checkDevTools()).not.toThrow()
    expect(d.isOpen()).toBe(false)
    d.dispose()
  })

  it('isSupported reflects the environment correctly', () => {
    // jsdom does NOT provide Worker by default → isSupported returns false.
    // If Worker becomes available in a future jsdom, this assertion still
    // tracks the actual capability gate.
    const expected = typeof Worker !== 'undefined'
    expect(DebuggerDetector.isSupported()).toBe(expected)
  })
})
