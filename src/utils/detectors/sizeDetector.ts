import { isBrowser, getBrowser } from "../environment"
import { eventManager } from "../eventManager"
import { AbstractDevToolsDetector, DetectorErrorType } from "./AbstractDevToolsDetector"
import { DevToolsDetectorOptions } from "./detectorInterface"

/**
 * Options for the SizeDetector
 */
export interface SizeDetectorOptions extends DevToolsDetectorOptions {
  /**
   * Width threshold in pixels
   * If the difference between outer and inner width exceeds this, DevTools is considered open
   */
  widthThreshold?: number

  /**
   * Height threshold in pixels
   * If the difference between outer and inner height exceeds this, DevTools is considered open
   */
  heightThreshold?: number
}

/**
 * Utility class for detecting DevTools using window size differences
 * This approach works by detecting unusual differences between outer and inner window dimensions
 * that typically occur when DevTools are open
 */
export class SizeDetector extends AbstractDevToolsDetector {
  private widthThreshold: number
  private heightThreshold: number
  private resizeEventId = ""

  /**
   * Create a new SizeDetector
   * @param options Configuration options
   */
  constructor(options: SizeDetectorOptions = {}) {
    super("SizeDetector", options)
    this.widthThreshold = options.widthThreshold || 200
    this.heightThreshold = options.heightThreshold || 300

    // Initialize resize listener
    this.initResizeListener()

    this.logger.log(`Initialized with thresholds - width: ${this.widthThreshold}px, height: ${this.heightThreshold}px`)
  }

  /**
   * Initialize resize event listener
   */
  private initResizeListener(): void {
    this.safeExecute("initResizeListener", DetectorErrorType.INITIALIZATION_ERROR, () => {
      if (!isBrowser()) return

      // Create resize handler
      const resizeHandler = (): void => {
        // Use setTimeout to avoid too many checks during resize
        setTimeout(() => {
          this.checkDevTools()
        }, 100)
      }

      // Register resize event using eventManager
      this.resizeEventId = eventManager.addEventListener(
        window,
        "resize",
        resizeHandler as EventListener,
        "SizeDetector",
        {
          passive: true,
          priority: 5, // Medium-high priority
        },
      )

      // Perform initial check
      this.checkDevTools()

      this.logger.log(`Resize listener initialized with event ID: ${this.resizeEventId}`)
    })
  }

  /**
   * Calculate screen zoom ratio
   * @returns The screen zoom ratio or false if it can't be determined
   */
  private getScreenZoomRatio(): number | false {
    return (
      this.safeExecute("getScreenZoomRatio", DetectorErrorType.DETECTION_ERROR, () => {
        if (!isBrowser()) return false

        // Try to use devicePixelRatio first (most reliable)
        if (typeof window.devicePixelRatio !== "undefined") {
          return window.devicePixelRatio
        }

        // Fallback to screen properties for older browsers
        const screen = window.screen as unknown as { deviceXDPI: number; logicalXDPI: number }
        if (!screen) return false

        if (screen.deviceXDPI && screen.logicalXDPI) {
          return screen.deviceXDPI / screen.logicalXDPI
        }

        return false
      }) || false
    )
  }

  /**
   * Check if DevTools is open using window size differences
   */
  public checkDevTools(): void {
    if (this.isChecking || !isBrowser()) return
    this.isChecking = true

    this.safeExecute("checkDevTools", DetectorErrorType.DETECTION_ERROR, () => {
      // Get screen zoom ratio
      const screenRatio = this.getScreenZoomRatio()

      // If we can't get the screen ratio, we can't reliably detect
      if (screenRatio === false) {
        this.isChecking = false
        return
      }

      // Calculate size differences accounting for zoom
      const widthDiff = window.outerWidth - window.innerWidth * screenRatio
      const heightDiff = window.outerHeight - window.innerHeight * screenRatio

      // Check if differences exceed thresholds
      const widthUneven = widthDiff > this.widthThreshold
      const heightUneven = heightDiff > this.heightThreshold

      // DevTools is considered open if either dimension is uneven
      const isOpen = widthUneven || heightUneven

      // Log detailed size information in debug mode
      this.logger.log(
        `Window sizes - outer: ${window.outerWidth}x${window.outerHeight}, inner: ${window.innerWidth}x${window.innerHeight}, zoom: ${screenRatio}`,
      )
      this.logger.log(`Size differences - width: ${widthDiff.toFixed(2)}px, height: ${heightDiff.toFixed(2)}px`)

      // Update DevTools state and notify listeners if changed
      this.updateDevToolsState(isOpen)

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
      if (isBrowser() && this.resizeEventId) {
        // Remove the resize event listener using eventManager
        eventManager.removeEventListener(window, this.resizeEventId)
        this.resizeEventId = ""
        this.logger.log("Removed resize event listener")
        this.logger.log("Disposed")
      }
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
    const isIframe = window.self !== window.top

    // Not supported in iframes or Edge
    if (isIframe || browser.name === "edge") {
      return false
    }

    return true
  }
}