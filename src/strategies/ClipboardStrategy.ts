import { AbstractStrategy, StrategyErrorType } from "./AbstractStrategy"
import type { ClipboardOptions } from "../types"
import { isBrowser } from "../utils/environment"
import type { CustomEventHandlers } from "../types"

/**
 * Strategy to prevent copying content via clipboard operations
 * Blocks copy, cut, and optionally paste operations
 */
export class ClipboardStrategy extends AbstractStrategy {
  private options: ClipboardOptions
  private targetElement: HTMLElement | null
  private customHandler?: CustomEventHandlers["onClipboardAttempt"]
  private originalClipboardWriteText: ((text: string) => Promise<void>) | null = null
  private originalClipboardReadText: (() => Promise<string>) | null = null
  private originalExecCommand: ((command: string, showUI: boolean, value?: string) => boolean) | null = null

  /**
   * Create a new ClipboardStrategy
   * @param options Configuration options
   * @param targetElement Target element to protect (defaults to document.body)
   * @param customHandler Custom handler for clipboard events
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(
    options: ClipboardOptions = {},
    targetElement?: HTMLElement | null,
    customHandler?: CustomEventHandlers["onClipboardAttempt"],
    debugMode = false,
  ) {
    super("ClipboardStrategy", debugMode)

    // Set default options
    this.options = {
      preventCopy: true,
      preventCut: true,
      preventPaste: false,
      replacementText: "Content copying is disabled for security reasons.",
      ...options,
    }

    this.targetElement = targetElement || (isBrowser() ? document.body : null)
    this.customHandler = customHandler

    this.log("Initialized with options:", this.options)
  }

  /**
   * Apply clipboard protection
   */
  public apply(): void {
    this.safeExecute("apply", StrategyErrorType.APPLICATION, () => {
      if (this.isAppliedFlag || !this.targetElement || !isBrowser()) {
        return
      }

      this.log("Applying clipboard protection")

      // Register clipboard events
      if (this.options.preventCopy) {
        this.registerEvent(this.targetElement, "copy", this.handleCopy.bind(this), {
          capture: true,
          passive: false,
          priority: 10,
        })
        this.log("Registered copy event handler")
      }

      if (this.options.preventCut) {
        this.registerEvent(this.targetElement, "cut", this.handleCut.bind(this), {
          capture: true,
          passive: false,
          priority: 10,
        })
        this.log("Registered cut event handler")
      }

      if (this.options.preventPaste) {
        this.registerEvent(this.targetElement, "paste", this.handlePaste.bind(this), {
          capture: true,
          passive: false,
          priority: 10,
        })
        this.log("Registered paste event handler")
      }

      // Always intercept Clipboard API
      this.interceptClipboardAPI()

      // Intercept document.execCommand
      this.interceptExecCommand()

      this.isAppliedFlag = true
      this.log(`Protection applied with ${this.eventIds.length} event handlers`)
    })
  }

  /**
   * Remove clipboard protection
   */
  public remove(): void {
    this.safeExecute("remove", StrategyErrorType.REMOVAL, () => {
      if (!this.isAppliedFlag) {
        return
      }

      // Restore original Clipboard API methods if they were intercepted
      this.restoreClipboardAPI()

      // Restore original execCommand if it was intercepted
      this.restoreExecCommand()

      // Remove event listeners
      super.remove()

      this.log("Clipboard protection removed")
    })
  }

  /**
   * Update clipboard protection options
   * @param options New options to apply
   */
  public updateOptions(options: Partial<ClipboardOptions>): void {
    this.safeExecute("updateOptions", StrategyErrorType.OPTION_UPDATE, () => {
      const wasApplied = this.isAppliedFlag

      // Remove current protection
      if (wasApplied) {
        this.remove()
      }

      // Update options
      this.options = {
        ...this.options,
        ...options,
      }

      this.log("Options updated:", this.options)

      // Reapply protection if it was applied before
      if (wasApplied) {
        this.apply()
      }
    })
  }

  /**
   * Handle copy event
   * @param event Copy event
   */
  private handleCopy(event: Event): void {
    this.safeExecute("handleCopy", StrategyErrorType.EVENT_HANDLING, () => {
      const e = event as ClipboardEvent
      this.log("Copy attempt detected", { target: e.target })

      // Call custom handler if provided
      if (this.customHandler) {
        this.customHandler(e, "copy")
      }

      // Prevent default copy behavior
      e.preventDefault()
      e.stopPropagation()

      // Replace clipboard content if supported
      if (e.clipboardData) {
        e.clipboardData.setData("text/plain", this.options.replacementText || "")
      }

      return false
    })
  }

  /**
   * Handle cut event
   * @param event Cut event
   */
  private handleCut(event: Event): void {
    this.safeExecute("handleCut", StrategyErrorType.EVENT_HANDLING, () => {
      const e = event as ClipboardEvent
      this.log("Cut attempt detected", { target: e.target })

      // Call custom handler if provided
      if (this.customHandler) {
        this.customHandler(e, "cut")
      }

      // Prevent default cut behavior
      e.preventDefault()
      e.stopPropagation()

      // Replace clipboard content if supported
      if (e.clipboardData) {
        e.clipboardData.setData("text/plain", this.options.replacementText || "")
      }

      return false
    })
  }

