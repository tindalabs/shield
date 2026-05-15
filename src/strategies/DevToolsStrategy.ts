import { isBrowser, getBrowser } from "../utils/environment"
import type { CustomEventHandlers, DevToolsOptions } from "../types"
import { intervalManager } from "../utils/intervalManager"
import { AbstractStrategy, StrategyErrorType } from "./AbstractStrategy"
import { DevToolsDetectorManager } from "../utils/detectors/devToolsDetectorManager"
import type { DetectorType } from "../utils/detectors/devToolsDetectorManager"
import { ProtectionEventType } from "../core/mediator/protection-event"
import { timeoutManager } from "../utils/timeoutManager"

/**
 * Strategy for detecting and responding to DevTools usage
 */
export class DevToolsStrategy extends AbstractStrategy {
  private intervalId: number | null = null
  private taskId: string | null = null
  private initTimeoutId: string | null = null
  private customHandler?: CustomEventHandlers["onDevToolsOpen"]
  private isDevToolsOpen = false
  private targetElement: HTMLElement | null = null
  private options: DevToolsOptions
  private browserInfo: { name: string; version: string }

  // Detector manager
  private detectorManager: DevToolsDetectorManager | null = null

  /**
   * Create a new DevToolsStrategy
   * @param options Options for customizing the DevTools protection
   * @param targetElement Element containing sensitive content
   * @param customHandler Optional custom handler for DevTools detection
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(
    options?: DevToolsOptions,
    targetElement: HTMLElement | null = null,
    customHandler?: CustomEventHandlers["onDevToolsOpen"],
    debugMode = false,
  ) {
    super("DevToolsStrategy", debugMode)

    this.options = {
      overlayOptions: {
        title: "Developer Tools Detected",
        message: "For security reasons, this content is not available while developer tools are open.",
        secondaryMessage: "Please close developer tools to continue viewing this content.",
        textColor: "white",
        backgroundColor: "rgba(255, 0, 0, 0.7)",
      },
      showOverlay: true,
      checkFrequency: 1000,
      hideContent: false,
      ...options,
    }
    this.targetElement = targetElement
    this.customHandler = customHandler
    this.browserInfo = getBrowser()

    this.log("Initialized with checkFrequency:", this.options.checkFrequency)
    this.log("Detected browser:", this.browserInfo.name, this.browserInfo.version)

    // Initialize the detector manager with a slight delay using timeoutManager
    this.initTimeoutId = timeoutManager.setTimeout(
      `${this.STRATEGY_NAME}-init`,
      () => {
        this.initDetectorManager()
        this.initTimeoutId = null
      },
      200
    )
  }

  /**
   * Initialize the detector manager
   */
  private initDetectorManager(): void {
    return this.safeExecute("initDetectorManager", StrategyErrorType.INITIALIZATION, () => {
      if (!isBrowser()) return

      try {
        // Common callback for detector manager
        const onDevToolsChange = (isOpen: boolean): void => {
          this.handleDevToolsStateChange(isOpen)
        }

        // Get specific detector types if provided in options
        const detectorTypes: DetectorType[] | undefined = this.options.detectorTypes as DetectorType[] | undefined

        // Initialize the detector manager
        this.detectorManager = new DevToolsDetectorManager({
          onDevToolsChange,
          debugMode: this.debugMode,
          enabledDetectors: detectorTypes,
          checkInterval: this.options.checkFrequency,
          delayInitialCheck: true,
          initialCheckDelay: 1500, // Longer delay for initial check
        })

        this.log("Detector manager initialized")
      } catch (error) {
        this.handleError(StrategyErrorType.INITIALIZATION, "Failed to initialize detector manager", error)

        // Log more details about the error to help with troubleshooting
        if (this.debugMode) {
          console.error("Detector manager initialization error details:", error)
        }
      }
    })
  }

