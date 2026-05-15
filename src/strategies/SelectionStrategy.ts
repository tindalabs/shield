import type { CustomEventHandlers } from "../types"
import { isBrowser, isMobile } from "../utils/environment"
import { AbstractStrategy, StrategyErrorType } from "./AbstractStrategy"

/**
 * Strategy for preventing text selection
 */
export class SelectionStrategy extends AbstractStrategy {
  private targetElement: HTMLElement | null = null
  private styleElement: HTMLStyleElement | null = null
  private selectionHandler: (e: Event) => void
  private dragHandler: (e: DragEvent) => void
  private customHandler?: CustomEventHandlers["onSelectionAttempt"]
  private preventDrag = true

  /**
   * Create a new SelectionStrategy
   * @param targetElement Element to protect (defaults to document.body)
   * @param customHandler Optional custom handler for selection attempts
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(
    targetElement?: HTMLElement | null,
    customHandler?: CustomEventHandlers["onSelectionAttempt"],
    debugMode = false,
  ) {
    super("SelectionStrategy", debugMode)

    this.targetElement = targetElement || (isBrowser() ? document.body : null)
    this.customHandler = customHandler
    this.selectionHandler = this.handleSelection.bind(this)
    this.dragHandler = this.handleDrag.bind(this)

    this.log("Initialized with target:", this.targetElement === document.body ? "document.body" : "custom element")
  }

  /**
   * Handle selection event
   */
  private handleSelection(e: Event): boolean {
    return (
      this.safeExecute("handleSelection", StrategyErrorType.EVENT_HANDLING, () => {
        this.log("Selection attempt detected", {
          eventType: e.type,
          target: e.target,
        })

        // Call custom handler if provided
        if (this.customHandler) {
          this.customHandler(e)
        }

        if (isBrowser() && window.getSelection) {
          const selection = window.getSelection()
          if (selection) {
            selection.removeAllRanges()
          }
        }

        e.preventDefault()
        e.stopPropagation()
        return false
      }) || false
    )
  }

  /**
   * Handle drag event
   */
  private handleDrag(e: DragEvent): void {
    this.safeExecute("handleDrag", StrategyErrorType.EVENT_HANDLING, () => {
      this.log("Drag attempt detected", {
        eventType: e.type,
        target: e.target,
      })

      // Call custom handler if provided
      if (this.customHandler) {
        this.customHandler(e)
      }

      e.preventDefault()
      e.stopPropagation()
    })
  }

  /**
   * Inject CSS to prevent selection
   */
  private injectSelectionStyles(): void {
    this.safeExecute("injectSelectionStyles", StrategyErrorType.APPLICATION, () => {
      if (!isBrowser()) return

      this.styleElement = document.createElement("style")
      this.styleElement.setAttribute("type", "text/css")
      this.styleElement.setAttribute("data-content-security", "selection-blocker")

      const selector = this.targetElement === document.body ? "body" : ".protected-content"

      const css = `
        ${selector} {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
        }
        
        ${selector} ::selection {
          background: transparent;
        }
      `

      this.styleElement.textContent = css
      document.head.appendChild(this.styleElement)

      // Add class if not targeting body
      if (this.targetElement !== document.body) {
        this.targetElement?.classList.add("protected-content")
      }

      this.log("Selection-blocking CSS injected")
    })
  }

  /**
   * Remove selection-blocking CSS
   */
  private removeSelectionStyles(): void {
    this.safeExecute("removeSelectionStyles", StrategyErrorType.REMOVAL, () => {
      if (!this.styleElement || !isBrowser()) return

      try {
        document.head.removeChild(this.styleElement)
        this.styleElement = null

        // Remove class if not targeting body
        if (this.targetElement !== document.body) {
          this.targetElement?.classList.remove("protected-content")
        }

        this.log("Selection-blocking CSS removed")
      } catch (error) {
        this.handleError(StrategyErrorType.REMOVAL, "Error removing selection styles", error)

        // Try to find and remove by selector as fallback
        try {
          const styles = document.querySelectorAll('style[data-content-security="selection-blocker"]')
          styles.forEach((style) => {
            if (style.parentNode) {
              style.parentNode.removeChild(style)
            }
          })

          this.styleElement = null

          if (styles.length > 0) {
            this.log(`Removed ${styles.length} selection-blocking styles by selector`)
          }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (fallbackError) {
          // Last resort fallback
          this.styleElement = null
        }
      }
    })
  }

  /**
   * Apply selection protection
   */
  public apply(): void {
    this.safeExecute("apply", StrategyErrorType.APPLICATION, () => {
      if (this.isAppliedFlag || !this.targetElement) return

      this.log("Applying selection protection", {
        targetElement: this.targetElement === document.body ? "document.body" : "custom element",
        hasCustomHandler: !!this.customHandler,
        preventDrag: this.preventDrag,
        isMobile: isMobile(),
      })

      // Add CSS
      this.injectSelectionStyles()

      // Add event listeners using the registerEvent method from AbstractStrategy
      this.registerEvent(this.targetElement, "selectstart", this.selectionHandler)
      this.registerEvent(this.targetElement, "mousedown", this.selectionHandler, { capture: true })

      // Disable drag
      if (this.preventDrag) {
        this.registerEvent(this.targetElement, "dragstart", this.dragHandler as EventListener)
      }

      this.isAppliedFlag = true
    })
  }

  /**
   * Remove selection protection
   */
  public remove(): void {
    this.safeExecute("remove", StrategyErrorType.REMOVAL, () => {
      if (!this.isAppliedFlag || !this.targetElement) return

      // Remove CSS
      this.removeSelectionStyles()

      // Remove all events for this owner using the parent class method
      this.removeEventsByOwner()

      // Second attempt - try direct DOM removal as fallback
      try {
        if (this.targetElement) {
          this.targetElement.removeEventListener("selectstart", this.selectionHandler)
          this.targetElement.removeEventListener("mousedown", this.selectionHandler, { capture: true })
          this.targetElement.removeEventListener("dragstart", this.dragHandler)

          this.log("Removed events via direct DOM API")
        }
      } catch (domError) {
        // Ignore errors in direct DOM removal
        this.handleError(StrategyErrorType.REMOVAL, "Error in fallback DOM removal", domError)
      }

      // Clear tracked event IDs
      this.eventIds = []
      this.isAppliedFlag = false

      this.log("Selection protection removed")
    })
  }

  /**
   * Update selection protection options
   * @param options New options for selection protection
   */
  public updateOptions(options: Record<string, unknown>): void {
    this.safeExecute("updateOptions", StrategyErrorType.OPTION_UPDATE, () => {
      this.log("Updating options", options)

      // Update debug mode if specified
      if (options.debugMode !== undefined) {
        this.setDebugMode(!!options.debugMode)
      }

      // Update preventDrag if specified
      if (options.preventDrag !== undefined) {
        const oldPreventDrag = this.preventDrag
        this.preventDrag = !!options.preventDrag

        // If we need to update the applied strategy
        if (this.isAppliedFlag && oldPreventDrag !== this.preventDrag) {
          // Remove and reapply to update event listeners
          this.remove()
          this.apply()

          this.log("Reapplied with updated options")
        }
      }
    })
  }
}