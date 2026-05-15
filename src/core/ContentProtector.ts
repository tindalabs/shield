import type { ContentProtectionOptions, ProtectionStrategy } from "../types"
import {
  KeyboardStrategy,
  PrintStrategy,
  ContextMenuStrategy,
  WatermarkStrategy,
  SelectionStrategy,
  DevToolsStrategy,
  ScreenshotStrategy,
  BrowserExtensionDetectionStrategy,
  FrameEmbeddingProtectionStrategy,
} from "../strategies"
import { SecurityOverlayManager } from "../utils/securityOverlayManager"
import { intervalManager } from "../utils/intervalManager"
import { eventManager } from "../utils/eventManager"
import { ContentProtectionMediator } from "./mediator/ContentProtectionMediator"
import { HandlerRegistry } from "./mediator/handlers/eventHandlerRegistry"
import { ProtectedContentManager } from "../utils/protectedContentManager"
import { SimpleLoggingService } from "../utils/logging/simple/SimpleLoggingService"

/**
 * Main class for protecting content from copying, screenshotting, and other extraction methods
 * Coordinates multiple protection strategies and manages their lifecycle
 */
export class ContentProtector {
  private options: ContentProtectionOptions
  private strategies: Map<string, ProtectionStrategy> = new Map()
  private isActive = false
  private overlayManager: SecurityOverlayManager
  private protectedContentManager: ProtectedContentManager
  private mediator: ContentProtectionMediator
  private handlerRegistry: HandlerRegistry
  private logger: SimpleLoggingService

  /**
   * Create a new ContentProtector instance
   * @param options Configuration options for content protection
   */
  constructor(options: ContentProtectionOptions = {}) {
    // Define default options
    const defaults: ContentProtectionOptions = {
      preventKeyboardShortcuts: true,
      preventContextMenu: true,
      preventPrinting: true,
      preventSelection: true,
      preventScreenshots: true,
      enableWatermark: false,
      preventDevTools: false,
      preventExtensions: false,
      preventEmbedding: false,
      debugMode: false,
    }

    // Merge defaults with provided options
    this.options = {
      ...defaults,
      ...options,
    }

    // Initialize logger
    this.logger = new SimpleLoggingService("ContentProtector", this.options.debugMode)

    // Normalize and set targetElement if not provided
    const resolveTargetElement = (t: unknown): HTMLElement | null => {
      if (typeof document === "undefined") return null

      // Already an element
      if (t instanceof HTMLElement) return t

      // CSS selector string
      if (typeof t === "string") {
        try {
          const el = document.querySelector(t)
          return el instanceof HTMLElement ? el : null
        } catch {
          return null
        }
      }

      // Vue 3 ref ({ value: HTMLElement }) or Vue component ($el) or DOM-like node
      if (t && typeof t === "object") {
        type MaybeRefOrComponent = { value?: unknown; $el?: unknown; nodeType?: unknown; nodeName?: unknown }
        const maybe = t as MaybeRefOrComponent

        if (maybe.value instanceof HTMLElement) return maybe.value
        if (maybe.$el instanceof HTMLElement) return maybe.$el
        if (maybe.nodeType === 1 && typeof maybe.nodeName === "string") return t as HTMLElement
      }

      return null
    }

    // Normalize provided targetElement, or default to document.body
    const normalizedTarget = resolveTargetElement(this.options.targetElement)
    if (normalizedTarget) {
      this.options.targetElement = normalizedTarget
    } else if (!this.options.targetElement && typeof document !== "undefined") {
      this.options.targetElement = document.body
    } else {
      // If user provided something invalid, clear it to avoid passing non-DOM objects to strategies
      if (this.options.targetElement) {
        this.logger = new SimpleLoggingService("ContentProtector", this.options.debugMode)
        this.logger.warn("Provided targetElement is not a DOM element - falling back to document.body if available")
        if (typeof document !== "undefined") this.options.targetElement = document.body
        else this.options.targetElement = undefined
      }
    }

    // Initialize the mediator
    this.mediator = new ContentProtectionMediator(this.options.debugMode)

    // Initialize the handler registry
    this.handlerRegistry = new HandlerRegistry(this.mediator, this.options.debugMode)

    // Initialize overlay manager
    this.overlayManager = new SecurityOverlayManager(this.options.debugMode)
    this.overlayManager.setMediator(this.mediator)

    // Initialize protected content manager
    this.protectedContentManager = new ProtectedContentManager(
      this.options.targetElement as HTMLElement,
      this.options.debugMode,
    )
    this.protectedContentManager.setMediator(this.mediator)

    // Wire content visibility callbacks from customHandlers (useful for Vue re-mounting)
    if (this.options.customHandlers) {
      this.protectedContentManager.setContentCallbacks(
        this.options.customHandlers.onContentHidden,
        this.options.customHandlers.onContentRestored
      )
    }

    // Configure debug mode for managers
    if (this.options.debugMode) {
      this.logger.log("Initialized with options", this.options)

      // Enable debug mode for the event manager
      eventManager.setDebugMode(true)

      // Enable debug mode for the interval manager
      //intervalManager.setDebugMode(true);
    }

    this.initializeStrategies()
  }