  /**
   * Handle DevTools state changes from any detection method
   */
  private handleDevToolsStateChange(isOpen: boolean): void {
    return this.safeExecute("handleDevToolsStateChange", StrategyErrorType.APPLICATION, () => {
      // Only take action if state has changed
      if (isOpen !== this.isDevToolsOpen) {
        this.isDevToolsOpen = isOpen;
  
        this.log(`DevTools state changed: ${isOpen ? "open" : "closed"}`);
  
        // Publish the specific DevTools event through the mediator
        if (this.mediator) {
          this.mediator.publish({
            type: ProtectionEventType.DEVTOOLS_STATE_CHANGE,
            source: this.STRATEGY_NAME,
            timestamp: Date.now(),
            data: {
              isOpen,
              showOverlay: this.options.showOverlay,
              overlayOptions: this.options.overlayOptions,
              hideContent: this.options.hideContent,
              target: this.targetElement,
            },
          });
        }
  
        // Call custom handler if provided
        if (this.customHandler) {
          this.customHandler(isOpen);
        }
      }
    });
  }

  /**
   * Start monitoring for DevTools usage
   */
  private startMonitoring(): void {
    return this.safeExecute("startMonitoring", StrategyErrorType.APPLICATION, () => {
      if (typeof window === "undefined") return

      this.log("Starting DevTools monitoring")

      // Register with IntervalManager for periodic checks
      this.taskId = intervalManager.registerTask(
        "devtools-detection",
        () =>
          this.safeExecute("intervalTask", StrategyErrorType.APPLICATION, () => {
            // Use the detector manager
            if (this.detectorManager) {
              this.detectorManager.checkDevTools()
            }
          }),
        this.options.checkFrequency as number,
      )
    })
  }

  /**
   * Apply the protection strategy
   */
  public apply(): void {
    return this.safeExecute("apply", StrategyErrorType.APPLICATION, () => {
      if (this.isAppliedFlag) {
        this.log("Protection already applied")
        return
      }

      this.startMonitoring()
      this.isAppliedFlag = true
      this.log("Protection applied")
    })
  }

  /**
   * Remove the protection strategy
   * Override the base implementation to handle additional cleanup
   */
  public remove(): void {
    return this.safeExecute("remove", StrategyErrorType.REMOVAL, () => {
      if (!this.isAppliedFlag) {
        this.log("Protection not applied")
        return
      }

      // Clean up the detector manager
      if (this.detectorManager) {
        this.detectorManager.dispose()
        this.detectorManager = null
      }

      // Clear initialization timeout if it exists
      if (this.initTimeoutId !== null) {
        timeoutManager.clearTimeout(this.initTimeoutId)
        this.initTimeoutId = null
      }

      // Clear interval via IntervalManager
      if (this.taskId !== null) {
        intervalManager.unregisterTask(this.taskId)
        this.taskId = null
        this.log("Interval task unregistered")
      }

      // Also clear the old interval for backwards compatibility or if both are used
      if (this.intervalId !== null && typeof window !== "undefined") {
        window.clearInterval(this.intervalId)
        this.intervalId = null
        this.log("Legacy interval cleared")
      }

      // Call the parent class remove method to handle event cleanup
      super.remove()

      // If DevTools is currently open, publish events to restore content and remove overlay
      if (this.isDevToolsOpen && this.mediator) {
        if (this.options.hideContent) {
          this.mediator.publish({
            type: ProtectionEventType.CONTENT_RESTORED,
            source: this.STRATEGY_NAME,
            timestamp: Date.now(),
            data: {
              strategyName: this.STRATEGY_NAME,
              targetElement: this.targetElement,
            },
          })
        }

        if (this.options.showOverlay) {
          this.mediator.publish({
            type: ProtectionEventType.OVERLAY_REMOVED,
            source: this.STRATEGY_NAME,
            timestamp: Date.now(),
            data: {
              strategyName: this.STRATEGY_NAME,
              overlayType: "devtools",
              reason: "strategy_removed",
            },
          })
        }
      }

      this.isAppliedFlag = false
      this.isDevToolsOpen = false

      this.log("Protection removed")
    })
  }

