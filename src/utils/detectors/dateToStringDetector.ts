import { isBrowser, getBrowser, isMobile } from "../environment"
import { AbstractDevToolsDetector, DetectorErrorType } from "./AbstractDevToolsDetector"
import { DevToolsDetectorOptions } from "./detectorInterface"

/**
 * Options for the DateToStringDetector
 */
export interface DateToStringDetectorOptions extends DevToolsDetectorOptions {
  /**
   * Threshold for detection (number of toString calls)
   */
  threshold?: number
}

/**
 * Utility class for detecting DevTools using Date.toString behavior
 * This approach works by detecting multiple calls to toString when an object is logged
 * and DevTools is open
 */
export class DateToStringDetector extends AbstractDevToolsDetector {
  private date: Date | null = null
  private count = 0
  private threshold: number

  /**
   * Create a new DateToStringDetector
   * @param options Configuration options
   */
  constructor(options: DateToStringDetectorOptions = {}) {
    super("DateToStringDetector", options)
    this.debugMode = !!options.debugMode
    this.onDevToolsChange = options.onDevToolsChange || ((): void => {})
    this.threshold = options.threshold || 2

    // Initialize the date object with custom toString
    this.initDateObject()

    this.logger.log("Initialized with threshold:", this.threshold)
  }

  /**
   * Initialize the date object with custom toString method
   */
  private initDateObject(): void {
    this.safeExecute("initDateObject", DetectorErrorType.INITIALIZATION_ERROR, () => {
      if (!isBrowser()) return

      this.date = new Date()

      // Override toString to count calls
      this.date.toString = (): string => {
        this.count++
        // Use a hidden property to avoid infinite recursion when logging
        const originalDate = this.date ? new Date(this.date.getTime()) : new Date()
        this.logger.log(`toString() called (${this.count} times)`, originalDate.toISOString())

        return ""
      }

      this.logger.log("Date object initialized")
    })
  }

  /**
   * Check if DevTools is open using Date.toString behavior
   */
  public checkDevTools(): void {
    if (this.isChecking || !isBrowser()) return
    this.isChecking = true

    this.safeExecute("checkDevTools", DetectorErrorType.DETECTION_ERROR, () => {
      // Reset counter
      this.count = 0

      // Log the date object - this will trigger toString
      console.log(this.date)

      // Clear console to avoid clutter
      if (!this.debugMode) {
        console.clear()
      }

      // If toString was called multiple times, DevTools is likely open
      const isOpen = this.count >= this.threshold

      // Update state and notify listeners if changed
      this.updateDevToolsState(isOpen)

      this.logger.log(`toString called ${this.count} times, threshold: ${this.threshold}`)
      this.isChecking = false
    })

    // Ensure isChecking is reset even if an error occurs
    if (this.isChecking) {
      this.isChecking = false
    }
  }

  /**
   * Clean up resources
   */
  public override dispose(): void {
    this.safeExecute("dispose", DetectorErrorType.DISPOSAL_ERROR, () => {
      this.date = null
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

    const browser = getBrowser()
    const isMobileDevice = isMobile()

    // Not supported in iOS Chrome or iOS Edge
    if (isMobileDevice && (browser.name === "chrome" || browser.name === "edge")) {
      return false
    }

    return true
  }
}