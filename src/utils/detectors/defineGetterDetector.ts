import { isBrowser } from "../environment"
import { AbstractDevToolsDetector, DetectorErrorType } from "./AbstractDevToolsDetector"
import { DevToolsDetectorOptions } from "./detectorInterface"

/**
 * Options for the DefineGetterDetector
 */
export interface DefineGetterDetectorOptions extends DevToolsDetectorOptions {
  /**
   * Check interval in milliseconds
   */
  checkInterval?: number
}

/**
 * Detector that uses property getter access to detect DevTools
 * This works by creating an element with a getter that triggers when DevTools inspects it
 */
export class DefineGetterDetector extends AbstractDevToolsDetector {
  private checkInterval: number
  private div: HTMLElement | null = null
  private detectionCount = 0
  private lastDetectionTime = 0

  /**
   * Create a new DefineGetterDetector
   * @param options Configuration options
   */
  constructor(options: DefineGetterDetectorOptions = {}) {
    super("DefineGetterDetector", options)
    this.checkInterval = options.checkInterval || 1000

    // Initialize the div element with custom getter
    this.initDetectionElement()

    this.logger.log("Initialized with interval:", this.checkInterval)
  }

  /**
   * Initialize the div element with custom getter for detection
   */
  private initDetectionElement(): void {
    this.safeExecute("initDetectionElement", DetectorErrorType.INITIALIZATION_ERROR, () => {
      if (!isBrowser()) return

      this.div = document.createElement("div")

      // Define a getter for the 'id' property that will be triggered when DevTools inspects the element
      // Using both __defineGetter__ (for older browsers) and Object.defineProperty
      try {
        // This is a non-standard method but works in some browsers
        ;(
          this.div as unknown as { __defineGetter__: (property: string, callback: () => string) => string }
        ).__defineGetter__("id", () => {
          this.handleGetterAccess()
          return ""
        })
      } catch (e) {
        // Ignore errors for browsers that don't support __defineGetter__
        this.logger.log("__defineGetter__ not supported, using Object.defineProperty", e)
      }

      // Standard way using Object.defineProperty
      Object.defineProperty(this.div, "id", {
        get: () => {
          this.handleGetterAccess()
          return ""
        },
        configurable: true,
      })

      this.logger.log("Detection element initialized")
    })
  }

  /**
   * Handle getter access - called when the 'id' property is accessed
   */
  private handleGetterAccess(): void {
    this.safeExecute("handleGetterAccess", DetectorErrorType.DETECTION_ERROR, () => {
      const now = Date.now()
      this.detectionCount++

      // Avoid triggering too many times in a short period
      if (now - this.lastDetectionTime < 100) {
        this.detectionCount++
      } else {
        this.detectionCount = 1
      }

      this.lastDetectionTime = now

      // If the getter is accessed multiple times in a short period, DevTools is likely open
      if (this.detectionCount >= 2 && !this.isDevToolsOpen) {
        this.updateDevToolsState(true)
        this.logger.log("DevTools opened (getter accessed multiple times)")
      }
    })
  }

  /**
   * Check if DevTools is open by logging the div element
   * When the element is logged, DevTools will access its properties including 'id'
   */
  public checkDevTools(): void {
    if (this.isChecking || !isBrowser() || !this.div) return
    this.isChecking = true

    this.safeExecute("checkDevTools", DetectorErrorType.DETECTION_ERROR, () => {
      // Log the div element - this will trigger property access in DevTools
      console.log(this.div)

      // Clear console to avoid clutter
      if (!this.debugMode) {
        console.clear()
      }

      // If no detection occurred within a short time after logging,
      // DevTools is likely closed
      setTimeout(() => {
        this.safeExecute("checkDevToolsTimeout", DetectorErrorType.DETECTION_ERROR, () => {
          const now = Date.now()
          if (now - this.lastDetectionTime > 500 && this.isDevToolsOpen) {
            this.updateDevToolsState(false)
            this.logger.log("DevTools closed (no recent getter access)")
          }
          this.isChecking = false
        })
      }, 100)
    })

    // Ensure isChecking is reset if an error occurs
    if (this.isChecking) {
      setTimeout(() => {
        this.isChecking = false
      }, 200)
    }
  }

  /**
   * Clean up resources
   */
  public override dispose(): void {
    this.safeExecute("dispose", DetectorErrorType.DISPOSAL_ERROR, () => {
      this.div = null
      this.logger.log("Disposed")
    })

    super.dispose()
  }

  /**
   * Check if this detector is supported in the current browser
   * @returns True if supported
   */
  public static isSupported(): boolean {
    if (!isBrowser()) return false

    try {
      // Test if we can define getters on an element
      const testDiv = document.createElement("div")
      let testValue = false

      Object.defineProperty(testDiv, "testProp", {
        get: () => {
          testValue = true
          return ""
        },
        configurable: true,
      })

      // Access the property to see if the getter works
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const value = (testDiv as unknown as { testProp: string }).testProp

      return testValue
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return false
    }
  }
}