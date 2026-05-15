import type { ContextMenuOptions, CustomEventHandlers } from "../types"
import { isBrowser, isMobile } from "../utils/environment"
import { AbstractStrategy, StrategyErrorType } from "./AbstractStrategy"
import { DomObserver } from "../utils/DOMObserver"

/**
 * Strategy for preventing context menu (right-click)
 */
export class ContextMenuStrategy extends AbstractStrategy {
  private targetElement: HTMLElement | null = null
  private contextMenuHandler: (e: MouseEvent) => void
  private touchStartHandler: (e: TouchEvent) => void
  private touchEndHandler: (e: TouchEvent) => void
  private customHandler?: CustomEventHandlers["onContextMenuAttempt"]

  private domObserver: DomObserver | null = null
  private options: ContextMenuOptions

  /**
   * Create a new ContextMenuStrategy
   * @param options Options for customizing the context menu protection
   * @param targetElement Element to protect (defaults to document.body)
   * @param customHandler Optional custom handler for context menu attempts
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(
    options?: ContextMenuOptions,
    targetElement?: HTMLElement | null,
    customHandler?: CustomEventHandlers["onContextMenuAttempt"],
    debugMode = false,
  ) {
    super("ContextMenuStrategy", debugMode)

    this.options = {
      observeForIframes: false,
      ...options,
    }

    this.targetElement = targetElement || (isBrowser() ? document.body : null)
    this.customHandler = customHandler
    this.contextMenuHandler = this.handleContextMenu.bind(this)
    this.touchStartHandler = this.handleTouchStart.bind(this)
    this.touchEndHandler = this.handleTouchEnd.bind(this)

    this.log("Initialized with target:", this.targetElement === document.body ? "document.body" : "custom element")
    this.log("Options:", this.options)
  }

  /**
   * Handle context menu event
   */
  private handleContextMenu(e: MouseEvent): boolean {
    return (
      this.safeExecute("handleContextMenu", StrategyErrorType.EVENT_HANDLING, () => {
        this.log("Context menu attempt detected", {
          x: e.clientX,
          y: e.clientY,
          target: e.target,
        })

        // Call custom handler if provided
        if (this.customHandler) {
          this.customHandler(e)
        }

        e.preventDefault()
        e.stopPropagation()
        return false
      }) || false
    ) // Return false as fallback if error occurs
  }

  /**
   * Handle touch start event (for mobile)
   */
  private handleTouchStart(e: TouchEvent): void {
    return this.safeExecute("handleTouchStart", StrategyErrorType.EVENT_HANDLING, () => {
      if (!e || !e.touches) return

      if (e.touches.length > 1) {
        this.log("Multi-touch gesture detected (potential context menu attempt)")

        // Call custom handler if provided (for multi-touch)
        if (this.customHandler) {
          this.customHandler(e as unknown as MouseEvent)
        }

        e.preventDefault()
      }
    })
  }

  /**
   * Handle touch end event (for mobile)
   */
  private handleTouchEnd(e: TouchEvent): void {
    return this.safeExecute("handleTouchEnd", StrategyErrorType.EVENT_HANDLING, () => {
      if (!e) return

      const now = new Date().getTime()
      const lastTouch = e.timeStamp || 0
      const timeDiff = now - lastTouch

      // Detect long press (over 500ms)
      if (timeDiff > 500) {
        this.log("Long press detected (potential context menu attempt)", {
          duration: timeDiff + "ms",
        })

        // Call custom handler if provided (for long press)
        if (this.customHandler) {
          this.customHandler(e as unknown as MouseEvent)
        }

        e.preventDefault()
      }
    })
  }

  /**
   * Set up DOM observer to watch for new iframes
   */
  private setupIframeObserver(): void {
    return this.safeExecute("setupIframeObserver", StrategyErrorType.APPLICATION, () => {
      if (!isBrowser() || !this.options.observeForIframes) return

      // Disconnect any existing observer
      if (this.domObserver) {
        this.domObserver.stopObserving()
      }

      // Create a new DOM observer
      this.domObserver = new DomObserver({
        targetElement: document.documentElement,
        elementsToWatch: [], // We're not watching for removals
        onElementsAdded: (addedElements): void => {
          let newIframesFound = false

          // Check for added iframes
          addedElements.forEach((element) => {
            if (element.nodeName === "IFRAME") {
              this.protectIframe(element as HTMLIFrameElement)
              newIframesFound = true
            }
          })

          if (newIframesFound) {
            this.log("Protected newly added iframes")
          }
        },
        observeSubtree: true,
        debugMode: this.debugMode,
        name: "ContextMenuStrategy-IframeObserver",
      })

      this.domObserver.startObserving()
      this.log("Iframe observer set up")
    })
  }

