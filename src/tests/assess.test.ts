import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'

// ── Mocks ──────────────────────────────────────────────────────────────────────
// assess.ts pulls in DevToolsDetectorManager (real timing/debugger checks fire
// async, would flake jsdom). We replace it with a controllable stub whose
// behaviour each test selects via a top-level variable. Same path the SUT uses.
let mockDevToolsOpen = false

type DTMOpts = { onDevToolsChange?: (open: boolean) => void }
jest.unstable_mockModule('../utils/detectors/devToolsDetectorManager.js', () => ({
  DevToolsDetectorManager: jest.fn((opts: DTMOpts) => ({
    checkDevTools: jest.fn(() => {
      if (mockDevToolsOpen) opts.onDevToolsChange?.(true)
    }),
    dispose: jest.fn(),
  })),
}))

// isBrowser is mocked so we can exercise the SSR short-circuit deterministically
// without tearing down jsdom globals.
let mockIsBrowser = true
jest.unstable_mockModule('../utils/environment.js', () => ({
  isBrowser: jest.fn(() => mockIsBrowser),
}))

const { assess } = await import('../assess')

// ── Helpers ────────────────────────────────────────────────────────────────────
// jsdom's navigator props are non-writable; defineProperty with configurable=true
// lets us reset them between tests without leaking state across files.
const setNavProp = (key: string, value: unknown): void => {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true })
}

const originalUA = navigator.userAgent

beforeEach(() => {
  mockDevToolsOpen = false
  mockIsBrowser = true
  setNavProp('webdriver', false)
  setNavProp('userAgent', originalUA)
})

