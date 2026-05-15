import type { CustomEventHandlers, ScreenshotOptions } from "../types"
import { isBrowser, isPrintSupported, isBeforePrintSupported } from "../utils/environment"
import { AbstractStrategy, StrategyErrorType } from "./AbstractStrategy"
import { ShortcutCategory } from "../utils/keyboardShortcutManager/keyboardShortcuts"
import { KeyboardShortcutManager } from "../utils/keyboardShortcutManager/keyboardShortcutManager"
import { ProtectionEventType } from "../core/mediator/protection-event"
import { timeoutManager } from "../utils/timeoutManager"

/**
 * Strategy for preventing screenshots and screen captures
 */
export class ScreenshotStrategy extends AbstractStrategy {
  private keydownHandler: (e: KeyboardEvent) => void
  private keyupHandler: (e: KeyboardEvent) => void
  private blurHandler: () => void
  private focusHandler: () => void
  private visibilityHandler: () => void
  private printHandler: () => void
  private beforePrintHandler: () => void
  private fullscreenChangeHandler: () => void
  private lastKeyEvent = 0
  private options: ScreenshotOptions
  private customHandler?: CustomEventHandlers["onScreenshotAttempt"]
  private categories: ShortcutCategory[] = [ShortcutCategory.SCREENSHOT, ShortcutCategory.FULLSCREEN]
  private targetElement: HTMLElement | null = null
  private shortcutManager: KeyboardShortcutManager

  /**
   * Create a new ScreenshotStrategy
   * @param options Options for customizing the screenshot protection
   * @param customHandler Optional custom handler for screenshot attempts
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(
    options?: ScreenshotOptions,
    targetElement: HTMLElement | null = null,
    customHandler?: CustomEventHandlers["onScreenshotAttempt"],
    debugMode = false,
  ) {
    super("ScreenshotStrategy", debugMode)

    this.options = {
      showOverlay: true,
      overlayOptions: {
        title: "SCREENSHOT PROTECTED",
        textColor: "white",
        backgroundColor: "rgba(255, 0, 0, 0.7)",
        fontSize: "48px",
        duration: 1000,
      },
      hideContent: true,
      preventFullscreen: true,
      fullscreenMessage: "Fullscreen mode is disabled for security reasons",
      ...options,
    }
    this.customHandler = customHandler
    this.targetElement = targetElement
    this.keydownHandler = this.handleKeyDown.bind(this)
    this.keyupHandler = this.handleKeyUp.bind(this)
    this.blurHandler = this.handleWindowBlur.bind(this)
    this.focusHandler = this.handleWindowFocus.bind(this)
    this.visibilityHandler = this.handleVisibilityChange.bind(this)
    this.printHandler = this.handlePrint.bind(this)
    this.beforePrintHandler = this.handleBeforePrint.bind(this)
    this.fullscreenChangeHandler = this.handleFullscreenChange.bind(this)

    // Initialize shortcut manager
    this.shortcutManager = KeyboardShortcutManager.getInstance()

    // Set timeoutManager debug mode to match this strategy's debug mode
    timeoutManager.setDebugMode(this.debugMode)

    this.log("Initialized with options:", {
      preventFullscreen: this.options.preventFullscreen,
      duration: this.options.overlayOptions?.duration,
      hideContent: this.options.hideContent,
    })
  }

  /**
   * Handle keydown events to detect screenshot attempts
   */
  private handleKeyDown(e: KeyboardEvent): boolean | undefined {
    return this.safeExecute("handleKeyDown", StrategyErrorType.EVENT_HANDLING, () => {
      if (e.key === "F12") {
        return // Allow F12 to pass through
      }

      this.lastKeyEvent = Date.now()

      // Use the shortcut manager to detect shortcuts
      const shortcut = this.shortcutManager.matchesShortcut(e, this.categories)

      if (shortcut) {
        // Prevent the default action
        e.preventDefault()
        e.stopPropagation()

        this.log(
          `Detected keyboard shortcut: ${shortcut.id} (${this.shortcutManager.getShortcutDescription(shortcut)})`,
        )

        // Handle based on category
        if (shortcut.category === ShortcutCategory.SCREENSHOT) {
          // Publish screenshot attempt event
          if (this.mediator) {
            this.showScreenshotNotification()
          }

          // Call custom handler if provided
          if (this.customHandler) {
            this.customHandler(e)
          }

          return false
        } else if (shortcut.category === ShortcutCategory.FULLSCREEN && this.options.preventFullscreen) {
          // Exit fullscreen if currently in fullscreen mode
          this.exitFullscreen()

          // Show anti-fullscreen notification
          this.showFullscreenNotification()

          // Call custom handler if provided
          if (this.customHandler) {
            this.customHandler(e)
          }

          return false
        }
      }
    })
  }