  /**
   * Update DevTools protection options
   * @param options New options
   */
  public updateOptions(options: Record<string, unknown>): void {
    return this.safeExecute("updateOptions", StrategyErrorType.OPTION_UPDATE, () => {
      const typedOptions = options as Partial<DevToolsOptions>
      this.log("Updating options", typedOptions)

      // Store previous options for comparison
      const previousOptions = { ...this.options }

      this.options = {
        ...this.options,
        ...typedOptions,
      }

      // If protection is already applied, update the overlay if needed
      if (this.isAppliedFlag && this.isDevToolsOpen && this.mediator) {
        // Check if any visual options changed
        const visualOptionsChanged =
          previousOptions.overlayOptions?.title !== this.options.overlayOptions?.title ||
          previousOptions.overlayOptions?.message !== this.options.overlayOptions?.message ||
          previousOptions.overlayOptions?.secondaryMessage !== this.options.overlayOptions?.secondaryMessage ||
          previousOptions.overlayOptions?.backgroundColor !== this.options.overlayOptions?.backgroundColor ||
          previousOptions.overlayOptions?.textColor !== this.options.overlayOptions?.textColor

        if (visualOptionsChanged) {
          // Update overlay through mediator
          if (this.options.showOverlay) {
            this.mediator.publish({
              type: ProtectionEventType.OVERLAY_SHOWN,
              source: this.STRATEGY_NAME,
              timestamp: Date.now(),
              data: {
                strategyName: this.STRATEGY_NAME,
                overlayType: "devtools",
                options: {
                  ...this.options.overlayOptions,
                  blockEvents: true,
                  autoRestore: true,
                },
                priority: 10,
              },
            })
          }

          // Update content through mediator
          if (this.options.hideContent) {
            this.mediator.publish({
              type: ProtectionEventType.CONTENT_HIDDEN,
              source: this.STRATEGY_NAME,
              timestamp: Date.now(),
              data: {
                strategyName: this.STRATEGY_NAME,
                reason: "options_updated",
                options: {
                  title: this.options.overlayOptions?.title,
                  message: this.options.overlayOptions?.message,
                  secondaryMessage: this.options.overlayOptions?.secondaryMessage,
                  textColor: "black",
                  backgroundColor: "rgba(0, 0, 0, 0.05)",
                },
                targetElement: this.targetElement,
                priority: 10,
              },
            })
          }

          this.log("Reapplied protection with updated visual options")
        }
      }

      // Update check frequency if it changed
      if (
        typedOptions.checkFrequency &&
        this.taskId !== null &&
        previousOptions.checkFrequency !== typedOptions.checkFrequency
      ) {
        // Unregister and re-register with new frequency
        intervalManager.unregisterTask(this.taskId)

        this.taskId = intervalManager.registerTask(
          "devtools-detection",
          () =>
            this.safeExecute("intervalTask", StrategyErrorType.APPLICATION, () => {
              // Use detector manager
              if (this.detectorManager) {
                this.detectorManager.checkDevTools()
              }
            }),
          this.options.checkFrequency as number,
        )

        this.log(`Check frequency updated to ${this.options.checkFrequency}ms`)
      }

      // If detector types changed, reinitialize the detector manager
      if (typedOptions.detectorTypes && this.detectorManager) {
        this.detectorManager.dispose()
        this.initDetectorManager()
        this.log("Detector manager reinitialized with new detector types")
      }
    })
  }

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  public setDebugMode(enabled: boolean): void {
    return this.safeExecute("setDebugMode", StrategyErrorType.OPTION_UPDATE, () => {
      super.setDebugMode(enabled)

      // Update debug mode for the detector manager
      if (this.detectorManager) {
        this.detectorManager.setDebugMode(enabled)
      }
      
      // Update debug mode for timeoutManager
      timeoutManager.setDebugMode(enabled)
    })
  }
}