afterEach(() => {
  setNavProp('userAgent', originalUA)
})

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('assess()', () => {
  describe('non-browser environment', () => {
    it('returns a clean baseline assessment without invoking detectors', async () => {
      mockIsBrowser = false
      const result = await assess()

      expect(result.signals).toEqual({
        'shield.devtools.open': false,
        'shield.automation.webdriver': false,
        'shield.automation.headless': false,
        'shield.frame.embedded': false,
        'shield.extension.detected': false,
        'shield.extension.names': '',
      })
      expect(result.risk).toEqual({ score: 0, flags: [] })
      expect(result.spanAttributes).toEqual({})
    })
  })

  describe('clean session', () => {
    it('reports no flags and an empty spanAttributes when nothing is detected', async () => {
      const result = await assess({ devtools: false, extensions: false })

      expect(result.signals['shield.automation.webdriver']).toBe(false)
      expect(result.signals['shield.devtools.open']).toBe(false)
      expect(result.risk.flags).not.toContain('webdriver')
      expect(result.risk.flags).not.toContain('devtools_open')
      // No truthy boolean signals → no entries in spanAttributes.
      expect(result.spanAttributes).not.toHaveProperty('shield.devtools.open')
    })
  })

  describe('webdriver signal', () => {
    it('flips automation.webdriver and contributes 0.9 to the risk score', async () => {
      setNavProp('webdriver', true)
      const result = await assess({ devtools: false, extensions: false })

      expect(result.signals['shield.automation.webdriver']).toBe(true)
      expect(result.risk.flags).toContain('webdriver')
      // 0.9 from webdriver, possibly +frame_embedded (0.3) in jsdom — but
      // clamp guarantees ≤1 and ≥0.9.
      expect(result.risk.score).toBeGreaterThanOrEqual(0.9)
      expect(result.risk.score).toBeLessThanOrEqual(1)
      expect(result.spanAttributes['shield.automation.webdriver']).toBe(true)
    })
  })

  describe('headless heuristic', () => {
    it('matches on HeadlessChrome user-agent strings', async () => {
      setNavProp(
        'userAgent',
        'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36',
      )
      const result = await assess({ devtools: false, extensions: false })

      expect(result.signals['shield.automation.headless']).toBe(true)
      expect(result.risk.flags).toContain('headless')
    })
  })

  describe('devtools detection', () => {
    it('reports devtools open when the detector callback fires', async () => {
      mockDevToolsOpen = true
      const result = await assess({ extensions: false, timeout: 200 })

      expect(result.signals['shield.devtools.open']).toBe(true)
      expect(result.risk.flags).toContain('devtools_open')
      expect(result.spanAttributes['shield.devtools.open']).toBe(true)
    }, 5000)

    it('resolves false within the timeout budget when nothing is detected', async () => {
      mockDevToolsOpen = false
      const start = Date.now()
      const result = await assess({ extensions: false, timeout: 200 })
      const elapsed = Date.now() - start

      expect(result.signals['shield.devtools.open']).toBe(false)
      // Should not exceed the budget by more than a generous jitter.
      expect(elapsed).toBeLessThan(2000)
    }, 5000)
  })

  describe('extension detection', () => {
    it('flags an extension via JS signature and emits its name', async () => {
      // Plant a fake global the SUT will walk to.
      ;(window as unknown as Record<string, unknown>).__FAKE_EXT__ = { v: 1 }

      try {
        const result = await assess({
          devtools: false,
          extensionConfig: [{
            name: 'FakeExt',
            description: 'planted for the test',
            risk: 'low',
            detectionMethods: { jsSignatures: ['__FAKE_EXT__'] },
          }],
        })

        expect(result.signals['shield.extension.detected']).toBe(true)
        expect(result.signals['shield.extension.names']).toBe('FakeExt')
        expect(result.risk.flags).toContain('extension')
        expect(result.spanAttributes['shield.extension.names']).toBe('FakeExt')
      } finally {
        delete (window as unknown as Record<string, unknown>).__FAKE_EXT__
      }
    })

    it('flags an extension via DOM selector', async () => {
      const marker = document.createElement('div')
      marker.className = 'planted-ext-marker'
      document.body.appendChild(marker)

      try {
        const result = await assess({
          devtools: false,
          extensionConfig: [{
            name: 'DomExt',
            description: 'planted DOM marker',
            risk: 'low',
            detectionMethods: { domSelectors: ['.planted-ext-marker'] },
          }],
        })

        expect(result.signals['shield.extension.detected']).toBe(true)
        expect(result.signals['shield.extension.names']).toBe('DomExt')
      } finally {
        marker.remove()
      }
    })

    it('reports nothing detected when no extensions match', async () => {
      const result = await assess({
        devtools: false,
        extensionConfig: [{
          name: 'NeverThere',
          description: '',
          risk: 'low',
          detectionMethods: { jsSignatures: ['__definitely_not_present_ABCXYZ__'] },
        }],
      })

      expect(result.signals['shield.extension.detected']).toBe(false)
      expect(result.signals['shield.extension.names']).toBe('')
      expect(result.risk.flags).not.toContain('extension')
    })

    it('survives invalid DOM selectors without throwing', async () => {
      const result = await assess({
        devtools: false,
        extensionConfig: [{
          name: 'Bad',
          description: '',
          risk: 'low',
          detectionMethods: { domSelectors: ['>>> not a selector <<<'] },
        }],
      })

      expect(result.signals['shield.extension.detected']).toBe(false)
    })
  })

  describe('risk score', () => {
    it('clamps the score to a maximum of 1 even when many flags fire', async () => {
      setNavProp('webdriver', true) // 0.9
      setNavProp(
        'userAgent',
        'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36',
      ) // headless 0.7
      mockDevToolsOpen = true // 0.4
      ;(window as unknown as Record<string, unknown>).__EXT__ = true // 0.2

      try {
        const result = await assess({
          timeout: 200,
          extensionConfig: [{
            name: 'Ext',
            description: '',
            risk: 'low',
            detectionMethods: { jsSignatures: ['__EXT__'] },
          }],
        })

        expect(result.risk.score).toBe(1)
        expect(result.risk.flags.length).toBeGreaterThanOrEqual(4)
      } finally {
        delete (window as unknown as Record<string, unknown>).__EXT__
      }
    }, 5000)

    it('rounds the score to three decimals', async () => {
      setNavProp('webdriver', true) // adds 0.9, possibly +0.3 frame_embedded → clamp or not
      const result = await assess({ devtools: false, extensions: false })
      // 3-decimal precision: the rounded value must equal itself when re-rounded.
      expect(Math.round(result.risk.score * 1000) / 1000).toBe(result.risk.score)
    })
  })

  describe('spanAttributes', () => {
    it('omits default-valued signals to keep spans lean', async () => {
      const result = await assess({ devtools: false, extensions: false })

      // No false booleans, no empty strings.
      for (const [k, v] of Object.entries(result.spanAttributes)) {
        expect(v).not.toBe(false)
        if (typeof v === 'string') expect(v).not.toBe('')
        expect(k).toBeTruthy()
      }
    })

    it('includes risk score and flags only when score > 0', async () => {
      const clean = await assess({ devtools: false, extensions: false })
      if (clean.risk.score === 0) {
        expect(clean.spanAttributes).not.toHaveProperty('shield.risk.score')
        expect(clean.spanAttributes).not.toHaveProperty('shield.risk.flags')
      }

      setNavProp('webdriver', true)
      const flagged = await assess({ devtools: false, extensions: false })
      expect(flagged.spanAttributes['shield.risk.score']).toBe(flagged.risk.score)
      expect(flagged.spanAttributes['shield.risk.flags']).toContain('webdriver')
    })
  })
})