  /**
   * Initialize protection strategies based on configuration options
   * Creates strategy instances and adds them to the strategies map
   */
  private initializeStrategies(): void {
    const { debugMode, targetElement, customHandlers } = this.options

    // Initialize strategies based on options
    if (this.options.preventKeyboardShortcuts) {
      this.strategies.set("keyboard", new KeyboardStrategy(customHandlers?.onKeyboardShortcutBlocked, debugMode))
    }

    if (this.options.preventContextMenu) {
      this.strategies.set(
        "contextMenu",
        new ContextMenuStrategy(this.options.contextMenuOptions, targetElement, customHandlers?.onContextMenuAttempt, debugMode),
      )
    }

    if (this.options.preventPrinting) {
      this.strategies.set("print", new PrintStrategy(customHandlers?.onPrintAttempt, debugMode))
    }

    if (this.options.preventSelection) {
      this.strategies.set(
        "selection",
        new SelectionStrategy(targetElement, customHandlers?.onSelectionAttempt, debugMode),
      )
    }

    if (this.options.enableWatermark && this.options.watermarkOptions) {
      this.strategies.set("watermark", new WatermarkStrategy(this.options.watermarkOptions, targetElement, debugMode))
    }

    if (this.options.preventDevTools) {
      const devToolsStrategy = new DevToolsStrategy(
        this.options.devToolsOptions,
        targetElement,
        customHandlers?.onDevToolsOpen,
        debugMode,
      )
      devToolsStrategy.setMediator(this.mediator)
      this.strategies.set("devTools", devToolsStrategy)
    }

    if (this.options.preventScreenshots) {
      const screenshotStrategy = new ScreenshotStrategy(
        this.options.screenshotOptions,
        targetElement,
        customHandlers?.onScreenshotAttempt,
        debugMode,
      )
      screenshotStrategy.setMediator(this.mediator)
      this.strategies.set("screenshot", screenshotStrategy)
    }

    if (this.options.preventExtensions) {
      const extensionStrategy = new BrowserExtensionDetectionStrategy(
        this.options.extensionOptions,
        targetElement,
        customHandlers?.onExtensionDetected,
        debugMode,
      )
      extensionStrategy.setMediator(this.mediator)
      this.strategies.set("extension", extensionStrategy)
    }

    if (this.options.preventEmbedding) {
      const frameStrategy = new FrameEmbeddingProtectionStrategy(
        this.options.frameEmbeddingOptions,
        targetElement,
        customHandlers?.onFrameEmbeddingDetected,
        debugMode,
      )
      frameStrategy.setMediator(this.mediator)
      this.strategies.set("iFrame", frameStrategy)
    }

    this.logger.log("Initialized strategies", Array.from(this.strategies.keys()))
  }

  /**
   * Apply all protection strategies
   * Activates each strategy to protect content
   */
  public protect(): void {
    if (this.isActive) {
      this.logger.log("Already protected, skipping")
      return
    }

    this.logger.log("Applying protection strategies")

    // Apply each strategy
    for (const [name, strategy] of this.strategies.entries()) {
      try {
        this.logger.log(`Applying strategy "${name}"`)
        strategy.apply()
      } catch (error) {
        this.logger.error(`Error applying strategy "${name}":`, error)
      }
    }

    this.isActive = true
    this.logger.log("All protection strategies applied successfully")
  }

  /**
   * Remove all protection strategies
   * Deactivates each strategy and cleans up resources
   */
  public unprotect(): void {
    if (!this.isActive) {
      this.logger.log("Not protected, skipping")
      return
    }

    this.logger.log("Removing protection strategies")

    // Create a copy of the strategy entries to avoid modification during iteration
    const entries = Array.from(this.strategies.entries())

    // Remove each strategy and track failures
    let successCount = 0
    let failCount = 0

    for (const [name, strategy] of entries) {
      try {
        this.logger.log(`Removing strategy "${name}"`)

        if (strategy.isApplied()) {
          strategy.remove()
          successCount++
        }
      } catch (error) {
        failCount++
        this.logger.error(`Error removing strategy "${name}":`, error)
      }
    }

    // Clear all strategies regardless of removal success
    this.strategies.clear()

    this.isActive = false
    this.logger.log(`Protection removed (${successCount} successful, ${failCount} failed)`)
  }

  /**
   * Update protection options
   * Removes existing protection, updates options, and reapplies if needed
   * @param options New options to apply
   */
  public updateOptions(options: Partial<ContentProtectionOptions>): void {
    this.logger.log("Updating options", options)

    // Store the current state
    const wasActive = this.isActive

    // Remove existing protections
    this.unprotect()

    // Update options
    this.options = {
      ...this.options,
      ...options,
    }

    // Update debug mode for managers and logger
    if (options.debugMode !== undefined) {
      this.logger.setDebugMode(options.debugMode)
      eventManager.setDebugMode(options.debugMode)
      //intervalManager.setDebugMode(options.debugMode);
      this.overlayManager.setDebugMode(options.debugMode)
    }

    this.logger.log("New options after update", this.options)

    // Reinitialize strategies
    this.strategies.clear()
    this.initializeStrategies()

    // Reapply protection if it was active before
    if (wasActive) {
      this.logger.log("Reapplying protection after options update")
      this.protect()
    }
  }

  /**
   * Check if protection is currently active
   * @returns True if protection is active
   */
  public isProtected(): boolean {
    return this.isActive
  }

  /**
   * Get a specific strategy by name
   * @param name Strategy name
   * @returns The strategy instance or undefined if not found
   */
  public getStrategy(name: string): ProtectionStrategy | undefined {
    return this.strategies.get(name)
  }

  /**
   * Check if a specific strategy is active
   * @param name Strategy name
   * @returns True if the strategy exists
   */
  public hasStrategy(name: string): boolean {
    return this.strategies.has(name)
  }

  /**
   * Clean up and dispose of all resources
   * Removes protection and cleans up global managers
   */
  public dispose(): void {
    this.unprotect()

    // Dispose interval manager
    intervalManager.dispose()

    this.logger.log("Disposed all resources")
  }
}