  /**
   * Protect a specific iframe from context menu
   */
  private protectIframe(iframe: HTMLIFrameElement): void {
    return this.safeExecute("protectIframe", StrategyErrorType.APPLICATION, () => {
      // First, protect the iframe element itself immediately
      this.registerEvent(iframe, "contextmenu", this.contextMenuHandler as EventListener, {
        capture: true,
        priority: 100,
      })

      // For cross-origin iframes, we need to use sandbox attribute detection
      const isCrossOrigin =
        iframe.src &&
        (iframe.src.startsWith("http") || iframe.src.startsWith("//")) &&
        !iframe.src.includes(window.location.hostname)

      if (isCrossOrigin) {
        this.log(`Detected likely cross-origin iframe: ${iframe.src}`)
        // For cross-origin iframes, we can only protect the iframe element itself
        return
      }

      // Function to protect the iframe content
      const protectIframeContent = (): void => {
        // Access the iframe's contentDocument - safeExecute will handle any errors
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document

        if (!iframeDoc) {
          this.log(`Could not access iframe document: ${iframe.src || "unnamed iframe"}`)
          return
        }

        // Make sure the document is fully loaded
        if (iframeDoc.readyState !== "complete" && iframeDoc.readyState !== "interactive") {
          this.log(`Iframe document not ready yet: ${iframe.src || "unnamed iframe"}, state: ${iframeDoc.readyState}`)
          return
        }

        // Register context menu handler on the iframe document
        const iframeEventId = this.registerEvent(iframeDoc, "contextmenu", this.contextMenuHandler as EventListener, {
          capture: true,
          priority: 100,
        })

        // Also register on the iframe document body if available
        if (iframeDoc.body) {
          this.registerEvent(iframeDoc.body, "contextmenu", this.contextMenuHandler as EventListener, {
            capture: true,
            priority: 100,
          })
        }

        if (iframeEventId) {
          this.log(`Protected iframe content: ${iframe.src || "unnamed iframe"}`)
        }

        // For mobile devices, also protect against touch events
        if (isMobile()) {
          this.registerEvent(iframeDoc, "touchstart", this.touchStartHandler as EventListener, {
            passive: false,
            capture: true,
            priority: 100,
          })

          this.registerEvent(iframeDoc, "touchend", this.touchEndHandler as EventListener, {
            passive: false,
            capture: true,
            priority: 100,
          })
        }

        // Add direct event listeners as a backup
        this.safeExecute("addDirectListeners", StrategyErrorType.EVENT_HANDLING, (): void => {
          iframeDoc.addEventListener("contextmenu", this.contextMenuHandler, {
            capture: true,
            passive: false,
          })

          if (iframeDoc.body) {
            iframeDoc.body.addEventListener("contextmenu", this.contextMenuHandler, {
              capture: true,
              passive: false,
            })
          }

          this.log("Added direct event listeners to iframe document")
        })

        // Try to disable the default context menu using oncontextmenu property
        this.safeExecute("setOnContextMenu", StrategyErrorType.EVENT_HANDLING, (): void => {
          iframeDoc.oncontextmenu = (): boolean => false
          if (iframeDoc.body) {
            iframeDoc.body.oncontextmenu = (): boolean => false
          }
          this.log("Set oncontextmenu property on iframe document")
        })

        // Also protect any nested iframes
        this.safeExecute("protectNestedIframes", StrategyErrorType.APPLICATION, () => {
          const nestedIframes = iframeDoc.querySelectorAll("iframe")
          if (nestedIframes.length > 0) {
            this.log(`Found ${nestedIframes.length} nested iframes to protect`)
            nestedIframes.forEach((nestedIframe) => {
              this.protectIframe(nestedIframe)
            })
          }
        })
      }

      // Try to protect immediately if possible
      this.safeExecute("immediateProtection", StrategyErrorType.APPLICATION, () => {
        protectIframeContent()
      })

      // Set up multiple attempts to protect the iframe content
      // This helps with dynamically loaded iframes where the content might not be immediately available
      const maxAttempts = 5
      let attempts = 0

      const attemptProtection = (): void => {
        attempts++
        if (attempts > maxAttempts) return

        this.safeExecute("retryProtection", StrategyErrorType.APPLICATION, () => {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
          if (iframeDoc && iframeDoc.readyState === "complete") {
            protectIframeContent()
          } else {
            setTimeout(attemptProtection, 200 * attempts) // Increasing delay with each attempt
          }
        })
      }

      // Start the retry process
      setTimeout(attemptProtection, 100)

      // Also set up a load event handler as a fallback
      const loadHandler = (): void => {
        this.safeExecute("loadHandler", StrategyErrorType.APPLICATION, () => {
          protectIframeContent()
        })
        iframe.removeEventListener("load", loadHandler)
      }

      iframe.addEventListener("load", loadHandler)
    })
  }

