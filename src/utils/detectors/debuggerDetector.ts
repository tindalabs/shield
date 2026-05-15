import { getBrowser, isBrowser, isMobile } from "../environment"
import { AbstractDevToolsDetector, DetectorErrorType } from "./AbstractDevToolsDetector"
import type { DevToolsDetectorOptions } from "./detectorInterface"

/**
 * Utility class for detecting DevTools using a Web Worker
 * This approach works across browsers and provides immediate feedback
 */
export interface DebuggerDetectorOptions extends DevToolsDetectorOptions {
  /**
   * Timeout duration in milliseconds
   * If the worker doesn't respond within this time, DevTools is considered open
   */
  timeoutDuration?: number
}

export class DebuggerDetector extends AbstractDevToolsDetector {
  private worker: Worker | null = null
  private timeoutId: number | null = null
  private timeoutDuration: number
  private isInitialized = false
  private initializationAttempts = 0
  private maxInitAttempts = 3

  /**
   * Create a new DebuggerDetector
   * @param options Configuration options
   */
  constructor(options: DebuggerDetectorOptions = {}) {
    super("DebuggerDetector", options)
    this.timeoutDuration = options.timeoutDuration || 500

    // Delay worker initialization to avoid issues during page load
    setTimeout(() => {
      this.initWorker()
    }, 100)

    this.logger.log(`Initialized with timeout duration: ${this.timeoutDuration}ms`)
  }

  /**
   * Initialize the worker for DevTools detection
   */
  private initWorker(): void {
    if (this.isInitialized || this.initializationAttempts >= this.maxInitAttempts) return

    this.initializationAttempts++

    this.safeExecute("initWorker", DetectorErrorType.INITIALIZATION_ERROR, () => {
      // Create a blob URL for the worker script instead of using a file URL
      // This avoids MIME type issues with server responses
      const workerScript = `
      // Worker script for DevTools detection
      self.onmessage = function(e) {
        if (e.data === "checkDevTools") {
          // Send immediate response (opening heartbeat)
          self.postMessage("heartbeatStart");
          
          // This will pause execution if DevTools is open
          debugger;

          // If we reach here without significant delay, DevTools is closed
          self.postMessage("heartbeatEnd");
        }
      };
    `

      // Create a blob URL from the script
      const blob = new Blob([workerScript], { type: "application/javascript" })
      const workerUrl = URL.createObjectURL(blob)

      // Create the worker using the blob URL
      this.worker = new Worker(workerUrl)

      this.worker.onmessage = (e: MessageEvent): void => {
        if (e.data === "heartbeatStart") {
          // First heartbeat received, now waiting for second
          this.logger.log("Received opening heartbeat")
        } else if (e.data === "heartbeatEnd") {
          // Second heartbeat received, DevTools is closed
          if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId)
            this.timeoutId = null
          }

          this.isChecking = false
          this.updateDevToolsState(false)
        }
      }

      this.worker.onerror = (error): void => {
        this.logger.error("Worker error:", error)
        this.isChecking = false

        // Try to recreate the worker
        this.terminateWorker()

        // Retry initialization with exponential backoff
        setTimeout(
          () => {
            this.initWorker()
          },
          Math.min(1000 * Math.pow(2, this.initializationAttempts - 1), 10000),
        )
      }

      // Mark as initialized
      this.isInitialized = true

      // Perform a test check to ensure everything is working
      setTimeout(() => {
        this.performTestCheck()
      }, 200)
    })
  }

  /**
   * Perform a test check to ensure the worker is functioning correctly
   */
  private performTestCheck(): void {
    if (!this.worker || !this.isInitialized) return

    this.safeExecute("performTestCheck", DetectorErrorType.DETECTION_ERROR, () => {
      let testTimeoutId: number | null = null
      let testCompleted = false

      // Send message to worker
      this.worker!.postMessage("checkDevTools")

      // Set a short timeout
      testTimeoutId = window.setTimeout(() => {
        // If we reach here and test isn't completed, something might be wrong
        if (!testCompleted) {
          this.logger.log("Test check timed out, worker might not be responding correctly")
        }
        testTimeoutId = null
      }, 100) as unknown as number

      // Set up a one-time message handler for the test
      const originalOnMessage = this.worker!.onmessage
      this.worker!.onmessage = (e: MessageEvent): void => {
        if (e.data === "heartbeatEnd") {
          testCompleted = true
          if (testTimeoutId !== null) {
            clearTimeout(testTimeoutId)
            testTimeoutId = null
          }

          this.logger.log("Test check completed successfully")

          // Restore original handler
          this.worker!.onmessage = originalOnMessage
        } else {
          // Pass through to original handler
          if (originalOnMessage) {
            originalOnMessage.call(this.worker as Worker, e)
          }
        }
      }
    })
  }

  /**
   * Check if DevTools is open
   */
  public checkDevTools(): void {
    if (this.isChecking || !this.worker || !this.isInitialized) return

    this.isChecking = true

    this.safeExecute("checkDevTools", DetectorErrorType.DETECTION_ERROR, () => {
      // Send message to worker
      this.worker!.postMessage("checkDevTools")

      // Set timeout for missing second heartbeat
      this.timeoutId = window.setTimeout(() => {
        // If we reach here, the worker is paused at debugger
        // which means DevTools is open
        this.isChecking = false
        this.updateDevToolsState(true)
      }, this.timeoutDuration) as unknown as number
    })
  }

  /**
   * Terminate the worker and clean up resources
   */
  private terminateWorker(): void {
    this.safeExecute("terminateWorker", DetectorErrorType.DISPOSAL_ERROR, () => {
      if (this.worker) {
        this.worker.terminate()
        this.worker = null
      }
    })
  }

  /**
   * Clean up resources
   */
  public override dispose(): void {
    this.safeExecute("dispose", DetectorErrorType.DISPOSAL_ERROR, () => {
      if (this.timeoutId !== null) {
        clearTimeout(this.timeoutId)
        this.timeoutId = null
      }

      this.terminateWorker()
      this.isInitialized = false
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

    // Check if Web Workers are supported
    if (typeof Worker === "undefined") {
      return false
    }

    // Check if Blob URLs are supported (needed for creating worker scripts)
    if (typeof Blob === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      return false
    }

    // Check if we can create a worker from a blob URL
    // Some environments restrict this for security reasons
    try {
      const blob = new Blob([""], { type: "application/javascript" })
      const url = URL.createObjectURL(blob)
      const worker = new Worker(url)
      worker.terminate()
      URL.revokeObjectURL(url)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      // If we can't create a worker, this detector won't work
      return false
    }

    // Get browser info
    const browser = getBrowser()
    const isMobileDevice = isMobile()

    // This detector works best in Chromium-based browsers
    // It's generally reliable across most desktop browsers

    // Some older iOS browsers have issues with the debugger statement
    if (isMobileDevice && browser.name === "safari" && Number.parseInt(browser.version, 10) < 14) {
      return false
    }

    return true
  }
}