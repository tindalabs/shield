import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'
import {
  safeAddEventListener,
  safeRemoveEventListener,
  injectStyles,
  removeStyles,
  createElement,
} from '../../utils/dom'
import { isLandscape, getOrientationType, getOrientationAngle } from '../../utils/orientation'
import { LoggingDelegate } from '../../utils/logging/simple/LoggingDelegate'

// ─── dom.ts ───────────────────────────────────────────────────────────────
describe('dom utilities', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.querySelectorAll('style[data-test]').forEach((s) => s.remove())
  })

  describe('safeAddEventListener / safeRemoveEventListener', () => {
    it('returns true on success and the listener actually fires', () => {
      const handler = jest.fn()
      const result = safeAddEventListener(document, 'click', handler)
      expect(result).toBe(true)

      document.dispatchEvent(new Event('click'))
      expect(handler).toHaveBeenCalledTimes(1)

      const removed = safeRemoveEventListener(document, 'click', handler)
      expect(removed).toBe(true)

      document.dispatchEvent(new Event('click'))
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('returns false when addEventListener throws', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const fakeTarget = {
        addEventListener: () => { throw new Error('boom') },
      } as unknown as HTMLElement

      expect(safeAddEventListener(fakeTarget, 'click', () => {})).toBe(false)
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })

    it('returns false when removeEventListener throws', () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const fakeTarget = {
        removeEventListener: () => { throw new Error('boom') },
      } as unknown as HTMLElement

      expect(safeRemoveEventListener(fakeTarget, 'click', () => {})).toBe(false)
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })

  describe('injectStyles / removeStyles', () => {
    it('injects a <style> with the given css and id', () => {
      const el = injectStyles('body { background: red; }', 'test-style')
      expect(el).not.toBeNull()
      expect(document.getElementById('test-style')).toBe(el)
      expect(el?.textContent).toContain('background: red')
    })

    it('injects without an id when none is provided', () => {
      const el = injectStyles('p { margin: 0; }')
      expect(el).not.toBeNull()
      expect(el?.id).toBe('')
      el?.remove()
    })

    it('removeStyles drops the matching element and returns true', () => {
      injectStyles('div {}', 'will-go')
      expect(removeStyles('will-go')).toBe(true)
      expect(document.getElementById('will-go')).toBeNull()
    })

    it('removeStyles returns false when the id is not present', () => {
      expect(removeStyles('never-was')).toBe(false)
    })
  })

  describe('createElement', () => {
    it('creates an element with attributes and styles applied', () => {
      const el = createElement<HTMLDivElement>(
        'div',
        { id: 'made', 'data-x': '1' },
        { color: 'red', fontSize: '20px' },
      )
      expect(el.tagName).toBe('DIV')
      expect(el.getAttribute('id')).toBe('made')
      expect(el.getAttribute('data-x')).toBe('1')
      expect(el.style.color).toBe('red')
      expect(el.style.fontSize).toBe('20px')
    })

    it('works with empty attribute and style maps', () => {
      const el = createElement<HTMLSpanElement>('span')
      expect(el.tagName).toBe('SPAN')
      expect(el.getAttributeNames()).toEqual([])
    })
  })
})

// ─── orientation.ts ───────────────────────────────────────────────────────
describe('orientation utilities', () => {
  let originalInnerW: number, originalInnerH: number
  let originalOrientation: ScreenOrientation | undefined

  beforeEach(() => {
    originalInnerW = window.innerWidth
    originalInnerH = window.innerHeight
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalOrientation = (screen as any).orientation
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth',  { value: originalInnerW, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: originalInnerH, configurable: true })
    if (originalOrientation === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (screen as any).orientation
    } else {
      Object.defineProperty(screen, 'orientation', { value: originalOrientation, configurable: true })
    }
  })

  // jsdom does not implement Screen Orientation API, so the fallback branch is
  // what jsdom exercises by default. We poke `screen.orientation` to drive the
  // API branch.
  const setScreenOrientation = (orientation: { type: string; angle: number } | undefined): void => {
    if (orientation === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (screen as any).orientation
    } else {
      Object.defineProperty(screen, 'orientation', { value: orientation, configurable: true })
    }
  }

  describe('isLandscape', () => {
    it('falls back to window dimensions when Screen Orientation API is absent', () => {
      setScreenOrientation(undefined)
      Object.defineProperty(window, 'innerWidth',  { value: 1024, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: 768,  configurable: true })
      expect(isLandscape()).toBe(true)

      Object.defineProperty(window, 'innerWidth',  { value: 400, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
      expect(isLandscape()).toBe(false)
    })

    it('uses the Screen Orientation API type string when available', () => {
      setScreenOrientation({ type: 'landscape-primary', angle: 90 })
      expect(isLandscape()).toBe(true)

      setScreenOrientation({ type: 'portrait-primary', angle: 0 })
      expect(isLandscape()).toBe(false)
    })
  })

  describe('getOrientationType', () => {
    it('returns the API type when available', () => {
      setScreenOrientation({ type: 'landscape-secondary', angle: 270 })
      expect(getOrientationType()).toBe('landscape-secondary')
    })

    it('returns the inferred "landscape" or "portrait" when API is absent', () => {
      setScreenOrientation(undefined)
      Object.defineProperty(window, 'innerWidth',  { value: 1024, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: 768,  configurable: true })
      expect(getOrientationType()).toBe('landscape')

      Object.defineProperty(window, 'innerWidth',  { value: 400, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
      expect(getOrientationType()).toBe('portrait')
    })
  })

  describe('getOrientationAngle', () => {
    it('returns the API angle when available', () => {
      setScreenOrientation({ type: 'landscape-primary', angle: 90 })
      expect(getOrientationAngle()).toBe(90)
    })

    it('returns 0 when the API is absent', () => {
      setScreenOrientation(undefined)
      expect(getOrientationAngle()).toBe(0)
    })
  })
})

// ─── LoggingDelegate.ts ───────────────────────────────────────────────────
describe('LoggingDelegate', () => {
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

  it('log() is gated by debug mode and prefixes with the component name', () => {
    const d = new LoggingDelegate('C')
    d.log('hidden')
    expect(logSpy).not.toHaveBeenCalled()

    d.setDebugMode(true)
    expect(d.isDebugEnabled()).toBe(true)
    d.log('visible', 1)
    expect(logSpy).toHaveBeenCalledWith('C: visible', 1)
  })

  it('warn() always prints, error() always prints', () => {
    const d = new LoggingDelegate('C')
    d.warn('w')
    d.error('e', new Error('boom'))
    expect(warnSpy).toHaveBeenCalledWith('C: w')
    expect(errorSpy).toHaveBeenCalledWith('C: e', expect.any(Error))
  })

  it('isDebugEnabled tracks setDebugMode', () => {
    const d = new LoggingDelegate('C', true)
    expect(d.isDebugEnabled()).toBe(true)
    d.setDebugMode(false)
    expect(d.isDebugEnabled()).toBe(false)
  })
})
