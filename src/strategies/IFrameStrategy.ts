import type { FrameEmbeddingOptions, CustomEventHandlers } from "../types"
import { isBrowser } from "../utils/environment"
import { intervalManager } from "../utils/intervalManager"
import { AbstractStrategy, StrategyErrorType } from "./AbstractStrategy"
import { ProtectionEventType } from "../core/mediator/protection-event"

/**
 * Strategy for preventing content from being embedded in external iframes
 */
export class FrameEmbeddingProtectionStrategy extends AbstractStrategy {
  private options: FrameEmbeddingOptions
  private targetElement: HTMLElement | null = null
  private customHandler?: CustomEventHandlers["onFrameEmbeddingDetected"]
  private isEmbedded = false
  private isExternalFrame = false
  private intervalId: number | null = null
  private taskId: string | null = null
  private parentDomain: string | null = null

  /**
   * Create a new FrameEmbeddingProtectionStrategy
   * @param options Configuration options
   * @param targetElement Element containing sensitive content to protect
   * @param customHandler Optional custom handler for frame embedding detection
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(
    options?: FrameEmbeddingOptions,
    targetElement: HTMLElement | null = null,
    customHandler?: CustomEventHandlers["onFrameEmbeddingDetected"],
    debugMode = false,
  ) {
    super("FrameEmbeddingProtectionStrategy", debugMode)

    this.options = {
      showOverlay: true,
      overlayOptions: {
        title: "Embedding Not Allowed",
        message: "This content cannot be displayed in an embedded frame.",
        secondaryMessage: "Please visit the original website to view this content.",
        textColor: "white",
        backgroundColor: "rgba(220, 38, 38, 0.9)", // Red with opacity
      },
      hideContent: true,
      allowedDomains: [],
      blockAllFrames: false,
      ...options,
    }
    this.targetElement = targetElement
    this.customHandler = customHandler

    this.log("Initialized with options:", {
      allowedDomains: this.options.allowedDomains,
      blockAllFrames: this.options.blockAllFrames,
    })
  }

  /**
   * Check if the page is embedded in an iframe
   */
  private checkIfEmbedded(): boolean {
    return (
      this.safeExecute("checkIfEmbedded", StrategyErrorType.APPLICATION, () => {
        if (!isBrowser()) return false

        // Check if the page is in an iframe
        this.isEmbedded = window.self !== window.top

        if (this.isEmbedded) {
          // Check if it's an external iframe (cross-origin)
          try {
            // If we can access parent.location.hostname, it's same-origin
            const parentHostname = window.parent.location.hostname
            const currentHostname = window.location.hostname
            this.parentDomain = parentHostname

            this.isExternalFrame = parentHostname !== currentHostname

            // Check if the parent domain is in the allowed domains list
            if (this.isExternalFrame && this.options.allowedDomains && this.options.allowedDomains.length > 0) {
              this.isExternalFrame = !this.options.allowedDomains.includes(parentHostname)
            }

            this.log(`Embedded in iframe. Parent: ${parentHostname}, Current: ${currentHostname}`)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (e) {
            // If we can't access parent.location, it's definitely cross-origin
            this.isExternalFrame = true
            this.parentDomain = null
            this.log("Embedded in cross-origin iframe (security exception)")
          }

          // If blockAllFrames is true, treat all frames as external
          if (this.options.blockAllFrames) {
            this.isExternalFrame = true
            this.log("Blocking all frames regardless of origin")
          }
        }

        return this.isEmbedded && this.isExternalFrame
      }) || false
    )
  }

  /**
   * Publish frame embedding detection event
   */
  private publishFrameEmbeddingEvent(): void {
    return this.safeExecute("publishFrameEmbeddingEvent", StrategyErrorType.APPLICATION, () => {
      if (!isBrowser() || !this.mediator) return

      // Publish frame embedding detected event
      this.mediator.publish({
        type: ProtectionEventType.FRAME_EMBEDDING_DETECTED,
        source: this.STRATEGY_NAME,
        timestamp: Date.now(),
        data: {
          isEmbedded: this.isEmbedded,
          isExternalFrame: this.isExternalFrame,
          parentDomain: this.parentDomain || undefined,
          targetElement: this.targetElement,
          showOverlay: this.options.showOverlay,
          hideContent: this.options.hideContent,
          overlayOptions: this.options.overlayOptions,
        },
      })

      this.log("Published FRAME_EMBEDDING_DETECTED event")

      // Call custom handler if provided
      if (this.customHandler) {
        this.customHandler(this.isEmbedded, this.isExternalFrame)
      }
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

      // Check if embedded in an external iframe
      const isExternallyEmbedded = this.checkIfEmbedded()

      if (isExternallyEmbedded) {
        this.publishFrameEmbeddingEvent()
      }

      // Register with IntervalManager for periodic checks
      try {
        this.taskId = intervalManager.registerTask(
          "iframe-protection",
          () =>
            this.safeExecute("intervalTask", StrategyErrorType.APPLICATION, () => {
              const currentlyEmbedded = this.checkIfEmbedded()

              if (currentlyEmbedded) {
                // Publish event to check if we need to apply protection
                this.publishFrameEmbeddingEvent()
              }
            }),
          2000, // Use a consistent 2 second interval
        )

        if (!this.taskId) {
          this.handleError(
            StrategyErrorType.APPLICATION,
            "Failed to register interval task",
            new Error("Task registration returned empty ID"),
          )
        }
      } catch (intervalError) {
        this.handleError(StrategyErrorType.APPLICATION, "Error registering interval task", intervalError)

        // Try to use a fallback interval method if IntervalManager fails
        this.intervalId = window.setInterval(() => {
          this.safeExecute("fallbackInterval", StrategyErrorType.APPLICATION, () => {
            const currentlyEmbedded = this.checkIfEmbedded()

            if (currentlyEmbedded) {
              this.publishFrameEmbeddingEvent()
            }
          })
        }, 2000) as unknown as number

        this.log("Using fallback interval method after IntervalManager failure")
      }

      this.isAppliedFlag = true
      this.log("Protection applied")
    })
  }

  /**
   * Remove the protection strategy
   */
  public remove(): void {
    return this.safeExecute("remove", StrategyErrorType.REMOVAL, () => {
      if (!this.isAppliedFlag) {
        this.log("Protection not applied")
        return
      }

      // Clear interval via IntervalManager
      if (this.taskId !== null) {
        intervalManager.unregisterTask(this.taskId)
        this.taskId = null
        this.log("Interval task unregistered")
      }

      // Also clear the old interval for backwards compatibility or if both are used
      if (this.intervalId !== null) {
        window.clearInterval(this.intervalId)
        this.intervalId = null
        this.log("Legacy interval cleared")
      }

      // Call parent class remove method to handle event cleanup
      super.remove()

      // Publish STRATEGY_REMOVED event
      if (this.mediator) {
        this.mediator.publish({
          type: ProtectionEventType.STRATEGY_REMOVED,
          source: this.STRATEGY_NAME,
          timestamp: Date.now(),
          data: {
            strategyName: this.STRATEGY_NAME,
            reason: "strategy_removed",
          },
        })
      }

      // Remove meta tags if we added them
      if (isBrowser()) {
        const xfoMeta = document.querySelector('meta[http-equiv="X-Frame-Options"]')
        if (xfoMeta && xfoMeta.parentNode) {
          xfoMeta.parentNode.removeChild(xfoMeta)
        }

        const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
        if (cspMeta && cspMeta.parentNode) {
          cspMeta.parentNode.removeChild(cspMeta)
        }

        this.log("Removed meta tags")
      }

      // Always reset state
      this.isAppliedFlag = false
      this.isEmbedded = false
      this.isExternalFrame = false
      this.parentDomain = null
      this.log("Protection removed")
    })
  }

  /**
   * Update strategy options
   * @param options Options to update
   */
  public updateOptions(options: Record<string, unknown>): void {
    return this.safeExecute("updateOptions", StrategyErrorType.OPTION_UPDATE, () => {
      if (!options) {
        this.handleError(
          StrategyErrorType.OPTION_UPDATE,
          "Invalid options in updateOptions",
          new Error("Options is null or undefined"),
        )
        return
      }

      const typedOptions = options as Partial<FrameEmbeddingOptions>
      this.log("Updating options", typedOptions)

      // Store previous options for comparison
      const previousOptions = { ...this.options }

      this.options = {
        ...this.options,
        ...typedOptions,
      }

      // Check if any critical options changed that would require reapplying protection
      const criticalOptionsChanged =
        previousOptions.blockAllFrames !== this.options.blockAllFrames ||
        JSON.stringify(previousOptions.allowedDomains) !== JSON.stringify(this.options.allowedDomains)

      if (
        this.isAppliedFlag &&
        (criticalOptionsChanged ||
          typedOptions.overlayOptions?.title ||
          typedOptions.overlayOptions?.message ||
          typedOptions.overlayOptions?.backgroundColor)
      ) {
        // Re-check if we're embedded and update protection if needed
        const isExternallyEmbedded = this.checkIfEmbedded()

        if (isExternallyEmbedded) {
          // Publish updated event
          this.publishFrameEmbeddingEvent()
          this.log("Reapplied frame protection with updated options")
        }
      }
    })
  }

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  public setDebugMode(enabled: boolean): void {
    super.setDebugMode(enabled)
  }
}