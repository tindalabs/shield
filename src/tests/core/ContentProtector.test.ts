import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals"
import { ContentProtector } from "../../core/ContentProtector"
import type { ProtectionStrategy } from "../../types"

// Create a more complete mock for DOM APIs
const createMockDocument = (): unknown => {
  const mockStyleElement: { setAttribute: jest.Mock; textContent: string; parentNode: { removeChild: jest.Mock } } = {
    setAttribute: jest.fn(),
    textContent: "",
    parentNode: {
      removeChild: jest.fn(),
    },
  }

  const mockHead = {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    querySelectorAll: jest.fn().mockReturnValue([]),
  }

  const mockBody = {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    style: {},
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn(),
    },
  }

  const mockDocument = {
    body: mockBody,
    head: mockHead,
    createElement: jest.fn().mockImplementation((tagName) => {
      if (tagName === "style") {
        return mockStyleElement
      }
      return {
        id: "",
        className: "",
        style: {},
        textContent: "",
        setAttribute: jest.fn(),
        appendChild: jest.fn(),
        parentNode: null,
      }
    }),
    getElementById: jest.fn().mockImplementation((id) => {
      if (id === "security-overlay" || id === "security-event-blocker") {
        return {
          parentNode: {
            removeChild: jest.fn(),
          },
          style: {},
        }
      }
      return null
    }),
    querySelector: jest.fn().mockReturnValue(null),
    querySelectorAll: jest.fn().mockReturnValue([]),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    documentElement: {
      style: {},
    },
    visibilityState: "visible",
    fullscreenElement: null,
  }

  return mockDocument
}

// Mock window object
const createMockWindow = (): unknown => {
  return {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    setInterval: jest.fn().mockReturnValue(123),
    clearInterval: jest.fn(),
    setTimeout: jest.fn().mockReturnValue(456),
    clearTimeout: jest.fn(),
    getSelection: jest.fn().mockReturnValue({
      removeAllRanges: jest.fn(),
    }),
    stop: jest.fn(),
    print: jest.fn(),
    matchMedia: jest.fn().mockReturnValue({
      addListener: jest.fn(),
      removeListener: jest.fn(),
      matches: false,
    }),
    getComputedStyle: jest.fn().mockReturnValue({
      position: "static",
    }),
    innerWidth: 1024,
    innerHeight: 768,
    outerWidth: 1024,
    outerHeight: 768,
    location: {
      hostname: "example.com",
      reload: jest.fn(),
    },
    parent: {
      location: {
        hostname: "example.com",
      },
    },
    self: {},
    top: {},
  }
}

// Mock navigator
const createMockNavigator = (): {userAgent: string; platform: string} => {
  return {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    platform: "Win32",
  }
}

// Apply mocks to global object
Object.defineProperty(global, "document", {
  value: createMockDocument(),
  writable: true,
})

Object.defineProperty(global, "window", {
  value: createMockWindow(),
  writable: true,
})

Object.defineProperty(global, "navigator", {
  value: createMockNavigator(),
  writable: true,
})

// Mock self and top for iframe detection
global.self = global.window
global.top = global.window

// Mock performance.now() for DevTools detection
global.performance = {
  now: jest.fn().mockReturnValue(0),
} as unknown as Performance

// Mock console methods
const originalConsole = { ...console }
beforeEach((): void => {
  console.log = jest.fn()
  console.warn = jest.fn()
  console.error = jest.fn()
})

afterEach((): void => {
  console.log = originalConsole.log
  console.warn = originalConsole.warn
  console.error = originalConsole.error
})

// Mock the interval manager
jest.mock("../../utils/intervalManager", () => ({
  intervalManager: {
    registerTask: jest.fn().mockReturnValue("task-id-123"),
    unregisterTask: jest.fn(),
    dispose: jest.fn(),
    setDebugMode: jest.fn(),
  },
}))

// Mock the event manager
jest.mock("../../utils/eventManager", () => ({
  eventManager: {
    addEventListener: jest.fn().mockReturnValue("event-id-123"),
    removeEventListener: jest.fn(),
    removeEventsByOwner: jest.fn(),
    removeAllEventsForTarget: jest.fn(),
    removeEventsBySelector: jest.fn(),
    setDebugMode: jest.fn(),
  },
}))

