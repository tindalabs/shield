import { describe, it, expect, beforeEach } from '@jest/globals'
import { KeyboardShortcutManager, type OSType } from '../../utils/keyboardShortcutManager/keyboardShortcutManager'
import { ShortcutCategory } from '../../utils/keyboardShortcutManager/keyboardShortcuts'

// KeyboardShortcutManager is a singleton whose osType is captured at first
// construction from getOS(). The simplest way to exercise platform branches
// without re-mocking getOS per test is to mutate the private osType field
// directly — confined to test code, never used in src.
const setOsType = (mgr: KeyboardShortcutManager, os: OSType): void => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(mgr as any).osType = os
}

const keyEvent = (
  key: string,
  mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean; code: string }> = {},
): KeyboardEvent => new KeyboardEvent('keydown', {
  key,
  code: mods.code ?? '',
  ctrlKey: mods.ctrl ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
  metaKey: mods.meta ?? false,
})

describe('KeyboardShortcutManager', () => {
  let mgr: KeyboardShortcutManager

  beforeEach(() => {
    mgr = KeyboardShortcutManager.getInstance()
  })

  describe('singleton', () => {
    it('getInstance returns the same instance across calls', () => {
      expect(KeyboardShortcutManager.getInstance()).toBe(KeyboardShortcutManager.getInstance())
    })
  })

  describe('shortcut queries', () => {
    it('getAllShortcuts returns the full registry', () => {
      const all = mgr.getAllShortcuts()
      expect(all.length).toBeGreaterThan(20)
      expect(all.every((s) => typeof s.id === 'string')).toBe(true)
    })

    it('getShortcutsByCategory filters by a single category', () => {
      const devtools = mgr.getShortcutsByCategory(ShortcutCategory.DEVTOOLS)
      expect(devtools.length).toBeGreaterThan(0)
      expect(devtools.every((s) => s.category === ShortcutCategory.DEVTOOLS)).toBe(true)
    })

    it('getShortcutsByCategories filters by a category list', () => {
      const result = mgr.getShortcutsByCategories([ShortcutCategory.COPY, ShortcutCategory.PRINT])
      const cats = new Set(result.map((s) => s.category))
      expect(cats).toEqual(new Set([ShortcutCategory.COPY, ShortcutCategory.PRINT]))
    })
  })

  describe('matchesShortcut — Windows/Linux branch', () => {
    beforeEach(() => { setOsType(mgr, 'windows') })

    it('matches Ctrl+C against the copy shortcut', () => {
      const match = mgr.matchesShortcut(keyEvent('c', { ctrl: true }), [ShortcutCategory.COPY])
      expect(match?.id).toBe('copy')
    })

    it('does NOT match Ctrl+C when only the SAVE category is requested', () => {
      const match = mgr.matchesShortcut(keyEvent('c', { ctrl: true }), [ShortcutCategory.SAVE])
      expect(match).toBeNull()
    })

    it('rejects events where modifiers do not match the shortcut (Cmd+C on Windows ≠ Ctrl+C)', () => {
      const match = mgr.matchesShortcut(keyEvent('c', { meta: true }), [ShortcutCategory.COPY])
      expect(match).toBeNull()
    })

    it('matches a bare key (F12 → devtools-open) with no modifiers', () => {
      const match = mgr.matchesShortcut(keyEvent('F12'), [ShortcutCategory.DEVTOOLS])
      expect(match?.id).toBe('devtools-open')
    })

    it('matches PrintScreen via either event.key or event.code', () => {
      const byKey = mgr.matchesShortcut(keyEvent('PrintScreen'), [ShortcutCategory.SCREENSHOT])
      const byCode = mgr.matchesShortcut(
        keyEvent('whatever', { code: 'PrintScreen' }),
        [ShortcutCategory.SCREENSHOT],
      )
      expect(byKey).not.toBeNull()
      expect(byCode).not.toBeNull()
    })

    it('returns null for an event that matches no registered shortcut', () => {
      expect(mgr.matchesShortcut(keyEvent('z'))).toBeNull()
    })
  })

  describe('matchesShortcut — Mac branch (macKeys override)', () => {
    beforeEach(() => { setOsType(mgr, 'mac') })

    it('Cmd+C matches copy on mac', () => {
      const match = mgr.matchesShortcut(keyEvent('c', { meta: true }), [ShortcutCategory.COPY])
      expect(match?.id).toBe('copy')
    })

    it('Ctrl+C does NOT match copy on mac (the macKeys override flips to Meta)', () => {
      const match = mgr.matchesShortcut(keyEvent('c', { ctrl: true }), [ShortcutCategory.COPY])
      expect(match).toBeNull()
    })

    it('mac-only screenshot shortcut (Shift+Cmd+4) matches on mac', () => {
      const match = mgr.matchesShortcut(
        keyEvent('4', { shift: true, meta: true }),
        [ShortcutCategory.SCREENSHOT],
      )
      expect(match?.id).toBe('screenshot-mac-area')
    })

    it('a shortcut with empty keys[] AND no platform-specific override does not match', () => {
      setOsType(mgr, 'windows')
      // screenshot-mac-full has keys=[] on Windows — should never match.
      const match = mgr.matchesShortcut(
        keyEvent('3', { shift: true, meta: true }),
        [ShortcutCategory.SCREENSHOT],
      )
      // 'screenshot-mac-full' is unreachable on Windows; any non-null match must be a different shortcut.
      expect(match?.id).not.toBe('screenshot-mac-full')
    })
  })

  describe('matchesShortcut — Linux branch (linuxKeys override)', () => {
    beforeEach(() => { setOsType(mgr, 'linux') })

    it('Ctrl+PrintScreen matches the linux clipboard-screenshot shortcut', () => {
      const match = mgr.matchesShortcut(
        keyEvent('PrintScreen', { ctrl: true }),
        [ShortcutCategory.SCREENSHOT],
      )
      expect(match?.id).toBe('screenshot-clipboard-linux')
    })
  })

  describe('getShortcutDescription', () => {
    it('formats Mac modifiers using symbols (⌘, ⇧) joined by " + "', () => {
      setOsType(mgr, 'mac')
      const copy = mgr.getAllShortcuts().find((s) => s.id === 'copy')!
      const desc = mgr.getShortcutDescription(copy)
      expect(desc).toContain('⌘')
      expect(desc).toContain(' + ')
    })

    it('formats Windows modifiers as plain text joined by "+"', () => {
      setOsType(mgr, 'windows')
      const copy = mgr.getAllShortcuts().find((s) => s.id === 'copy')!
      const desc = mgr.getShortcutDescription(copy)
      expect(desc).toBe('Ctrl+c')
    })

    it('falls back to default keys[] when no platform-specific override exists', () => {
      setOsType(mgr, 'linux')
      const altF = mgr.getAllShortcuts().find((s) => s.id === 'fullscreen-alt-f')!
      // fullscreen-alt-f has no linuxKeys, so it falls back to keys=['Alt', 'f'].
      expect(mgr.getShortcutDescription(altF)).toBe('Alt+f')
    })
  })
})