  /**
   * Find and protect all existing iframes
   */
  private protectExistingIframes(): void {
    return this.safeExecute("protectExistingIframes", StrategyErrorType.APPLICATION, () => {
      if (!isBrowser()) return

      const iframes = document.querySelectorAll("iframe")
      if (iframes.length > 0) {
        this.log(`Found ${iframes.length} existing iframes to protect`)
        iframes.forEach((iframe) => {
          this.protectIframe(iframe)
        })
      }
    })
  }

  /**
   * Apply context menu protection
   */
  public apply(): void {
    return this.safeExecute("apply", StrategyErrorType.APPLICATION, () => {
      if (this.isAppliedFlag || !this.targetElement) return

      this.log("Applying context menu protection", {
        targetElement: this.targetElement === document.body ? "document.body" : "custom element",
        hasCustomHandler: !!this.customHandler,
        observeForIframes: this.options.observeForIframes,
      })

      // Register the context menu event using our registerEvent method
      const contextMenuEventId = this.registerEvent(
        this.targetElement,
        "contextmenu",
        this.contextMenuHandler as EventListener,
        { priority: 10 },
      )

      if (!contextMenuEventId) {
        this.handleError(
          StrategyErrorType.APPLICATION,
          "Failed to register context menu event handler",
          new Error("Event registration returned empty ID"),
        )
      }

      // Also prevent other ways to access context menu
      if (isBrowser() && isMobile()) {
        // Register touch events with proper options
        const touchStartId = this.registerEvent(
          this.targetElement,
          "touchstart",
          this.touchStartHandler as EventListener,
          {
            passive: false,
            priority: 10,
          },
        )

        const touchEndId = this.registerEvent(this.targetElement, "touchend", this.touchEndHandler as EventListener, {
          passive: false,
          priority: 10,
        })

        if (!touchStartId || !touchEndId) {
          this.handleError(
            StrategyErrorType.APPLICATION,
            "Failed to register touch event handlers",
            new Error("Touch event registration returned empty ID"),
          )
        }

        this.log("Added mobile-specific event handlers")
      }

      // Always protect existing iframes
      this.protectExistingIframes()

      // Set up observer for future iframes if enabled
      if (this.options.observeForIframes) {
        this.setupIframeObserver()
      }

      this.isAppliedFlag = true
      this.log(`Protection applied with ${this.eventIds.length} event handlers`)
    })
  }