  /**
   * Handle keyup events - specifically for PrintScreen which may only trigger on keyup
   */
  private handleKeyUp(e: KeyboardEvent): boolean | undefined {
    return this.safeExecute("handleKeyUp", StrategyErrorType.EVENT_HANDLING, () => {
      // Check for PrintScreen key
      const isPrintScreen =
        e.key === "PrintScreen" ||
        e.key === "PrtScn" ||
        e.key === "Print" ||
        e.key === "PrtSc" ||
        e.code === "PrintScreen" ||
        e.keyCode === 44

      // Check for SysRq key
      const isSysRq = e.key === "SysRq" || e.code === "SysRq"

      if (isPrintScreen || isSysRq) {
        this.log("PrintScreen/SysRq key detected on keyup")

        e.preventDefault()
        e.stopPropagation()

        // Publish screenshot attempt event
        if (this.mediator) {
          this.showScreenshotNotification()
        }

        // Call custom handler if provided
        if (this.customHandler) {
          this.customHandler(e)
        }

        return false
      }
    })
  }

  /**
   * Handle window blur event - might indicate screenshot tool activation
   */
  private handleWindowBlur(): void {
    return this.safeExecute("handleWindowBlur", StrategyErrorType.EVENT_HANDLING, () => {
      const timeSinceLastKey = Date.now() - this.lastKeyEvent

      // If window loses focus within 500ms of a key event, it might be a screenshot tool
      if (timeSinceLastKey < 500) {
        this.log("Window blur detected shortly after key event, possible screenshot attempt")

        // Publish screenshot attempt event
        if (this.mediator) {
          this.showScreenshotNotification()
        }
      }
    })
  }

  /**
   * Handle window focus event - remove overlay when focus returns
   */
  private handleWindowFocus(): void {
    return this.safeExecute("handleWindowFocus", StrategyErrorType.EVENT_HANDLING, () => {
      // No need to do anything here - the handler will manage timeouts
    })
  }

  /**
   * Handle visibility change event - might indicate screenshot tool activation
   */
  private handleVisibilityChange(): void {
    return this.safeExecute("handleVisibilityChange", StrategyErrorType.EVENT_HANDLING, () => {
      if (document.visibilityState === "hidden") {
        const timeSinceLastKey = Date.now() - this.lastKeyEvent

        // If document becomes hidden within 500ms of a key event, it might be a screenshot tool
        if (timeSinceLastKey < 500) {
          this.log("Visibility change detected shortly after key event, possible screenshot attempt")

          // Publish screenshot attempt event
          if (this.mediator) {
            this.showScreenshotNotification()
          }
        }
      }
    })
  }

  /**
   * Handle print event - might be used for screenshots
   */
  private handlePrint(): void {
    return this.safeExecute("handlePrint", StrategyErrorType.EVENT_HANDLING, () => {
      this.log("Print event detected, possible screenshot attempt")

      // Publish screenshot attempt event
      if (this.mediator) {
        this.showScreenshotNotification()
      }
    })
  }

  /**
   * Handle beforeprint event - prepare for print/screenshot
   */
  private handleBeforePrint(): void {
    return this.safeExecute("handleBeforePrint", StrategyErrorType.EVENT_HANDLING, () => {
      this.log("BeforePrint event detected, possible screenshot attempt")

      // Publish screenshot attempt event
      if (this.mediator) {
        this.showScreenshotNotification()
      }
    })
  }

  /**
   * Handle fullscreen change event - detect entering fullscreen
   */
  private handleFullscreenChange(): void {
    return this.safeExecute("handleFullscreenChange", StrategyErrorType.EVENT_HANDLING, () => {
      if (!this.options.preventFullscreen) return

      // Check if we're in fullscreen mode
      const isInFullscreen =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement

      if (isInFullscreen) {
        this.log("Fullscreen mode detected, exiting fullscreen")

        // Exit fullscreen mode
        this.exitFullscreen()

        // Show notification
        this.showFullscreenNotification()

        // Call custom handler if provided
        if (this.customHandler) {
          this.customHandler(new Event("fullscreenchange"))
        }
      }
    })
  }

