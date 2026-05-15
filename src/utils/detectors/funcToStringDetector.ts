import { isBrowser, getBrowser, isMobile } from "../environment"
import { AbstractDevToolsDetector, DetectorErrorType } from "./AbstractDevToolsDetector"
import { DevToolsDetectorOptions } from "./detectorInterface"

/**
 * Options for the FuncToStringDetector
 */
export interface FuncToStringDetectorOptions extends DevToolsDetectorOptions {
  /**
   * Threshold for detection (number of toString calls)
   */
  threshold?: number
}

/**
 * Utility class for detecting DevTools using Function.toString behavior
 * This approach works by detecting multiple calls to toString when a function is logged
 * and DevTools is open
 */
export class FuncToStringDetector extends AbstractDevToolsDetector {
  private func: (() => void) | null = null
  private count = 0
  private threshold: number

  /**
   * Create a new FuncToStringDetector
   * @param options Configuration options
   */
  constructor(options: FuncToStringDetectorOptions = {}) {
    super("FuncToStringDetector", options)
    this.threshold = options.threshold || 2

    // Initialize the function with custom toString
    this.initFunction()

    this.logger.log("Initialized with threshold:", this.threshold)
  }

  /**
   * Initialize the function with custom toString method
   */
  private initFunction(): void {
    this.safeExecute("initFunction", DetectorErrorType.INITIALIZATION_ERROR, () => {
      if (!isBrowser()) return

      // Create an empty function
      this.func = (): void => {}

      // Override toString to count calls
      this.func.toString = (): string => {
        this.count++
        this.logger.log(`toString called (${this.count} times)`)
        return ""
      }

      this.logger.log("Function initialized with custom toString")
    })
  }

  /**
   * Check if DevTools is open using Function.toString behavior
   */
  public checkDevTools(): void {
    if (this.isChecking || !isBrowser()) return
    this.isChecking = true

    this.safeExecute("checkDevTools", DetectorErrorType.DETECTION_ERROR, () => {
      // Reset counter
      this.count = 0

      // Log the function - this will trigger toString
      console.log(this.func)

      // Clear console to avoid clutter
      if (!this.debugMode) {
        console.clear()
      }

      // If toString was called multiple times, DevTools is likely open
      const isOpen = this.count >= this.threshold

      // Update state and notify listeners if changed
      this.updateDevToolsState(isOpen)

      this.logger.log(`toString called ${this.count} times, threshold: ${this.threshold}`)
    })

    // Ensure isChecking is reset even if an error occurs
    this.isChecking = false
  }

  /**
   * Clean up resources
   */
  public override dispose(): void {
    this.safeExecute("dispose", DetectorErrorType.DISPOSAL_ERROR, () => {
      this.func = null
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