describe("ContentProtector", () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Reset document and window mocks
    Object.defineProperty(global, "document", {
      value: createMockDocument(),
      writable: true,
    })

    Object.defineProperty(global, "window", {
      value: createMockWindow(),
      writable: true,
    })

    // Reset self and top for iframe detection
    global.self = global.window
    global.top = global.window
  })

  it("should initialize with default options", () => {
    const protector = new ContentProtector()
    expect(protector.isProtected()).toBe(false)

    // Check that default strategies are initialized
    expect(protector.hasStrategy("keyboard")).toBe(true)
    expect(protector.hasStrategy("contextMenu")).toBe(true)
    expect(protector.hasStrategy("print")).toBe(true)
    expect(protector.hasStrategy("selection")).toBe(true)

    // These should be false by default
    expect(protector.hasStrategy("watermark")).toBe(false)
    expect(protector.hasStrategy("devTools")).toBe(false)
    expect(protector.hasStrategy("extension")).toBe(false)
    expect(protector.hasStrategy("iFrame")).toBe(false)
  })

  it("should initialize with custom options", () => {
    const protector = new ContentProtector({
      preventKeyboardShortcuts: false,
      preventContextMenu: false,
      preventPrinting: true,
      preventSelection: true,
      enableWatermark: true,
      watermarkOptions: {
        text: "CONFIDENTIAL",
        opacity: 0.2,
      },
      preventDevTools: true,
      preventExtensions: true,
      preventEmbedding: true,
      debugMode: true,
    })

    // Check that strategies match the options
    expect(protector.hasStrategy("keyboard")).toBe(false)
    expect(protector.hasStrategy("contextMenu")).toBe(false)
    expect(protector.hasStrategy("print")).toBe(true)
    expect(protector.hasStrategy("selection")).toBe(true)
    expect(protector.hasStrategy("watermark")).toBe(true)
    expect(protector.hasStrategy("devTools")).toBe(true)
    expect(protector.hasStrategy("extension")).toBe(true)
    expect(protector.hasStrategy("iFrame")).toBe(true)

    // Debug mode should log initialization
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("ContentProtector: Initialized with options"),
      expect.any(Object),
    )
  })

  it("should apply protection when protect() is called", () => {
    const protector = new ContentProtector()
    protector.protect()

    expect(protector.isProtected()).toBe(true)

    // Get a strategy and check if it's applied
    const keyboardStrategy = protector.getStrategy("keyboard")
    expect(keyboardStrategy).toBeDefined()
    expect(keyboardStrategy?.isApplied()).toBe(true)
  })

  it("should not apply protection twice", () => {
    const protector = new ContentProtector({ debugMode: true })
    protector.protect()

    // Clear the console logs from the first protect call
    ;(console.log as jest.Mock).mockClear()

    // Call protect again
    protector.protect()

    // Should log that it's already protected
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("ContentProtector: Already protected, skipping"))
  })

  it("should remove protection when unprotect() is called", () => {
    const protector = new ContentProtector()
    protector.protect()
    protector.unprotect()

    expect(protector.isProtected()).toBe(false)

    // Strategies should be cleared
    expect(protector.getStrategy("keyboard")).toBeUndefined()
  })

  it("should not attempt to unprotect if not protected", () => {
    const protector = new ContentProtector({ debugMode: true })

    // Clear any initialization logs
    ;(console.log as jest.Mock).mockClear()

    protector.unprotect()

    // Should log that it's not protected
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("ContentProtector: Not protected, skipping"))
  })

  it("should update options correctly", () => {
    const protector = new ContentProtector({
      preventKeyboardShortcuts: true,
      debugMode: true,
    })
    protector.protect()

    // Clear logs from initialization and protect
    ;(console.log as jest.Mock).mockClear()

    // Update options to disable keyboard protection
    protector.updateOptions({ preventKeyboardShortcuts: false })

    // Should log the update
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("ContentProtector: Updating options"),
      expect.any(Object),
    )

    // Keyboard strategy should no longer exist
    expect(protector.hasStrategy("keyboard")).toBe(false)

    // Protection should still be active
    expect(protector.isProtected()).toBe(true)
  })

  it("should handle errors when applying strategies", () => {
    // Create a protector with a strategy that will throw an error
    const protector = new ContentProtector({
      preventKeyboardShortcuts: true,
      debugMode: true,
    })

    // Create a properly typed mock strategy
    const mockStrategy: ProtectionStrategy = {
      apply: jest.fn().mockImplementation(() => {
        throw new Error("Test error")
      }),
      remove: jest.fn(),
      isApplied: () => false,
      updateOptions: jest.fn(),
      STRATEGY_NAME: "keyboard",
      isDebugEnabled: () => true,
      setDebugMode: jest.fn(),
    }

    // Use a type-safe approach to replace the strategy
    const strategies = new Map<string, ProtectionStrategy>()
    strategies.set("keyboard", mockStrategy)
    Object.defineProperty(protector, "strategies", { value: strategies })

    // Apply protection
    protector.protect()

    // Should log the error but continue
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('ContentProtector: Error applying strategy "keyboard":'),
      expect.any(Error),
    )

    // Protection should still be active
    expect(protector.isProtected()).toBe(true)
  })

  it("should handle errors when removing strategies", () => {
    // Create a protector with a strategy that will throw an error on removal
    const protector = new ContentProtector({
      preventKeyboardShortcuts: true,
      debugMode: true,
    })

    // Create a properly typed mock strategy
    const mockStrategy: ProtectionStrategy = {
      apply: jest.fn(),
      remove: jest.fn().mockImplementation(() => {
        throw new Error("Test error")
      }),
      isApplied: ()=> true,
      updateOptions: jest.fn(),
      STRATEGY_NAME: "keyboard",
      isDebugEnabled: () => false,
      setDebugMode: jest.fn(),
    }

    // Use a type-safe approach to replace the strategy
    const strategies = new Map<string, ProtectionStrategy>()
    strategies.set("keyboard", mockStrategy)
    Object.defineProperty(protector, "strategies", { value: strategies })

    // Apply protection
    protector.protect()

    // Clear logs from initialization and protect
    ;(console.error as jest.Mock).mockClear()

    // Remove protection
    protector.unprotect()

    // Should log the error but continue
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('ContentProtector: Error removing strategy "keyboard":'),
      expect.any(Error),
    )

    // Protection should be deactivated
    expect(protector.isProtected()).toBe(false)
  })

  it("should have enable watermark strategy", () => {
    const protector = new ContentProtector({
      enableWatermark: true,
      watermarkOptions: {
        text: "CONFIDENTIAL",
      },
    })

    // Check that watermark strategy exists
    expect(protector.hasStrategy("watermark")).toBe(true)
    expect(protector.getStrategy("watermark")).toBeDefined()

    // Apply protection
    protector.protect()
    expect(protector.isProtected()).toBe(true)

    // Cleanup
    protector.dispose()
  })

  it("should dispose all resources", () => {
    const protector = new ContentProtector({ debugMode: true })
    protector.protect()

    // Clear logs from initialization and protect
    ;(console.log as jest.Mock).mockClear()

    // Dispose
    protector.dispose()

    // Should call unprotect
    expect(protector.isProtected()).toBe(false)

    // Should log disposal
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("ContentProtector: Disposed all resources"))
  })

  it("should initialize with custom handlers", () => {
    const mockHandlers = {
      onKeyboardShortcutBlocked: jest.fn(),
      onContextMenuAttempt: jest.fn(),
      onPrintAttempt: jest.fn(),
      onSelectionAttempt: jest.fn(),
      onDevToolsOpen: jest.fn(),
      onScreenshotAttempt: jest.fn(),
      onExtensionDetected: jest.fn(),
      onFrameEmbeddingDetected: jest.fn(),
    }

    const protector = new ContentProtector({
      preventDevTools: true,
      preventScreenshots: true,
      preventExtensions: true,
      preventEmbedding: true,
      customHandlers: mockHandlers,
    })

    // Check that strategies were initialized with custom handlers
    expect(protector.hasStrategy("keyboard")).toBe(true)
    expect(protector.hasStrategy("contextMenu")).toBe(true)
    expect(protector.hasStrategy("print")).toBe(true)
    expect(protector.hasStrategy("selection")).toBe(true)
    expect(protector.hasStrategy("devTools")).toBe(true)
    expect(protector.hasStrategy("screenshot")).toBe(true)
    expect(protector.hasStrategy("extension")).toBe(true)
    expect(protector.hasStrategy("iFrame")).toBe(true)
  })

  it("should initialize with custom target element", () => {
    const mockElement = document.createElement("div")

    const protector = new ContentProtector({
      targetElement: mockElement,
    })

    // Apply protection
    protector.protect()

    // Check that protection is applied
    expect(protector.isProtected()).toBe(true)
  })
})