import { getBrowser, isBrowser, isMobile } from "../environment"
import { AbstractDevToolsDetector, DetectorErrorType } from "./AbstractDevToolsDetector"
import { DevToolsDetectorOptions } from "./detectorInterface"

/**
 * Options for the TimingDetector
 */
export interface TimingDetectorOptions extends DevToolsDetectorOptions {
  /**
   * Threshold multiplier for detection
   * Higher values make detection less sensitive
   */
  thresholdMultiplier?: number
}

/**
 * Utility class for detecting DevTools using console timing differences
 * This approach works especially well in Firefox
 */
export class TimingDetector extends AbstractDevToolsDetector {
  private largeObjectArray: unknown[] = []
  private maxPrintTime = 0
  private thresholdMultiplier: number

  /**
   * Create a new TimingDetector
   * @param options Configuration options
   */
  constructor(options: TimingDetectorOptions = {}) {
    super("TimingDetector", options)
    this.thresholdMultiplier = options.thresholdMultiplier || 10 //DIFFERENCE BETWEEN .log AND .table

    // Initialize the large object array
    this.initLargeObjectArray()

    this.logger.log("Initialized with threshold multiplier:", this.thresholdMultiplier)
  }

  /**
   * Initialize the large object array used for timing tests
   */
  private initLargeObjectArray(): void {
    this.safeExecute("initLargeObjectArray", DetectorErrorType.INITIALIZATION_ERROR, () => {
      if (!isBrowser()) return

      this.largeObjectArray = this.createLargeObjectArray()
      this.maxPrintTime = 0

      this.logger.log("Large object array initialized with size:", this.largeObjectArray.length)
    })
  }

  /**
   * Create a large object for timing tests
   */
  private createLargeObject(): Record<string, string> {
    return (
      this.safeExecute("createLargeObject", DetectorErrorType.INITIALIZATION_ERROR, () => {
        const largeObject: Record<string, string> = {}
        for (let i = 0; i < 500; i++) {
          largeObject[`${i}`] = `${i}`
        }
        return largeObject
      }) || {}
    )
  }

  /**
   * Create an array of large objects for timing tests
   */
  private createLargeObjectArray(): unknown[] {
    return (
      this.safeExecute("createLargeObjectArray", DetectorErrorType.INITIALIZATION_ERROR, () => {
        const largeObject = this.createLargeObject()
        const largeObjectArray = []

        for (let i = 0; i < 50; i++) {
          largeObjectArray.push(largeObject)
        }

        return largeObjectArray
      }) || []
    )
  }

  /**
   * Calculate execution time of a function
   */
  private calculateTime(func: () => void): number {
    return (
      this.safeExecute("calculateTime", DetectorErrorType.DETECTION_ERROR, () => {
        const start = performance.now()
        func()
        return performance.now() - start
      }) || 0
    )
  }

  /**
   * Check if DevTools is open using console timing
   */
  public checkDevTools(): void {
    if (this.isChecking || !isBrowser()) return
    this.isChecking = true

    this.safeExecute("checkDevTools", DetectorErrorType.DETECTION_ERROR, () => {
      // Measure time to print large object array using console.table
      const tablePrintTime = this.calculateTime(() => {
        console.table(this.largeObjectArray.slice(0, 8)) // Use a smaller slice to avoid freezing
      })

      // Measure time to print large object array using console.log
      const logPrintTime = this.calculateTime(() => {
        console.log(this.largeObjectArray.slice(0, 8)) // Use a smaller slice to avoid freezing
      })

      // Update max print time
      this.maxPrintTime = Math.max(this.maxPrintTime, logPrintTime)

      // Clear console
      console.clear()

      // Skip detection if we don't have valid measurements yet
      if (tablePrintTime === 0 || this.maxPrintTime === 0) {
        this.isChecking = false
        return
      }

      // If table print time is significantly higher than max log print time,
      // DevTools is likely open
      const isOpen = tablePrintTime > this.maxPrintTime * this.thresholdMultiplier

      // Update state and notify listeners if changed
      this.updateDevToolsState(isOpen)

      this.logger.log(
        `Timing check - table: ${tablePrintTime.toFixed(2)}ms, log: ${logPrintTime.toFixed(2)}ms, max: ${this.maxPrintTime.toFixed(2)}ms, ratio: ${(tablePrintTime / this.maxPrintTime).toFixed(2)}x`,
      )

      this.isChecking = false
    })
  }

  /**
   * Clean up resources
   */
  public override dispose(): void {
    this.safeExecute("dispose", DetectorErrorType.DISPOSAL_ERROR, () => {
      this.largeObjectArray = []
      this.maxPrintTime = 0
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

    // Check if required console methods exist
    if (typeof console === "undefined" || typeof console.table !== "function" || typeof console.log !== "function") {
      return false
    }

    // Check if performance API is available
    if (typeof performance === "undefined" || typeof performance.now !== "function") {
      return false
    }

    // Get browser info
    const browser = getBrowser()
    const isMobileDevice = isMobile()

    // This detector works best in Firefox and desktop browsers
    // It's less reliable in mobile browsers and some WebKit browsers

    // Not recommended for mobile Chrome or Edge
    if (isMobileDevice && (browser.name === "chrome" || browser.name === "edge")) {
      return false
    }

    // Not recommended for Safari (desktop or mobile) as it has inconsistent timing behavior
    if (browser.name === "safari") {
      return false
    }

    return true
  }
}