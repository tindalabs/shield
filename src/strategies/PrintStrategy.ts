import type { CustomEventHandlers } from "../types"
import { isBrowser, isPrintSupported, isBeforePrintSupported } from "../utils/environment"
import { AbstractStrategy, StrategyErrorType } from "./AbstractStrategy"

/**
 * Strategy for preventing printing
 */
export class PrintStrategy extends AbstractStrategy {
  private beforePrintHandler: (e: Event) => void
  private afterPrintHandler: (e: Event) => void
  private styleElement: HTMLStyleElement | null = null
  private customHandler?: CustomEventHandlers["onPrintAttempt"]

  /**
   * Create a new PrintStrategy
   * @param customHandler Optional custom handler for print attempts
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(customHandler?: CustomEventHandlers["onPrintAttempt"], debugMode = false) {
    super("PrintStrategy", debugMode)

    this.customHandler = customHandler
    this.beforePrintHandler = this.handleBeforePrint.bind(this)
    this.afterPrintHandler = this.handleAfterPrint.bind(this)

    this.log("Initialized with print support:", {
      printSupported: isPrintSupported(),
      beforePrintSupported: isBeforePrintSupported(),
    })
  }

  /**
   * Handle beforeprint event
   */
  private handleBeforePrint(e: Event): void {
    return this.safeExecute("handleBeforePrint", StrategyErrorType.EVENT_HANDLING, () => {
      this.log("Print attempt detected")

      if (this.customHandler) {
        this.customHandler(e)
      }

      // Stop printing
      setTimeout(() => {
        if (isBrowser()) {
          window.stop()
          this.log("Print operation stopped")
        }
      }, 0)
    })
  }

  /**
   * Handle afterprint event
   */
  private handleAfterPrint(_e: Event): void {
    return this.safeExecute("handleAfterPrint", StrategyErrorType.EVENT_HANDLING, () => {
      this.log("Print operation completed or was cancelled")
      // Cleanup if needed
    })
  }

  /**
   * Create and inject print-blocking CSS
   */
  private injectPrintStyles(): void {
    return this.safeExecute("injectPrintStyles", StrategyErrorType.APPLICATION, () => {
      if (!isBrowser()) return

      this.styleElement = document.createElement("style")
      this.styleElement.setAttribute("type", "text/css")
      this.styleElement.setAttribute("data-content-security", "print-blocker")

      const css = `
        @media print {
          body * {
            display: none !important;
          }
          body:after {
            content: "Printing is disabled for this content";
            display: block !important;
            font-size: 24px;
            text-align: center;
            margin: 100px auto;
          }
        }
      `

      this.styleElement.textContent = css
      document.head.appendChild(this.styleElement)

      this.log("Print-blocking CSS injected")
    })
  }

  /**
   * Remove print-blocking CSS
   */
  private removePrintStyles(): void {
    return this.safeExecute("removePrintStyles", StrategyErrorType.REMOVAL, () => {
      if (!this.styleElement || !isBrowser()) return

      // First try to remove by reference
      if (this.styleElement.parentNode) {
        this.styleElement.parentNode.removeChild(this.styleElement)
        this.styleElement = null
        this.log("Print-blocking CSS removed")
      } else {
        // If reference is stale, try to find by attribute
        const styles = document.querySelectorAll('style[data-content-security="print-blocker"]')
        styles.forEach((style) => {
          if (style.parentNode) {
            style.parentNode.removeChild(style)
          }
        })

        this.styleElement = null

        if (styles.length > 0) {
          this.log(`Removed ${styles.length} print-blocking styles by selector`)
        }
      }
    })
  }

  /**
   * Apply print protection
   */
  public apply(): void {
    return this.safeExecute("apply", StrategyErrorType.APPLICATION, () => {
      if (this.isAppliedFlag) {
        this.log("Protection already applied")
        return
      }

      this.log("Applying print protection", {
        hasCustomHandler: !!this.customHandler,
        printSupported: isPrintSupported(),
        beforePrintSupported: isBeforePrintSupported(),
      })

      if (isBrowser()) {
        // Only add event listeners if the events are supported
        if (isPrintSupported()) {
          // Use the registerEvent method from AbstractStrategy
          const afterPrintId = this.registerEvent(window, "afterprint", this.afterPrintHandler, { priority: 10 })

          if (afterPrintId) {
            this.log(`Registered afterprint event with ID ${afterPrintId}`)
          }
        }

        if (isBeforePrintSupported()) {
          // Use the registerEvent method from AbstractStrategy
          const beforePrintId = this.registerEvent(window, "beforeprint", this.beforePrintHandler, { priority: 10 })

          if (beforePrintId) {
            this.log(`Registered beforeprint event with ID ${beforePrintId}`)
          }
        }

        this.injectPrintStyles()
        this.isAppliedFlag = true

        this.log(`Protection applied with ${this.eventIds.length} event handlers`)
      }
    })
  }

  /**
   * Remove print protection
   * Override the base implementation to handle additional cleanup
   */
  public remove(): void {
    return this.safeExecute("remove", StrategyErrorType.REMOVAL, () => {
      if (!this.isAppliedFlag) {
        this.log("Protection not applied")
        return
      }

      if (isBrowser()) {
        // Remove all events for this owner using the parent class method
        this.removeEventsByOwner()

        // Try direct DOM removal as a fallback
        try {
          if (isPrintSupported()) {
            window.removeEventListener("afterprint", this.afterPrintHandler)
          }

          if (isBeforePrintSupported()) {
            window.removeEventListener("beforeprint", this.beforePrintHandler)
          }

          this.log("Removed events via direct DOM API")
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          // Ignore errors in direct DOM removal
        }

        // Remove print styles
        this.removePrintStyles()

        // Clear the event IDs array (parent class method will do this too, but being explicit)
        this.eventIds = []
        this.isAppliedFlag = false

        this.log("Print protection removed")
      }
    })
  }

  /**
   * Update strategy options
   * @param options Options to update
   */
  public updateOptions(options: Record<string, unknown>): void {
    return this.safeExecute("updateOptions", StrategyErrorType.OPTION_UPDATE, () => {
      this.log("Updating options", options)

      // Handle debug mode if present
      if (options.debugMode !== undefined) {
        this.setDebugMode(!!options.debugMode)
      }

      // Handle blockMessage if present
      if (options.blockMessage && typeof options.blockMessage === "string") {
        // If we're already applied, we need to update the CSS
        if (this.isAppliedFlag) {
          this.removePrintStyles()
          this.injectPrintStyles()
          this.log("Updated print styles with new message")
        }
      }
    })
  }
}