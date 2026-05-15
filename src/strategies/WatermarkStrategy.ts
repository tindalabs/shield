import type { WatermarkOptions } from "../types"
import { DomObserver } from "../utils/DOMObserver"
import { isBrowser, getOS } from "../utils/environment"
import { AbstractStrategy, StrategyErrorType } from "./AbstractStrategy"

/**
 * Strategy for adding watermarks to content
 */
export class WatermarkStrategy extends AbstractStrategy {
  private targetElement: HTMLElement | null = null
  private options: WatermarkOptions
  private watermarkElements: HTMLElement[] = []
  private domObserver: DomObserver | null = null
  private isFullPageWatermark = false
  private watermarkContainer: HTMLElement | null = null
  private osInfo: { name: "mac" | "linux" | "windows" | "unknown" }

  /**
   * Create a new WatermarkStrategy
   * @param targetElement Element to watermark (defaults to document.body)
   * @param options Watermark options
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(options?: WatermarkOptions, targetElement?: HTMLElement | null, debugMode = false) {
    super("WatermarkStrategy", debugMode)

    this.targetElement = targetElement || (isBrowser() ? document.body : null)
    this.options = {
      text: "CONFIDENTIAL",
      opacity: 0.15,
      density: 3,
      ...options,
    }
    this.osInfo = getOS()
    this.watermarkElements = []

    // Determine if we're doing a full-page watermark
    if (isBrowser() && this.targetElement === document.body) {
      this.isFullPageWatermark = true
    }

    this.log("Initialized with OS:", this.osInfo, "Full-page:", this.isFullPageWatermark)
  }

  /**
   * Create watermarks
   */
  private createWatermarks(): void {
    return this.safeExecute("createWatermarks", StrategyErrorType.APPLICATION, () => {
      if (!this.targetElement || !isBrowser()) return

      // Check if watermark container already exists
      const existingContainer = document.querySelector(".content-security-watermark-container")
      if (existingContainer) {
        this.log("Watermark container already exists, removing first")
        if (existingContainer.parentNode) {
          existingContainer.parentNode.removeChild(existingContainer)
        }
      }

      // Clear any existing watermarks
      this.removeWatermarkElements()

      // Calculate density
      const density = Math.min(Math.max(this.options.density || 3, 1), 10)
      const rows = density * 3
      const cols = density * 3

      // Create watermark container
      const container = document.createElement("div")
      container.className = "content-security-watermark-container"
      container.setAttribute("data-watermark-id", `watermark-${Date.now()}`)
      this.watermarkContainer = container

      // Set container styles based on whether it's full-page or element-specific
      if (this.isFullPageWatermark) {
        // Full-page watermark (fixed position covering viewport)
        Object.assign(container.style, {
          position: "fixed",
          top: "0",
          left: "0",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: "2147483647", // Max z-index
          userSelect: "none",
        })
      } else {
        // Element-specific watermark
        // Get the computed style of the target element
        const targetStyle = window.getComputedStyle(this.targetElement)
        const targetPosition = targetStyle.position

        // If the target element doesn't have a position set, we need to set it to relative
        // so that our absolutely positioned watermark container stays within it
        if (targetPosition === "static") {
          this.targetElement.style.position = "relative"
        }

        Object.assign(container.style, {
          position: "absolute",
          top: "0",
          left: "0",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: "999", // High z-index but not max to avoid breaking page layout
          userSelect: "none",
        })
      }

      // Generate timestamp and user info for watermark
      const timestamp = new Date().toISOString()
      const userInfo = this.options.userId ? ` - User: ${this.options.userId}` : ""
      const watermarkText = `${this.options.text}${userInfo} - ${timestamp}`

      // Create watermark pattern
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const watermark = document.createElement("div")
          watermark.className = "content-security-watermark"
          watermark.textContent = watermarkText

          // Position watermark - use % for element-specific watermarks instead of vh/vw
          const positionUnit = this.isFullPageWatermark ? "vh" : "%"
          const horizontalUnit = this.isFullPageWatermark ? "vw" : "%"

          Object.assign(watermark.style, {
            position: "absolute",
            top: `${(i * 100) / rows}${positionUnit}`,
            left: `${(j * 100) / cols}${horizontalUnit}`,
            transform: "rotate(-45deg) translateX(-30%) translateY(-200%)",
            transformOrigin: "center",
            opacity: String(this.options.opacity || 0.15),
            fontSize: this.isFullPageWatermark ? "16px" : "14px", // Slightly smaller for element watermarks
            color: "rgba(0, 0, 0, 0.7)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            userSelect: "none",
            ...this.options.style,
          })

          container.appendChild(watermark)
          this.watermarkElements.push(watermark)
        }
      }

      // Add container to target
      this.targetElement.appendChild(container)
      this.watermarkElements.push(container)

      this.log("Created watermark container with", this.watermarkElements.length - 1, "watermarks")

      // Set up observer to detect if watermarks are removed
      this.setupObserver()
    })
  }

  /**
   * Set up DOM observer to detect watermark removal
   */
  private setupObserver(): void {
    return this.safeExecute("setupObserver", StrategyErrorType.APPLICATION, () => {
      if (!this.targetElement || !isBrowser()) return

      // Create a handler for element removal
      const handleElementsRemoved = (removedElements: HTMLElement[]): void => {
        this.log("Watermark elements removed from DOM", removedElements)

        // Only restore if auto-restore is enabled
        if (this.isAppliedFlag) {
          this.log("Auto-restoring watermarks")

          // Restore the watermarks
          this.createWatermarks()
        }
      }

      // Create a new observer if needed
      if (!this.domObserver) {
        this.domObserver = new DomObserver({
          targetElement: this.targetElement,
          elementsToWatch: this.watermarkContainer ? [this.watermarkContainer] : [],
          onElementsRemoved: handleElementsRemoved,
          observeSubtree: true,
          debugMode: this.debugMode,
          name: "WatermarkStrategy",
        })
      } else {
        // Update the elements to watch
        this.domObserver.updateElementsToWatch(this.watermarkContainer ? [this.watermarkContainer] : [])
      }

      // Start observing
      this.domObserver.startObserving()
      this.log("DOM observer set up to detect watermark removal")
    })
  }

  /**
   * Remove watermark elements
   */
  private removeWatermarkElements(): void {
    return this.safeExecute("removeWatermarkElements", StrategyErrorType.REMOVAL, () => {
      if (!isBrowser()) return

      // First, try to remove by container reference
      if (this.watermarkContainer && this.watermarkContainer.parentNode) {
        this.watermarkContainer.parentNode.removeChild(this.watermarkContainer)
        this.watermarkContainer = null
      }

      // Then try to remove individual elements
      for (const element of this.watermarkElements) {
        if (element.parentNode) {
          element.parentNode.removeChild(element)
        }
      }

      // Also try to remove by class name in case references were lost
      const containers = document.querySelectorAll(".content-security-watermark-container")
      containers.forEach((container) => {
        if (container.parentNode) {
          container.parentNode.removeChild(container)
        }
      })

      // If we modified the target element's position, restore it
      if (!this.isFullPageWatermark && this.targetElement) {
        // Only remove the position if we added it
        // This is a simplification - ideally we'd store the original position
        if (this.targetElement.style.position === "relative") {
          this.targetElement.style.position = ""
        }
      }

      this.watermarkElements = []
      this.log("Removed all watermark elements")
    })
  }

  /**
   * Apply watermark protection
   */
  public apply(): void {
    return this.safeExecute("apply", StrategyErrorType.APPLICATION, () => {
      if (this.isAppliedFlag) {
        this.log("Already applied, skipping")
        return
      }

      this.log("Applying watermark protection", {
        text: this.options.text,
        opacity: this.options.opacity,
        density: this.options.density,
        userId: this.options.userId,
        isFullPage: this.isFullPageWatermark,
        os: this.osInfo.name,
      })

      this.createWatermarks()
      this.isAppliedFlag = true
    })
  }

  /**
   * Remove watermark protection
   * Override the base implementation to handle additional cleanup
   */
  public remove(): void {
    return this.safeExecute("remove", StrategyErrorType.REMOVAL, () => {
      if (!this.isAppliedFlag) {
        this.log("Not applied, skipping removal")
        return
      }

      if (this.domObserver) {
        this.domObserver.stopObserving()
        this.domObserver = null
        this.log("DOM observer stopped")
      }

      this.removeWatermarkElements()
      this.isAppliedFlag = false
      this.log("Watermark protection removed")
    })
  }

  /**
   * Update watermark options
   * @param options New watermark options
   */
  public updateOptions(options: Record<string, unknown>): void {
    return this.safeExecute("updateOptions", StrategyErrorType.OPTION_UPDATE, () => {
      const typedOptions = options as Partial<WatermarkOptions>
      this.log("Updating options", typedOptions)

      this.options = {
        ...this.options,
        ...typedOptions,
      }

      if (this.isAppliedFlag) {
        // Reapply with new options
        this.remove()
        this.apply()
        this.log("Reapplied watermarks with updated options")
      }
    })
  }
}