  /**
   * Exit fullscreen mode if currently in fullscreen
   */
  private exitFullscreen(): void {
    return this.safeExecute("exitFullscreen", StrategyErrorType.APPLICATION, () => {
      if (!isBrowser()) return

      // Check if document is active and has a fullscreen element before attempting to exit
      try {
        // Only attempt to exit if we're actually in fullscreen mode
        const isInFullscreen =
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement

        if (isInFullscreen) {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch((err) => {
              // Silently catch errors during exit fullscreen
              this.log("Error exiting fullscreen:", err.message)
            })
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen()
          } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen()
          } else if (document.msExitFullscreen) {
            document.msExitFullscreen()
          }

          this.log("Exited fullscreen mode")
        } else {
          this.log("Not in fullscreen mode, no need to exit")
        }
      } catch (error) {
        this.error("Error checking fullscreen state:", error)
      }
    })
  }

  /**
   * Show a notification that fullscreen mode is disabled
   */
  private showScreenshotNotification(): void {
    return this.safeExecute("showScreenshotNotification", StrategyErrorType.APPLICATION, () => {
      if (!isBrowser() || !this.mediator) return

      // Publish overlay shown event through the mediator
      this.mediator.publish({
        type: ProtectionEventType.OVERLAY_SHOWN,
        source: this.STRATEGY_NAME,
        timestamp: Date.now(),
        data: {
          strategyName: this.STRATEGY_NAME,
          overlayType: "screenshot_notification",
          options: {
            ...this.options.overlayOptions,
            blockEvents: false, // Don't block events, just show a notification
            autoRestore: true,
          },
          priority: 5,
          duration: 3000, // Show for 3 seconds
        },
      })

      this.log("Showed screenshot disabled notification")
    })
  }

  /**
   * Show a notification that fullscreen mode is disabled
   */
  private showFullscreenNotification(): void {
    return this.safeExecute("showFullscreenNotification", StrategyErrorType.APPLICATION, () => {
      if (!isBrowser() || !this.mediator) return

      // Publish overlay shown event through the mediator
      this.mediator.publish({
        type: ProtectionEventType.OVERLAY_SHOWN,
        source: this.STRATEGY_NAME,
        timestamp: Date.now(),
        data: {
          strategyName: this.STRATEGY_NAME,
          overlayType: "fullscreen_notification",
          options: {
            ...this.options.overlayOptions,
            title: "Fullscreen Disabled",
            message: this.options.fullscreenMessage || "Fullscreen mode is disabled for security reasons",
            blockEvents: false, // Don't block events, just show a notification
            autoRestore: true,
          },
          priority: 5,
          duration: 3000, // Show for 3 seconds
        },
      })

      this.log("Showed fullscreen disabled notification")
    })
  }

  /**
   * Apply screenshot protection
   */
  public apply(): void {
    return this.safeExecute("apply", StrategyErrorType.APPLICATION, () => {
      if (this.isAppliedFlag) {
        this.log("Protection already applied")
        return
      }

      if (isBrowser()) {
        // Use both keydown and keyup to ensure we catch all PrintScreen events
        this.registerEvent(document, "keydown", this.keydownHandler as EventListener, {
          capture: true,
          priority: 10,
        })

        this.registerEvent(document, "keyup", this.keyupHandler as EventListener, {
          capture: true,
          priority: 10,
        })

        // Add window blur/focus detection
        this.registerEvent(window, "blur", this.blurHandler as EventListener, { priority: 10 })
        this.registerEvent(window, "focus", this.focusHandler as EventListener, { priority: 10 })

        // Add visibility change detection
        this.registerEvent(document, "visibilitychange", this.visibilityHandler as EventListener, { priority: 10 })

        // Add print event detection if supported
        if (isPrintSupported()) {
          this.registerEvent(window, "afterprint", this.printHandler as EventListener, { priority: 10 })
        }

        // Add beforeprint event detection if supported
        if (isBeforePrintSupported()) {
          this.registerEvent(window, "beforeprint", this.beforePrintHandler as EventListener, { priority: 10 })
        }

        // Add fullscreen change event listeners if preventing fullscreen
        if (this.options.preventFullscreen) {
          this.registerEvent(document, "fullscreenchange", this.fullscreenChangeHandler as EventListener, {
            priority: 10,
          })
          this.registerEvent(document, "webkitfullscreenchange", this.fullscreenChangeHandler as EventListener, {
            priority: 10,
          })
          this.registerEvent(document, "mozfullscreenchange", this.fullscreenChangeHandler as EventListener, {
            priority: 10,
          })
          this.registerEvent(document, "MSFullscreenChange", this.fullscreenChangeHandler as EventListener, {
            priority: 10,
          })

          // Use a longer delay to ensure the document is fully active
          setTimeout(() => {
            // Use setTimeout to ensure the document is ready and active
            this.exitFullscreen()
          }, 500) // Increased from 0 to 500ms
        }

        this.isAppliedFlag = true

        this.log("Screenshot protection applied", {
          printSupported: isPrintSupported(),
          beforePrintSupported: isBeforePrintSupported(),
          preventFullscreen: this.options.preventFullscreen,
          registeredEvents: this.eventIds.length,
        })
      }
    })
  }

  /**
   * Remove screenshot protection
   */
  public remove(): void {
    return this.safeExecute("remove", StrategyErrorType.REMOVAL, () => {
      if (!this.isAppliedFlag) {
        this.log("Protection not applied")
        return
      }

      if (isBrowser()) {
        // First attempt - remove by owner using the parent class method
        this.removeEventsByOwner()

        // Second attempt - try direct DOM removal as fallback
        try {
          document.removeEventListener("keydown", this.keydownHandler as EventListener, { capture: true })
          document.removeEventListener("keyup", this.keyupHandler as EventListener, { capture: true })
          window.removeEventListener("blur", this.blurHandler as EventListener)
          window.removeEventListener("focus", this.focusHandler as EventListener)
          document.removeEventListener("visibilitychange", this.visibilityHandler as EventListener)

          if (isPrintSupported()) {
            window.removeEventListener("afterprint", this.printHandler as EventListener)
          }

          if (isBeforePrintSupported()) {
            window.removeEventListener("beforeprint", this.beforePrintHandler as EventListener)
          }

          if (this.options.preventFullscreen) {
            document.removeEventListener("fullscreenchange", this.fullscreenChangeHandler as EventListener)
            document.removeEventListener("webkitfullscreenchange", this.fullscreenChangeHandler as EventListener)
            document.removeEventListener("mozfullscreenchange", this.fullscreenChangeHandler as EventListener)
            document.removeEventListener("MSFullscreenChange", this.fullscreenChangeHandler as EventListener)
          }

          this.log("Removed events via direct DOM API")
        } catch (domError) {
          // Ignore errors in direct DOM removal
          this.error("Error in fallback DOM removal:", domError)
        }

        // Clear any pending timeout using timeoutManager
        timeoutManager.clearTimeout(`${this.STRATEGY_NAME}-overlay`)

        // Clear tracked event IDs (parent class method will do this too, but being explicit)
        this.eventIds = []
        this.isAppliedFlag = false

        this.log("Screenshot protection removed")
      }
    })
  }

  /**
   * Update screenshot options
   * @param options New screenshot options
   */
  public updateOptions(options: Record<string, unknown>): void {
    return this.safeExecute("updateOptions", StrategyErrorType.OPTION_UPDATE, () => {
      this.log("Updating options", options)

      const typedOptions = options as Partial<ScreenshotOptions>
      const wasPreventingFullscreen = this.options.preventFullscreen

      this.options = {
        ...this.options,
        ...typedOptions,
      }

      // If fullscreen prevention was toggled, we need to update event listeners
      if (this.isAppliedFlag && wasPreventingFullscreen !== this.options.preventFullscreen) {
        if (this.options.preventFullscreen) {
          // Add fullscreen event listeners
          this.registerEvent(document, "fullscreenchange", this.fullscreenChangeHandler as EventListener, {
            priority: 10,
          })
          this.registerEvent(document, "webkitfullscreenchange", this.fullscreenChangeHandler as EventListener, {
            priority: 10,
          })
          this.registerEvent(document, "mozfullscreenchange", this.fullscreenChangeHandler as EventListener, {
            priority: 10,
          })
          this.registerEvent(document, "MSFullscreenChange", this.fullscreenChangeHandler as EventListener, {
            priority: 10,
          })

          // Exit fullscreen if already in fullscreen mode
          this.exitFullscreen()

          this.log("Added fullscreen protection")
        } else {
          // If we're removing fullscreen prevention while protection is active,
          // it's safest to remove all event listeners and reapply the ones we still need
          const wasApplied = this.isAppliedFlag
          this.remove()

          if (wasApplied) {
            this.apply()
          }

          this.log("Removed fullscreen protection and reapplied other protections")
        }
      }

      // Handle categories if present
      if (options.categories !== undefined && Array.isArray(options.categories)) {
        this.categories = options.categories as ShortcutCategory[]
        this.log("Updated shortcut categories:", this.categories)
      }

      // Update timeoutManager debug mode if our debug mode changed
      if (options.debugMode !== undefined) {
        timeoutManager.setDebugMode(!!options.debugMode)
      }
    })
  }

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  public setDebugMode(enabled: boolean): void {
    super.setDebugMode(enabled)

    // Update timeoutManager debug mode
    timeoutManager.setDebugMode(enabled)
  }
}