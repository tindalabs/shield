import type { BrowserExtensionOptions, CustomEventHandlers, ExtensionConfig } from "../types"
import { isBrowser } from "../utils/environment"
import defaultConfig from "../config/default-extensions-config.json"
import { intervalManager } from "../utils/intervalManager"
import { AbstractStrategy, StrategyErrorType } from "./AbstractStrategy"
import { ProtectionEventType } from "../core/mediator/protection-event"

/**
 * Strategy for detecting and responding to browser extensions that might scrape content
 */
export class BrowserExtensionDetectionStrategy extends AbstractStrategy {
  private intervalId: number | null = null
  private taskId: string | null = null
  private options: BrowserExtensionOptions
  private extensionsConfig: Record<string, ExtensionConfig> = {}
  private detectedExtensions: Set<string> = new Set()
  private targetElement: HTMLElement | null = null
  private configLoaded = false
  private configLoadPromise: Promise<void> | null = null
  private customHandler?: CustomEventHandlers["onExtensionDetected"]
  private defaultConfigPath = "/src/data/default-extensions-config.json"

  /**
   * Create a new BrowserExtensionDetectionStrategy
   * @param options Configuration options
   * @param targetElement Element containing sensitive content to protect
   * @param customHandler Optional custom handler for extension detection
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(
    options?: BrowserExtensionOptions,
    targetElement: HTMLElement | null = null,
    customHandler?: CustomEventHandlers["onExtensionDetected"],
    debugMode = false,
  ) {
    super("BrowserExtensionDetectionStrategy", debugMode)

    this.options = {
      showOverlay: true,
      detectionInterval: 5000, // Check every 5 seconds
      overlayOptions: {
        title: "Content Protection Active",
        message: "Please disable content scraping extensions to view this content.",
        backgroundColor: "rgba(220, 38, 38, 0.9)", // Red with opacity
        textColor: "white",
      },
      hideContent: true,
      ...options,
    }
    this.targetElement = targetElement
    this.customHandler = customHandler

    this.log("Initialized with detection interval:", this.options.detectionInterval)

    // If inline config is provided, use it immediately
    if (this.options.extensionsConfig) {
      this.extensionsConfig = this.options.extensionsConfig
      this.configLoaded = true
      this.log("Using provided inline extensions config")
    }
  }

  /**
   * Load extension configuration from a JSON file
   */
  private async loadConfiguration(): Promise<void> {
    return this.safeExecuteAsync("loadConfiguration", StrategyErrorType.INITIALIZATION, async () => {
      if (this.configLoaded) return

      // If we're already loading, wait for that to complete
      if (this.configLoadPromise) {
        return this.configLoadPromise
      }

      // eslint-disable-next-line no-async-promise-executor
      this.configLoadPromise = new Promise<void>(async (resolve) => {
        // If a custom config path is provided, use it
        if (this.options.configPath) {
          this.log(`Loading configuration from ${this.options.configPath}`)

          try {
            const response = await fetch(this.options.configPath)
            if (!response.ok) {
              throw new Error(`Failed to load configuration: ${response.statusText}`)
            }

            const config = await response.json()

            // Validate the configuration
            if (!config.extensions || typeof config.extensions !== "object") {
              throw new Error('Invalid configuration format: missing or invalid "extensions" object')
            }

            this.extensionsConfig = config.extensions
            this.configLoaded = true

            this.log(`Loaded configuration with ${Object.keys(this.extensionsConfig).length} extensions`)
          } catch (fetchError) {
            this.handleError(StrategyErrorType.INITIALIZATION, "Error fetching configuration", fetchError)
            // Fall back to default configuration
            this.extensionsConfig = defaultConfig.extensions
            this.configLoaded = true
            this.log("Falling back to default configuration after fetch error")
          }
        } else {
          // Use the imported default configuration
          this.extensionsConfig = defaultConfig.extensions
          this.configLoaded = true

          this.log(`Using default configuration with ${Object.keys(this.extensionsConfig).length} extensions`)
        }

        resolve()
      })

      return this.configLoadPromise
    })
  }