  /**
   * Remove context menu protection
   * Override the base implementation to handle the complex removal logic
   */
  public remove(): void {
    return this.safeExecute("remove", StrategyErrorType.REMOVAL, () => {
      if (!this.isAppliedFlag) return

      this.log("Removing protection")

      // Disconnect DOM observer if it exists
      if (this.domObserver) {
        this.domObserver.stopObserving()
        this.domObserver = null
        this.log("Disconnected iframe observer")
      }

      // For Vue components, we need a more robust removal approach
      // Try multiple removal strategies to ensure cleanup

      // 1. Direct removal via target if available
      if (this.targetElement) {
        const removedCount = this.removeAllEventsForTarget(this.targetElement)
        this.log(`Attempted direct removal via target element: ${removedCount} events removed`)
      }

      // 2. Remove by owner ID - this should work for document/window events
      const removedCount = this.removeEventsByOwner()
      this.log(`Removed ${removedCount} events by owner ID`)

      // 3. Use a more comprehensive selector approach for component elements
      if (this.targetElement && this.targetElement !== document.body) {
        let selectorRemoved = 0

        // Try element tagName first (will be broader but more reliable)
        const tagName = this.targetElement.tagName.toLowerCase()
        selectorRemoved += this.removeEventsBySelector(tagName, "contextmenu")

        // Then try more specific approach with class or ID if available
        const id = this.targetElement.id ? `#${this.targetElement.id}` : ""
        if (id) {
          selectorRemoved += this.removeEventsBySelector(id, "contextmenu")
        }

        // Try removing from elements with same class - but handle string vs DOMTokenList
        let classSelector = ""
        if (this.targetElement.className) {
          if (typeof this.targetElement.className === "string") {
            // Handle string className
            const classes = this.targetElement.className.split(" ").filter((c) => c.trim().length > 0)
            if (classes.length > 0) {
              // Just use the first class for better matching
              classSelector = `.${classes[0]}`
            }
          } else if (this.targetElement.classList && this.targetElement.classList.length > 0) {
            // Handle DOMTokenList
            classSelector = `.${this.targetElement.classList[0]}`
          }
        }

        if (classSelector) {
          selectorRemoved += this.removeEventsBySelector(classSelector, "contextmenu")
        }

        // Also try finding parent containers with common classes
        selectorRemoved += this.removeEventsBySelector(".content-container", "contextmenu")
        selectorRemoved += this.removeEventsBySelector(".protected-content", "contextmenu")

        if (selectorRemoved > 0) {
          this.log(`Removed ${selectorRemoved} events via selectors`)
        }
      }

      // 4. As a last resort, try to find and remove any contextmenu events from common container elements
      const containerSelectors = ["main", ".app", "#app", ".content", "div.protected-content"]
      let fallbackRemoved = 0

      for (const selector of containerSelectors) {
        this.safeExecute(`removeSelector-${selector}`, StrategyErrorType.REMOVAL, () => {
          fallbackRemoved += this.removeEventsBySelector(selector, "contextmenu")
        })
      }

      if (fallbackRemoved > 0) {
        this.log(`Removed ${fallbackRemoved} events via fallback selectors`)
      }

      // Clean up mobile-specific handlers if needed
      if (isMobile()) {
        if (this.targetElement) {
          // Try to remove touch events
          this.removeEventsBySelector(this.targetElement.tagName.toLowerCase(), "touchstart")
          this.removeEventsBySelector(this.targetElement.tagName.toLowerCase(), "touchend")
        }

        // Also try global touch event removal
        this.removeEventsBySelector("body", "touchstart")
        this.removeEventsBySelector("body", "touchend")
      }

      // Always clear the event IDs array and reset state
      this.eventIds = []
      this.isAppliedFlag = false
      this.log("Protection removal complete")
    })
  }

  /**
   * Update strategy options
   * @param options Options to update
   */
  public updateOptions(options: Partial<ContextMenuOptions> & Record<string, unknown>): void {
    return this.safeExecute("updateOptions", StrategyErrorType.OPTION_UPDATE, () => {
      this.log("Updating options", options)

      // Handle debug mode if present
      if (options.debugMode !== undefined) {
        this.setDebugMode(!!options.debugMode)
      }

      // Handle iframe observation option
      if (options.observeForIframes !== undefined) {
        this.options.observeForIframes = !!options.observeForIframes

        // If we're already applied and changing the observer setting
        if (this.isAppliedFlag) {
          if (this.options.observeForIframes) {
            this.setupIframeObserver()
          } else if (this.domObserver) {
            this.domObserver.stopObserving()
            this.domObserver = null
          }
        }

        this.log(`Iframe observation ${this.options.observeForIframes ? "enabled" : "disabled"}`)
      }

      // If we need to update the target element
      if (options.targetElement) {
        if (options.targetElement instanceof HTMLElement) {
          const newTarget = options.targetElement as HTMLElement

          if (this.targetElement !== newTarget) {
            // If already applied, remove and reapply with new target
            const wasApplied = this.isAppliedFlag

            if (wasApplied) {
              this.remove()
            }

            this.targetElement = newTarget

            if (wasApplied) {
              this.apply()
            }

            this.log("Target element updated and protection reapplied")
          } else {
            this.log("Target element unchanged, no update needed")
          }
        } else {
          this.handleError(
            StrategyErrorType.OPTION_UPDATE,
            "Invalid targetElement option",
            new Error("targetElement must be an HTMLElement"),
          )
        }
      }
    })
  }
}