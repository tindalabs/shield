/**
 * Frame-detection helpers — module-indirected access to `window.top` /
 * `window.parent`.
 *
 * Why this module exists: jsdom 30 defines `window.top` as a non-configurable
 * own property, so `Object.defineProperty(window, 'top', ...)` throws in tests.
 * Indirecting through this module gives tests a clean mock surface via
 * `jest.mock('.../windowFrame', ...)` instead of fighting jsdom's lockdown.
 */

export const isEmbedded = (): boolean => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

export interface ParentOriginInfo {
  parentHostname: string | null
  /** True when parent.location access threw — i.e. parent is cross-origin. */
  crossOrigin: boolean
}

export const readParentOrigin = (): ParentOriginInfo => {
  try {
    return { parentHostname: window.parent.location.hostname, crossOrigin: false }
  } catch {
    return { parentHostname: null, crossOrigin: true }
  }
}