  /**
   * Apply the protection strategy
   */
  public async apply(): Promise<void> {
    return this.safeExecuteAsync("apply", StrategyErrorType.APPLICATION, async () => {
      if (this.isAppliedFlag) {
        this.log("Protection already applied")
        return
      }

      // Load configuration if not already loaded
      await this.loadConfiguration()

      // Run initial detection
      await this.runAllDetectionMethods()

      // Register with IntervalManager
      try {
        this.taskId = intervalManager.registerTask(
          "extension-detection",
          async () => {
            await this.runAllDetectionMethods()

            // Always check overlay state if we have detected extensions
            if (this.detectedExtensions.size > 0 && this.mediator) {
              // Publish event to check overlay state
              this.mediator.publish({
                type: ProtectionEventType.OVERLAY_RESTORED,
                source: this.STRATEGY_NAME,
                timestamp: Date.now(),
                data: {
                  strategyName: this.STRATEGY_NAME,
                  overlayType: "extension",
                  reason: "periodic_check",
                },
              })
            }
          },
          this.options.detectionInterval as number,
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
        this.intervalId = window.setInterval(async () => {
          await this.safeExecuteAsync("fallbackInterval", StrategyErrorType.APPLICATION, async () => {
            await this.runAllDetectionMethods()

            // Always check overlay state if we have detected extensions
            if (this.detectedExtensions.size > 0 && this.mediator) {
              // Publish event to check overlay state
              this.mediator.publish({
                type: ProtectionEventType.OVERLAY_RESTORED,
                source: this.STRATEGY_NAME,
                timestamp: Date.now(),
                data: {
                  strategyName: this.STRATEGY_NAME,
                  overlayType: "extension",
                  reason: "periodic_check",
                },
              })
            }
          })
        }, this.options.detectionInterval as number) as unknown as number
        this.log("Using fallback interval method after IntervalManager failure")
      }

      this.isAppliedFlag = true
      this.log("Protection applied with detection interval:", this.options.detectionInterval)
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

      // If extensions are currently detected, publish events to restore content and remove overlay
      if (this.detectedExtensions.size > 0 && this.mediator) {
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

      // Always reset state
      this.isAppliedFlag = false
      this.detectedExtensions.clear()
      this.log("Protection removed")
    })
  }

  /**
   * Run all detection methods to check for extensions
   */
  private async runAllDetectionMethods(): Promise<void> {
    return this.safeExecuteAsync("runAllDetectionMethods", StrategyErrorType.APPLICATION, async () => {
      this.log("Running detection methods")

      if (!this.configLoaded) {
        await this.loadConfiguration()
      }

      // Run each detection method
      await this.safeExecuteAsync("detectDOMInjections", StrategyErrorType.APPLICATION, async () => {
        await this.detectDOMInjections()
      })

      await this.safeExecute("checkJavaScriptSignatures", StrategyErrorType.APPLICATION, () => {
        this.checkJavaScriptSignatures()
      })
    })
  }

  /**
   * Detect DOM elements injected by extensions
   */
  private async detectDOMInjections(): Promise<void> {
    if (!isBrowser() || !document) return

    if (!this.extensionsConfig || Object.keys(this.extensionsConfig).length === 0) {
      this.log("No extension configuration available for DOM injection detection")
      return
    }

    for (const [extensionId, config] of Object.entries(this.extensionsConfig)) {
      if (
        !config ||
        !config.detectionMethods ||
        !config.detectionMethods.domSelectors ||
        config.detectionMethods.domSelectors.length === 0
      ) {
        continue
      }

      // Create a combined selector from all selectors for this extension
      const selector = config.detectionMethods.domSelectors.join(", ")

      try {
        const elements = document.querySelectorAll(selector)

        if (elements.length > 0) {
          this.handleDetection(extensionId, "dom-injection", {
            selector,
            count: elements.length,
            elements: Array.from(elements).map((el) => ({
              tagName: el.tagName,
              id: (el as HTMLElement).id || "",
              className: (el as HTMLElement).className || "",
            })),
          })
        }
      } catch (queryError) {
        this.handleError(
          StrategyErrorType.APPLICATION,
          `Error querying DOM for extension ${extensionId} with selector "${selector}"`,
          queryError,
        )
      }
    }
  }

  /**
   * Check for JavaScript signatures injected by extensions
   */
  private checkJavaScriptSignatures(): void {
    if (!isBrowser() || !window) return

    if (!this.extensionsConfig || Object.keys(this.extensionsConfig).length === 0) {
      this.log("No extension configuration available for JavaScript signature detection")
      return
    }

    for (const [extensionId, config] of Object.entries(this.extensionsConfig)) {
      if (
        !config ||
        !config.detectionMethods ||
        !config.detectionMethods.jsSignatures ||
        config.detectionMethods.jsSignatures.length === 0
      ) {
        continue
      }

      for (const signature of config.detectionMethods.jsSignatures) {
        if (!signature) continue

        // Check if the signature exists in the global scope
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exists = this.checkPropertyExists(window as any, signature)

        if (exists) {
          this.handleDetection(extensionId, "js-signature", {
            signature,
          })
        }
      }
    }
  }

  /**
   * Check if a property exists in an object, supporting dot notation
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private checkPropertyExists(obj: any, path: string): boolean {
    return (
      this.safeExecute("checkPropertyExists", StrategyErrorType.APPLICATION, () => {
        if (!obj || !path) return false

        const parts = path.split(".")
        let current = obj

        for (const part of parts) {
          if (!part) continue

          if (current === undefined || current === null) {
            return false
          }

          try {
            current = current[part]
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (e) {
            return false
          }
        }

        return current !== undefined
      }) || false
    )
  }

  /**
   * Handle detection of an extension
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleDetection(extensionId: string, detectionType: string, details: any): void {
    return this.safeExecute("handleDetection", StrategyErrorType.APPLICATION, () => {
      if (!extensionId) {
        this.handleError(
          StrategyErrorType.APPLICATION,
          "Invalid extension ID in handleDetection",
          new Error("Extension ID is empty or undefined"),
        )
        return
      }

      // Skip if already detected
      if (this.detectedExtensions.has(extensionId)) return

      // Add to detected extensions
      this.detectedExtensions.add(extensionId)

      const extensionConfig = this.extensionsConfig[extensionId] || {
        name: "Unknown Extension",
        risk: "medium" as const,
      }

      this.log(`Detected extension ${extensionConfig.name} (${extensionId}) via ${detectionType}`, details)

      // Call custom handler if provided
      if (this.customHandler) {
        this.safeExecute("customHandler", StrategyErrorType.APPLICATION, () => {
          if (this.customHandler) {
            this.customHandler(extensionId, extensionConfig.name, extensionConfig.risk as "low" | "medium" | "high")
          }
        })
      }

      // PUBLISH DETECTION EVENT
      if (this.mediator) {
        this.mediator.publish({
          type: ProtectionEventType.EXTENSION_DETECTED,
          source: this.STRATEGY_NAME,
          timestamp: Date.now(),
          data: {
            extension: extensionConfig,
            hideContent: this.options.hideContent,
            showOverlay: this.options.showOverlay,
            overlayOptions: this.options.overlayOptions,
            target: this.targetElement,
            priority: 8,
            reason: "extension_detected",
          },
        })

        this.log(`Published EXTENSION_DETECTED event for ${extensionConfig.name}`)
      }
    })
  }

  /**
   * Update options for the strategy
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

      const typedOptions = options as Partial<BrowserExtensionOptions>
      this.log("Updating options", typedOptions)

      // Store previous options for comparison
      const previousOptions = { ...this.options }

      // Update options
      this.options = {
        ...this.options,
        ...typedOptions,
      }

      // Handle extension config updates
      if (typedOptions.extensionsConfig) {
        this.extensionsConfig = typedOptions.extensionsConfig
        this.configLoaded = true
        this.log("Updated to use new inline extensions config")
      }

      // Handle config path updates
      if (typedOptions.configPath && this.isAppliedFlag) {
        // Check if the path actually changed
        if (typedOptions.configPath !== previousOptions.configPath) {
          // Reload configuration
          this.configLoaded = false
          this.loadConfiguration()
            .then(() => {
              // Re-run detection with new configuration
              this.runAllDetectionMethods()
            })
            .catch((detectionError) => {
              this.handleError(
                StrategyErrorType.OPTION_UPDATE,
                "Error running detection after config update",
                detectionError,
              )
            })
          this.log("Reloading configuration from new path:", typedOptions.configPath)
        }
      }

      // Update detection interval if it changed and we're using the IntervalManager
      if (
        typedOptions.detectionInterval &&
        this.taskId !== null &&
        this.isAppliedFlag &&
        typedOptions.detectionInterval !== previousOptions.detectionInterval
      ) {
        // Unregister and re-register with new frequency
        intervalManager.unregisterTask(this.taskId)

        this.taskId = intervalManager.registerTask(
          "extension-detection",
          async () => {
            await this.runAllDetectionMethods()

            // Always check overlay state if we have detected extensions
            if (this.detectedExtensions.size > 0 && this.mediator) {
              // Publish event to check overlay state
              this.mediator.publish({
                type: ProtectionEventType.OVERLAY_RESTORED,
                source: this.STRATEGY_NAME,
                timestamp: Date.now(),
                data: {
                  strategyName: this.STRATEGY_NAME,
                  overlayType: "extension",
                  reason: "periodic_check",
                },
              })
            }
          },
          typedOptions.detectionInterval as number,
        )

        this.log(`Detection interval updated to ${typedOptions.detectionInterval}ms`)
      }

      // If protection is already applied and we have detected extensions, update the overlay if needed
      if (this.isAppliedFlag && this.detectedExtensions.size > 0 && this.mediator) {
        // Check if any visual options changed
        const visualOptionsChanged =
          previousOptions.overlayOptions?.title !== this.options.overlayOptions?.title ||
          previousOptions.overlayOptions?.message !== this.options.overlayOptions?.message ||
          previousOptions.overlayOptions?.backgroundColor !== this.options.overlayOptions?.backgroundColor ||
          previousOptions.overlayOptions?.textColor !== this.options.overlayOptions?.textColor

        if (visualOptionsChanged) {
          // For each detected extension, republish the event with updated options
          for (const extensionId of this.detectedExtensions) {
            const extensionConfig = this.extensionsConfig[extensionId]
            if (extensionConfig && extensionConfig.risk === "high") {
              this.mediator.publish({
                type: ProtectionEventType.EXTENSION_DETECTED,
                source: this.STRATEGY_NAME,
                timestamp: Date.now(),
                data: {
                  extension: extensionConfig,
                  hideContent: this.options.hideContent,
                  showOverlay: this.options.showOverlay,
                  overlayOptions: this.options.overlayOptions,
                  target: this.targetElement,
                  priority: 8,
                  reason: "options_updated",
                },
              })
              break // Just need to update once
            }
          }
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