/**
 * Vendor-prefixed browser APIs type definitions
 * 
 * These extend the standard DOM types with vendor-prefixed properties
 * that are commonly used but not included in TypeScript's lib.dom.d.ts
 */

/**
 * Extended Document interface with vendor-prefixed fullscreen APIs
 */
interface Document {
    /**
     * Webkit-prefixed fullscreen element (Safari, older Chrome)
     */
    readonly webkitFullscreenElement?: Element | null

    /**
     * Mozilla-prefixed fullscreen element (older Firefox)
     */
    readonly mozFullScreenElement?: Element | null

    /**
     * Microsoft-prefixed fullscreen element (older IE/Edge)
     */
    readonly msFullscreenElement?: Element | null

    /**
     * Webkit-prefixed exit fullscreen method
     */
    webkitExitFullscreen?: () => void

    /**
     * Mozilla-prefixed cancel fullscreen method
     */
    mozCancelFullScreen?: () => void

    /**
     * Microsoft-prefixed exit fullscreen method
     */
    msExitFullscreen?: () => void
}

/**
 * Extended HTMLElement interface with vendor-prefixed fullscreen APIs
 */
interface HTMLElement {
    /**
     * Webkit-prefixed request fullscreen method
     */
    webkitRequestFullscreen?: () => Promise<void>

    /**
     * Webkit-prefixed request fullscreen method (older Safari)
     */
    webkitRequestFullScreen?: () => Promise<void>

    /**
     * Mozilla-prefixed request fullscreen method
     */
    mozRequestFullScreen?: () => Promise<void>

    /**
     * Microsoft-prefixed request fullscreen method
     */
    msRequestFullscreen?: () => Promise<void>
}

/**
 * Extended CSSStyleDeclaration to allow indexing with string keys
 * Useful for dynamically setting vendor-prefixed CSS properties
 */
interface CSSStyleDeclaration {
    [key: string]: string | number | CSSRule | ((property: string, value: string | null, priority?: string) => void) | ((index: number) => string) | (() => string) | (() => CSSStyleDeclaration) | null
}