  /**
   * Handle paste event
   * @param event Paste event
   */
  private handlePaste(event: Event): void {
    this.safeExecute("handlePaste", StrategyErrorType.EVENT_HANDLING, () => {
      const e = event as ClipboardEvent
      this.log("Paste attempt detected", { target: e.target })

      // Call custom handler if provided
      if (this.customHandler) {
        this.customHandler(e, "paste")
      }

      // Prevent default paste behavior
      e.preventDefault()
      e.stopPropagation()

      return false
    })
  }

  /**
   * Intercept the Clipboard API to prevent programmatic access
   */
  private interceptClipboardAPI(): void {
    this.safeExecute("interceptClipboardAPI", StrategyErrorType.APPLICATION, () => {
      if (!isBrowser() || !navigator.clipboard) {
        return
      }

      this.log("Intercepting Clipboard API")

      // Store original methods
      if (navigator.clipboard.writeText) {
        this.originalClipboardWriteText = navigator.clipboard.writeText.bind(navigator.clipboard)

        // Override writeText
        navigator.clipboard.writeText = async (text: string): Promise<void> => {
          this.log("Clipboard API writeText intercepted")

          // Call custom handler if provided
          if (this.customHandler) {
            const mockEvent = new ClipboardEvent("copy")
            this.customHandler(mockEvent, "copy")
          }

          // Return a resolved promise with the replacement text if copy is prevented
          if (this.options.preventCopy) {
            return Promise.resolve()
          }

          // Otherwise use the original method
          return this.originalClipboardWriteText!(text)
        }
      }

      // Intercept readText if paste prevention is enabled
      if (this.options.preventPaste && navigator.clipboard.readText) {
        this.originalClipboardReadText = navigator.clipboard.readText.bind(navigator.clipboard)

        // Override readText
        navigator.clipboard.readText = async (): Promise<string> => {
          this.log("Clipboard API readText intercepted")

          // Call custom handler if provided
          if (this.customHandler) {
            const mockEvent = new ClipboardEvent("paste")
            this.customHandler(mockEvent, "paste")
          }

          // Return empty string if paste is prevented
          if (this.options.preventPaste) {
            return Promise.resolve("")
          }

          // Otherwise use the original method
          return this.originalClipboardReadText!()
        }
      }
    })
  }

  /**
   * Restore original Clipboard API methods
   */
  private restoreClipboardAPI(): void {
    this.safeExecute("restoreClipboardAPI", StrategyErrorType.REMOVAL, () => {
      if (!isBrowser() || !navigator.clipboard) {
        return
      }

      // Restore original writeText if it was intercepted
      if (this.originalClipboardWriteText) {
        navigator.clipboard.writeText = this.originalClipboardWriteText
        this.originalClipboardWriteText = null
        this.log("Restored original clipboard.writeText")
      }

      // Restore original readText if it was intercepted
      if (this.originalClipboardReadText) {
        navigator.clipboard.readText = this.originalClipboardReadText
        this.originalClipboardReadText = null
        this.log("Restored original clipboard.readText")
      }
    })
  }

  /**
   * Intercept document.execCommand to prevent clipboard operations
   */
  private interceptExecCommand(): void {
    this.safeExecute("interceptExecCommand", StrategyErrorType.APPLICATION, () => {
      if (!isBrowser() || !document.execCommand) {
        return
      }

      this.log("Intercepting document.execCommand")

      // Store original execCommand
      this.originalExecCommand = document.execCommand.bind(document)

      // Override execCommand
      document.execCommand = (command: string, showUI: boolean, value?: string): boolean => {
        // Check if this is a clipboard command we want to block
        const lowerCommand = command.toLowerCase()

        if (
          (lowerCommand === "copy" && this.options.preventCopy) ||
          (lowerCommand === "cut" && this.options.preventCut) ||
          (lowerCommand === "paste" && this.options.preventPaste)
        ) {
          this.log(`document.execCommand('${command}') intercepted`)

          // Call custom handler if provided
          if (this.customHandler) {
            const mockEvent = new ClipboardEvent(lowerCommand)
            this.customHandler(mockEvent, lowerCommand as "copy" | "cut" | "paste")
          }

          return false
        }

        // For other commands, use the original method
        return this.originalExecCommand!(command, showUI, value)
      }
    })
  }

  /**
   * Restore original document.execCommand
   */
  private restoreExecCommand(): void {
    this.safeExecute("restoreExecCommand", StrategyErrorType.REMOVAL, () => {
      if (!isBrowser() || !this.originalExecCommand) {
        return
      }

      document.execCommand = this.originalExecCommand
      this.originalExecCommand = null
      this.log("Restored original document.execCommand")
    })
  }
}