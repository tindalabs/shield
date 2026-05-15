import { isBrowser, getBrowser } from "../environment"
import { AbstractDevToolsDetector, DetectorErrorType } from "./AbstractDevToolsDetector"
import { DevToolsDetectorOptions } from "./detectorInterface"

/**
 * Options for the RegToStringDetector
 */
export interface RegToStringDetectorOptions extends DevToolsDetectorOptions {
  /**
   * Time threshold in milliseconds for QQ Browser detection
   * If two toString calls happen within this time, DevTools is considered open
   */
  timeThreshold?: number
}

/**
 * Utility class for detecting DevTools using RegExp.toString behavior
 * This approach works especially well in Firefox and QQ Browser
 */
export class RegToStringDetector extends AbstractDevToolsDetector {
  private reg: RegExp | null = null
  private lastCallTime = 0
  private timeThreshold: number

  /**
   * Create a new RegToStringDetector
   * @param options Configuration options
   */
  constructor(options: RegToStringDetectorOptions = {}) {
    super("RegToStringDetector", options)
    this.timeThreshold = options.timeThreshold || 100

    // Initialize the RegExp object with custom toString
    this.initRegExpObject()

    this.logger.log("Initialized with time threshold:", this.timeThreshold)
  }

  /**
   * Initialize the RegExp object with custom toString method
   */
  private initRegExpObject(): void {
    this.safeExecute("initRegExpObject", DetectorErrorType.INITIALIZATION_ERROR, () => {
      if (!isBrowser()) return

      this.reg = /./

      // Override toString to detect DevTools
      this.reg.toString = (): string => {
        const browser = getBrowser()
        const isQQBrowser = browser.name === "qq" || navigator.userAgent.toLowerCase().includes("qqbrowser")
        const isFirefox = browser.name === "firefox"

        if (isQQBrowser) {
          // For QQ Browser: When DevTools is closed, toString is called once.
          // When DevTools is open, toString is called twice in quick succession.
          // We use this timing difference to detect if DevTools is open.
          const currentTime = Date.now()

          if (this.lastCallTime && currentTime - this.lastCallTime < this.timeThreshold) {
            // Two calls in quick succession - DevTools is likely open
            this.updateDevToolsState(true)
            this.logger.log("DevTools opened (QQ Browser detection)")
          } else {
            // First call or calls too far apart
            this.lastCallTime = currentTime
          }
        } else if (isFirefox) {
          // For Firefox: toString is only called when DevTools is open
          this.updateDevToolsState(true)
          this.logger.log("DevTools opened (Firefox detection)")
        }

        return ""
      }

      this.logger.log("RegExp object initialized")
    })
  }

  /**
   * Check if DevTools is open using RegExp.toString behavior
   */
  public checkDevTools(): void {
    if (this.isChecking || !isBrowser() || !this.reg) return
    this.isChecking = true

    this.safeExecute("checkDevTools", DetectorErrorType.DETECTION_ERROR, () => {
      // Reset detection state for Firefox
      const browser = getBrowser()
      if (browser.name === "firefox" && this.isDevToolsOpen) {
        this.updateDevToolsState(false)
      }

      // Log the RegExp object - this will trigger toString
      console.log(this.reg)

      // Clear console to avoid clutter
      if (!this.debugMode) {
        console.clear()
      }

      // For browsers other than Firefox and QQ Browser, we need to check if
      // DevTools is closed after a short delay
      setTimeout(() => {
        this.safeExecute("checkDevToolsTimeout", DetectorErrorType.DETECTION_ERROR, () => {
          const browser = getBrowser()
          const isQQBrowser = browser.name === "qq" || navigator.userAgent.toLowerCase().includes("qqbrowser")
          const isFirefox = browser.name === "firefox"

          // If we're not in Firefox or QQ Browser and DevTools is open,
          // check if it should be marked as closed
          if (!isFirefox && !isQQBrowser && this.isDevToolsOpen) {
            const currentTime = Date.now()

            // If no recent toString calls, DevTools is likely closed
            if (currentTime - this.lastCallTime > this.timeThreshold * 2) {
              this.updateDevToolsState(false)
              this.logger.log("DevTools closed")
            }
          }

          this.isChecking = false
        })
      }, this.timeThreshold * 2)
    })

    // Ensure isChecking is reset if an error occurs
    if (this.isChecking) {
      setTimeout(() => {
        this.isChecking = false
      }, this.timeThreshold * 3)
    }
  }

  /**
   * Clean up resources
   */
  public override dispose(): void {
    this.safeExecute("dispose", DetectorErrorType.DISPOSAL_ERROR, () => {
      this.reg = null
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
    const isQQBrowser = browser.name === "qq" || navigator.userAgent.toLowerCase().includes("qqbrowser")
    const isFirefox = browser.name === "firefox"

    // This detector works best in Firefox and QQ Browser
    return isFirefox || isQQBrowser
  }
}