import type { MediatorAware, ProtectionMediator } from "../core/mediator/types"
import { DomObserver } from "./DOMObserver"
import { isBrowser } from "./environment"
import { ProtectionEvent, ProtectionEventType } from "../core/mediator/protection-event"
import { isEventType } from "../core/mediator/eventDataTypes"
import { eventManager } from "./eventManager"
import { SimpleLoggingService } from "./logging/simple/SimpleLoggingService"

/**
 * Options for the security overlay
 */
export interface OverlayOptions {
  /**
   * Title to display in the overlay
   */
  title?: string

  /**
   * Main message to display
   */
  message?: string

  /**
   * Secondary message to display
   */
  secondaryMessage?: string

  /**
   * Text color for the overlay
   */
  textColor?: string

  /**
   * Background color for the overlay
   */
  backgroundColor?: string

  /**
   * Z-index for the overlay (default: 2147483647)
   */
  zIndex?: string

  /**
   * Whether to show a close button
   */
  showCloseButton?: boolean

  /**
   * Text for the close button
   */
  closeButtonText?: string

  /**
   * Callback when close button is clicked
   */
  onCloseButtonClick?: () => void

  /**
   * Duration in milliseconds to show the overlay (0 for indefinite)
   */
  duration?: number

  /**
   * Additional custom styles for the overlay
   */
  customStyles?: Record<string, string>

  /**
   * Additional custom styles for the text
   */
  textStyles?: Record<string, string>

  /**
   * Font size (ScreenshotStrategy - refactor)
   */
  fontSize?: string

  /**
   * Additional HTML content to display in the overlay
   */
  additionalContent?: string

  /**
   * Whether to block events (create an event blocker)
   */
  blockEvents?: boolean

  /**
   * Whether to automatically restore the overlay if it's removed from the DOM
   * @default true
   */
  autoRestore?: boolean
}

/**
 * Information about a stored overlay
 */
interface StoredOverlay {
  /**
   * ID of the overlay
   */
  id: string

  /**
   * Type of the overlay (e.g., "screenshot", "devtools")
   */
  overlayType: string

  /**
   * Options used to create the overlay
   */
  options: OverlayOptions

  /**
   * Strategy or component that created the overlay
   */
  owner: string

  /**
   * Priority for display order (higher displays on top)
   * @default 0
   */
  priority: number

  /**
   * Reference to the overlay element
   */
  element: HTMLElement | null

  /**
   * Reference to the event blocker element (if created)
   */
  blocker: HTMLElement | null

  /**
   * Timeout ID for auto-removal (if set)
   */
  timeoutId: number | null

  /**
   * Whether the overlay is currently visible
   */
  isVisible: boolean

  /**
   * Timestamp when the overlay was created
   */
  createdAt: number
}

/**
 * Utility class to manage security overlays
 */
export class SecurityOverlayManager implements MediatorAware {
  public readonly COMPONENT_NAME = "SecurityOverlayManager"
  private mediator: ProtectionMediator | null = null
  private debugMode: boolean
  private logger: SimpleLoggingService
  private domObserver: DomObserver | null = null

  // Main storage for overlays
  private overlays: Map<string, StoredOverlay> = new Map()

  // Currently active/visible overlay
  private activeOverlayId: string | null = null

  // Queue of overlay IDs waiting to be shown
  private overlayQueue: string[] = []

  private onElementsRemovedCallbacks: Array<(removedElements: HTMLElement[]) => void> = []

  /**
   * Create a new SecurityOverlayManager
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(debugMode = false) {
    this.debugMode = debugMode
    this.logger = new SimpleLoggingService(this.COMPONENT_NAME, debugMode)
    this.logger.log("Initialized")
  }

  /**
   * Set the mediator to communicate with the other components
   * @param mediator The protection mediator
   */
  public setMediator(mediator: ProtectionMediator): void {
    this.mediator = mediator

    // Subscribe only to general overlay events
    this.mediator.subscribe(ProtectionEventType.OVERLAY_SHOWN, this.handleOverlayShown.bind(this), {
      context: this.COMPONENT_NAME,
    })

    this.mediator.subscribe(ProtectionEventType.OVERLAY_REMOVED, this.handleOverlayRemoved.bind(this), {
      context: this.COMPONENT_NAME,
    })

    this.mediator.subscribe(ProtectionEventType.OVERLAY_RESTORED, this.handleOverlayRestored.bind(this), {
      context: this.COMPONENT_NAME,
    })

    this.logger.log("Mediator set and subscriptions established")
  }

  /**
   * Check if an overlay with the same owner and type already exists
   * @param owner The owner to check
   * @param overlayType The overlay type to check
   * @returns True if a matching overlay exists
   */
  private hasOverlayByOwnerAndType(owner: string, overlayType: string): boolean {
    for (const overlay of this.overlays.values()) {
      if (overlay.owner === owner && overlay.overlayType === overlayType) {
        return true
      }
    }
    return false
  }

  /**
   * Handle overlay shown event
   * @param event The protection event
   */
  private handleOverlayShown(event: ProtectionEvent): void {
    try {
      this.logger.log(`Received overlay shown event from ${event.source}`, event.data)

      // Use type guard for type-safe access
      if (!isEventType(event, ProtectionEventType.OVERLAY_SHOWN)) {
        this.logger.error("Received invalid event type for OVERLAY_SHOWN");
        return;
      }

      const { data } = event;

      if (!data || !data.options) return

      // Check for duplicate registrations
      if (this.hasOverlayByOwnerAndType(data.strategyName, data.overlayType)) {
        this.logger.log(
          `Duplicate overlay registration detected for ${data.strategyName}/${data.overlayType}, removing existing overlay first`,
        )

        // Remove existing overlays with the same owner and type
        for (const [overlayId, overlay] of this.overlays.entries()) {
          if (overlay.owner === data.strategyName && overlay.overlayType === data.overlayType) {
            this.removeOverlayById(overlayId)
            break // Only remove one to avoid potential issues
          }
        }
      }

      // Register and show the overlay
      this.registerOverlay(data.strategyName, data.overlayType, data.options, data.priority || 0)
    } catch (error) {
      this.logger.error("Error handling overlay shown event", error)
    }
  }

  /**
   * Handle overlay removed event
   * @param event The protection event
   */
  private handleOverlayRemoved(event: ProtectionEvent): void {
    try {
      this.logger.log(`Received overlay removed event from ${event.source}`, event.data)

      // Use type guard for type-safe access
      if (!isEventType(event, ProtectionEventType.OVERLAY_REMOVED)) {
        this.logger.error("Received invalid event type for OVERLAY_REMOVED");
        return;
      }

      const { data } = event;

      if (!data) return

      // Remove overlays by owner
      this.removeOverlaysByOwner(data.strategyName)
    } catch (error) {
      this.logger.error("Error handling overlay removed event", error)
    }
  }

  /**
   * Handle overlay restored event
   * @param event The protection event
   */
  private handleOverlayRestored(event: ProtectionEvent): void {
    try {
      this.logger.log(`Received overlay restored event from ${event.source}`, event.data)

      const data = event.data as {
        strategyName: string
        overlayType?: string
        reason?: string
      }

      if (!data) return

      // Check and restore overlays for this owner
      this.checkAndRestoreOverlaysByOwner(data.strategyName)
    } catch (error) {
      this.logger.error("Error handling overlay restored event", error)
    }
  }

  /**
   * Register a new overlay
   * @param owner The strategy or component that owns this overlay
   * @param overlayType The type of overlay (e.g., "screenshot", "devtools")
   * @param options Options for the overlay
   * @param priority Priority for display order (higher displays on top)
   * @returns The ID of the registered overlay
   */
  public registerOverlay(owner: string, overlayType: string, options: OverlayOptions, priority = 0): string {
    if (!isBrowser()) return ""

    // Generate a unique ID for the overlay
    const overlayId = `overlay-${owner}-${overlayType}-${Date.now()}`

    // Create the stored overlay object
    const storedOverlay: StoredOverlay = {
      id: overlayId,
      overlayType,
      options: { ...options },
      owner,
      priority,
      element: null,
      blocker: null,
      timeoutId: null,
      isVisible: false,
      createdAt: Date.now(),
    }

    // Store the overlay
    this.overlays.set(overlayId, storedOverlay)

    this.logger.log(`Registered overlay ${overlayId} for ${owner} (${overlayType})`)

    // If no active overlay, show this one immediately
    if (!this.activeOverlayId) {
      this.showOverlayById(overlayId)
    } else {
      // Otherwise, add to queue based on priority
      this.addToQueue(overlayId)

      // Check if this overlay should replace the current one based on priority
      const activeOverlay = this.overlays.get(this.activeOverlayId)
      const newOverlay = this.overlays.get(overlayId)

      if (activeOverlay && newOverlay && newOverlay.priority > activeOverlay.priority) {
        this.logger.log(`New overlay has higher priority, replacing active overlay`)

        // Hide current overlay
        this.hideOverlayById(this.activeOverlayId, false)

        // Show new overlay
        this.showOverlayById(overlayId)
      }
    }

    return overlayId
  }

  /**
   * Add an overlay to the queue
   * @param overlayId ID of the overlay to add to queue
   */
  private addToQueue(overlayId: string): void {
    // Add to queue if not already in it
    if (!this.overlayQueue.includes(overlayId)) {
      this.overlayQueue.push(overlayId)

      // Sort queue by priority (highest first)
      this.overlayQueue.sort((a, b) => {
        const overlayA = this.overlays.get(a)
        const overlayB = this.overlays.get(b)

        if (!overlayA || !overlayB) return 0
        return overlayB.priority - overlayA.priority
      })

      this.logger.log(
        `Added overlay ${overlayId} to queue, position ${this.overlayQueue.indexOf(overlayId) + 1}/${this.overlayQueue.length}`,
      )
    }
  }

  /**
   * Show a specific overlay by ID
   * @param overlayId ID of the overlay to show
   * @returns True if the overlay was shown successfully
   */
  private showOverlayById(overlayId: string): boolean {
    const overlay = this.overlays.get(overlayId)
    if (!overlay) return false

    this.logger.log(`Showing overlay ${overlayId} (${overlay.overlayType})`)

    // Create the DOM elements
    const result = this.createOverlayElements(overlay)

    if (!result.overlay) {
      this.logger.log(`Failed to create overlay elements for ${overlayId}`)
      return false
    }

    // Update the stored overlay with references to the elements
    overlay.element = result.overlay
    overlay.blocker = result.blocker
    overlay.isVisible = true

    // Set as active overlay
    this.activeOverlayId = overlayId

    // Remove from queue if it's in there
    this.overlayQueue = this.overlayQueue.filter((id) => id !== overlayId)

    // Set up auto-removal timeout if duration is specified
    if (overlay.options.duration && overlay.options.duration > 0) {
      overlay.timeoutId = window.setTimeout(() => {
        this.removeOverlayById(overlayId)
        overlay.timeoutId = null
      }, overlay.options.duration) as unknown as number

      this.logger.log(`Overlay ${overlayId} will auto-remove after ${overlay.options.duration}ms`)
    }

    // Set up observer for auto-restoration if enabled
    if (overlay.options.autoRestore !== false) {
      this.setupObserver(overlay)
    }

    return true
  }

  /**
   * Hide a specific overlay by ID without removing it from storage
   * @param overlayId ID of the overlay to hide
   * @param processQueue Whether to process the queue after hiding
   * @returns True if the overlay was hidden successfully
   */
  private hideOverlayById(overlayId: string, processQueue = true): boolean {
    const overlay = this.overlays.get(overlayId)
    if (!overlay || !overlay.isVisible) return false

    this.logger.log(`Hiding overlay ${overlayId} (${overlay.overlayType})`)

    // Clear any existing timeout
    if (overlay.timeoutId !== null) {
      window.clearTimeout(overlay.timeoutId)
      overlay.timeoutId = null
    }

    // Remove DOM elements
    if (overlay.element && overlay.element.parentNode) {
      overlay.element.parentNode.removeChild(overlay.element)
    }

    if (overlay.blocker && overlay.blocker.parentNode) {
      overlay.blocker.parentNode.removeChild(overlay.blocker)
    }

    // Update state
    overlay.element = null
    overlay.blocker = null
    overlay.isVisible = false

    // Clear active overlay reference if this was the active one
    if (this.activeOverlayId === overlayId) {
      this.activeOverlayId = null

      // Remove global event listeners when the active overlay is hidden
      this.removeGlobalEventListeners()

      // Process queue to show next overlay if requested
      if (processQueue && this.overlayQueue.length > 0) {
        const nextOverlayId = this.overlayQueue.shift()
        if (nextOverlayId) {
          this.showOverlayById(nextOverlayId)
        }
      }
    }

    return true
  }

  /**
   * Create overlay and blocker elements
   * @param overlay The stored overlay information
   * @returns Object containing the created elements
   */
  private createOverlayElements(overlay: StoredOverlay): { overlay: HTMLElement | null; blocker: HTMLElement | null } {
    if (!isBrowser()) {
      return { overlay: null, blocker: null }
    }

    // Create event blocker if requested
    let blocker: HTMLElement | null = null
    if (overlay.options.blockEvents) {
      blocker = this.createEventBlocker()
      document.body.appendChild(blocker)

      this.logger.log(`Event blocker created for ${overlay.id}`)
    }

    // Create the overlay element
    const overlayElement = this.createOverlay(overlay.options, overlay.owner)
    document.body.appendChild(overlayElement)

    this.logger.log(`Overlay element created for ${overlay.id}`)

    return {
      overlay: overlayElement,
      blocker: blocker,
    }
  }

  /**
   * Remove a specific overlay by ID
   * @param overlayId ID of the overlay to remove
   * @returns True if the overlay was removed successfully
   */
  public removeOverlayById(overlayId: string): boolean {
    const overlay = this.overlays.get(overlayId)
    if (!overlay) return false

    this.logger.log(`Removing overlay ${overlayId} (${overlay.overlayType})`)

    // Check if this is the active overlay before hiding it
    const isActive = this.activeOverlayId === overlayId

    // IMPORTANT: Stop the DOMObserver BEFORE removing DOM elements
    // MutationObserver fires synchronously during DOM removal, so we must
    // stop it first to prevent auto-restore from creating a new overlay
    if (this.domObserver) {
      this.domObserver.stopObserving()
      this.domObserver = null
      this.logger.log(`Stopped DOM observer before removing overlay ${overlayId}`)
    }

    // Hide the overlay (removes DOM elements)
    this.hideOverlayById(overlayId)

    // If this WAS the active overlay, ensure global event listeners are removed
    // (hideOverlayById should have already done this, but this is a safety net)
    if (isActive) {
      this.removeGlobalEventListeners()
    }

    // Remove from storage
    this.overlays.delete(overlayId)

    return true
  }

  /**
   * Remove all overlays for a specific owner
   * @param owner The owner to remove overlays for
   * @returns The number of overlays removed
   */
  public removeOverlaysByOwner(owner: string): number {
    if (!isBrowser()) return 0

    let removedCount = 0
    const overlaysToRemove: string[] = []

    // Find all overlays owned by this owner
    for (const [overlayId, overlay] of this.overlays.entries()) {
      if (overlay.owner === owner) {
        overlaysToRemove.push(overlayId)
      }
    }

    // Remove each overlay
    for (const overlayId of overlaysToRemove) {
      if (this.removeOverlayById(overlayId)) {
        removedCount++
      }
    }

    if (removedCount > 0) {
      this.logger.log(`Removed ${removedCount} overlays for owner ${owner}`)
    }

    return removedCount
  }

  /**
   * Check and restore overlays for a specific owner
   * @param owner The owner to check overlays for
   * @returns The number of overlays restored
   */
  public checkAndRestoreOverlaysByOwner(owner: string): number {
    if (!isBrowser()) return 0

    let restoredCount = 0

    // Find all overlays owned by this owner
    for (const [overlayId, overlay] of this.overlays.entries()) {
      if (overlay.owner === owner && overlay.options.autoRestore !== false && !overlay.isVisible) {
        // If this overlay should be visible but isn't, restore it
        if (this.activeOverlayId) {
          // If there's already an active overlay, add this to the queue
          this.addToQueue(overlayId)
        } else {
          // Otherwise show it immediately
          if (this.showOverlayById(overlayId)) {
            restoredCount++
          }
        }
      }
    }

    if (restoredCount > 0) {
      this.logger.log(`Restored ${restoredCount} overlays for owner ${owner}`)
    }

    return restoredCount
  }

  /**
   * Create an overlay element
   * @param options Options for the overlay
   * @param owner The owner of the overlay (for data attribute)
   * @returns The created overlay element
   */
  private createOverlay(options: OverlayOptions, owner: string): HTMLElement {
    if (!isBrowser()) {
      throw new Error("Document is not available")
    }

    // Create overlay element
    const overlay = document.createElement("div")
    overlay.id = "security-overlay"

    // Add data attribute for owner identification
    overlay.setAttribute("data-owner", owner)

    // Apply styles
    const styles = {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      backgroundColor: options.backgroundColor || "rgba(220, 38, 38, 0.9)",
      zIndex: options.zIndex || "2147483647",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      fontFamily: "sans-serif",
      color: options.textColor || "white",
      padding: "20px",
      textAlign: "center",
      pointerEvents: "auto", // Always allow interaction with the overlay itself
      ...options.customStyles,
    }

    // Apply styles to the overlay
    Object.entries(styles).forEach(([key, value]) => {
      if (value !== undefined) {
        overlay.style[key] = value
      }
    })

    // Create HTML content
    let content = ""

    if (options.title) {
      content += `<h2 style="font-size: 24px; margin-bottom: 20px;">${options.title}</h2>`
    }

    if (options.message) {
      content += `<p style="font-size: 16px; margin-bottom: 10px;">${options.message}</p>`
    }

    if (options.secondaryMessage) {
      content += `<p style="font-size: 16px; margin-top: 10px;">${options.secondaryMessage}</p>`
    }

    if (options.additionalContent) {
      content += options.additionalContent
    }

    if (options.showCloseButton) {
      content += `
        <button id="security-overlay-close" style="margin-top: 20px; padding: 10px 20px; background-color: white; color: black; border: none; border-radius: 4px; cursor: pointer; pointer-events: auto;">
          ${options.closeButtonText || "Close"}
        </button>
      `
    }

    overlay.innerHTML = content

    // Add event listener to close button if present
    if (options.showCloseButton) {
      setTimeout(() => {
        const closeButton = document.getElementById("security-overlay-close")
        if (closeButton) {
          closeButton.addEventListener("click", () => {
            if (options.onCloseButtonClick) {
              options.onCloseButtonClick()
            } else {
              // Find the overlay ID by owner and remove it
              for (const [overlayId, storedOverlay] of this.overlays.entries()) {
                if (storedOverlay.owner === owner && storedOverlay.element === overlay) {
                  this.removeOverlayById(overlayId)
                  break
                }
              }
            }
          })
        }
      }, 0)
    }

    return overlay
  }

  /**
   * Create an event blocker that prevents interaction with the page
   * @returns The created event blocker element
   */
  private createEventBlocker(): HTMLElement {
    const blocker = document.createElement("div")
    blocker.id = "security-event-blocker"

    // Apply styles to make it cover the entire page and block all events
    blocker.style.position = "fixed"
    blocker.style.top = "0"
    blocker.style.left = "0"
    blocker.style.width = "100%"
    blocker.style.height = "100%"
    blocker.style.backgroundColor = "transparent" // Transparent but will block events
    blocker.style.zIndex = "2147483646" // Just below the overlay
    blocker.style.cursor = "not-allowed" // Show not-allowed cursor

    // Add event listeners to block all interactions
    const blockEvent = (e: Event): boolean => {
      e.preventDefault()
      e.stopPropagation()
      return false
    }

    // Block all common events
    const events = [
      "click",
      "dblclick",
      "mousedown",
      "mouseup",
      "mousemove",
      "touchstart",
      "touchend",
      "touchmove",
      "touchcancel",
      "keydown",
      "keyup",
      "keypress",
      "contextmenu",
      "selectstart",
      "dragstart",
      "wheel", // Add wheel event to block scrolling
      "scroll", // Add scroll event as well
    ]

    events.forEach((eventType) => {
      blocker.addEventListener(eventType, blockEvent, { capture: true, passive: false })
    })

    // Additional handling for wheel events on document and window
    if (isBrowser()) {
      // Use eventManager to register global event listeners
      eventManager.addEventListener(document, "wheel", blockEvent as EventListener, this.COMPONENT_NAME, {
        capture: true,
        passive: false,
        priority: 10,
      })

      eventManager.addEventListener(window, "wheel", blockEvent as EventListener, this.COMPONENT_NAME, {
        capture: true,
        passive: false,
        priority: 10,
      })

      // Also prevent scrolling via touch on mobile
      eventManager.addEventListener(document, "touchmove", blockEvent as EventListener, this.COMPONENT_NAME, {
        capture: true,
        passive: false,
        priority: 10,
      })

      eventManager.addEventListener(window, "touchmove", blockEvent as EventListener, this.COMPONENT_NAME, {
        capture: true,
        passive: false,
        priority: 10,
      })

      this.logger.log("Added global event listeners to prevent scrolling")
    }

    return blocker
  }

  /**
   * Set up DOM observer to detect when overlay elements are removed
   * @param overlay The overlay to observe
   */
  private setupObserver(overlay: StoredOverlay): void {
    if (!isBrowser() || !overlay.element) return

    const elementsToWatch: HTMLElement[] = [overlay.element]

    if (overlay.blocker) {
      elementsToWatch.push(overlay.blocker)
    }

    // Create a handler for element removal
    const handleElementsRemoved = (removedElements: HTMLElement[]): void => {
      this.logger.log(`Overlay elements removed from DOM for ${overlay.id}`, removedElements)

      // Only restore if auto-restore is enabled and the overlay is still in our storage
      const currentOverlay = this.overlays.get(overlay.id)
      if (currentOverlay && currentOverlay.options.autoRestore !== false) {
        this.logger.log(`Auto-restoring overlay ${overlay.id}`)

        // Mark as not visible
        currentOverlay.isVisible = false
        currentOverlay.element = null
        currentOverlay.blocker = null

        // If this was the active overlay, restore it immediately
        if (this.activeOverlayId === overlay.id) {
          this.showOverlayById(overlay.id)
        } else {
          // Otherwise add to queue
          this.addToQueue(overlay.id)
        }

        // Notify callbacks
        this.notifyElementsRemovedCallbacks(removedElements)
      }
    }

    // Stop any existing observer
    if (this.domObserver) {
      this.domObserver.stopObserving()
    }

    this.domObserver = new DomObserver({
      targetElement: document.body,
      elementsToWatch,
      onElementsRemoved: handleElementsRemoved,
      observeSubtree: true,
      debugMode: this.debugMode,
      name: "SecurityOverlayManager",
    })

    this.domObserver.startObserving()

    this.logger.log(`DOM observer set up for overlay ${overlay.id}`)
  }

  /**
   * Remove global event listeners that were added to document and window
   */
  private removeGlobalEventListeners(): void {
    if (!isBrowser()) return

    // Use eventManager to remove all events registered by this component
    const removedCount = eventManager.removeEventsByOwner(this.COMPONENT_NAME)

    this.logger.log(`Removed ${removedCount} global event listeners`)

    // Re-enable scrolling on body
    if (document.body) {
      document.body.style.overflow = ""
      document.body.style.position = ""
      document.body.style.height = ""
      document.body.style.width = ""
      document.body.style.top = ""
      document.body.style.left = ""

      this.logger.log("Re-enabled scrolling on body")
    }

    // Re-enable scrolling on html
    const htmlElement = document.documentElement
    if (htmlElement) {
      htmlElement.style.overflow = ""

      this.logger.log("Re-enabled scrolling on html")
    }
  }

  /**
   * Notify all callbacks when elements are removed
   * @param removedElements The elements that were removed
   */
  private notifyElementsRemovedCallbacks(removedElements: HTMLElement[]): void {
    for (const callback of this.onElementsRemovedCallbacks) {
      try {
        callback(removedElements)
      } catch (error) {
        this.logger.error("Error in elements removed callback:", error)
      }
    }
  }

  /**
   * Add a callback to be called when overlay elements are removed
   * @param callback Callback function
   */
  public addElementsRemovedCallback(callback: (removedElements: HTMLElement[]) => void): void {
    this.onElementsRemovedCallbacks.push(callback)
  }

  /**
   * Remove a callback
   * @param callback Callback function to remove
   */
  public removeElementsRemovedCallback(callback: (removedElements: HTMLElement[]) => void): void {
    this.onElementsRemovedCallbacks = this.onElementsRemovedCallbacks.filter((cb) => cb !== callback)
  }

  /**
   * Get all overlays for a specific owner
   * @param owner The owner to get overlays for
   * @returns Array of overlay IDs
   */
  public getOverlaysByOwner(owner: string): string[] {
    const overlayIds: string[] = []

    for (const [overlayId, overlay] of this.overlays.entries()) {
      if (overlay.owner === owner) {
        overlayIds.push(overlayId)
      }
    }

    return overlayIds
  }

  /**
   * Get all active overlays
   * @returns Array of active overlay IDs
   */
  public getActiveOverlays(): string[] {
    const activeOverlays: string[] = []

    for (const [overlayId, overlay] of this.overlays.entries()) {
      if (overlay.isVisible) {
        activeOverlays.push(overlayId)
      }
    }

    return activeOverlays
  }

  /**
   * Check if an overlay exists
   * @param overlayId The overlay ID
   * @returns True if the overlay exists
   */
  public hasOverlay(overlayId: string): boolean {
    return this.overlays.has(overlayId)
  }

  /**
   * Get the currently active overlay ID
   * @returns The active overlay ID or null if none is active
   */
  public getActiveOverlayId(): string | null {
    return this.activeOverlayId
  }

  /**
   * Get the overlay queue
   * @returns Array of overlay IDs in the queue
   */
  public getOverlayQueue(): string[] {
    return [...this.overlayQueue]
  }

  /**
   * Clear all overlays
   * @returns The number of overlays removed
   */
  public clearAllOverlays(): number {
    if (!isBrowser()) return 0

    const overlayIds = Array.from(this.overlays.keys())
    let removedCount = 0

    for (const overlayId of overlayIds) {
      if (this.removeOverlayById(overlayId)) {
        removedCount++
      }
    }

    // Clear queue
    this.overlayQueue = []
    this.activeOverlayId = null

    // Remove global event listeners
    this.removeGlobalEventListeners()

    if (removedCount > 0) {
      this.logger.log(`Cleared all ${removedCount} overlays`)
    }

    return removedCount
  }

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled
    this.logger.setDebugMode(enabled)
    this.logger.log(`Debug mode ${enabled ? "enabled" : "disabled"}`)
  }

  /**
   * Get debug information about registered overlays
   * @returns Object with debug information
   */
  public getDebugInfo(): {
    totalOverlays: number
    overlaysByOwner: Record<string, number>
    overlaysByType: Record<string, number>
    activeOverlayId: string | null
    queueLength: number
    overlayDetails: Array<{
      id: string
      owner: string
      type: string
      isVisible: boolean
      priority: number
      createdAt: number
    }>
  } {
    const overlaysByOwner: Record<string, number> = {}
    const overlaysByType: Record<string, number> = {}
    let totalOverlays = 0
    const overlayDetails: Array<{
      id: string
      owner: string
      type: string
      isVisible: boolean
      priority: number
      createdAt: number
    }> = []

    for (const [overlayId, overlay] of this.overlays.entries()) {
      totalOverlays++

      // Count by owner
      overlaysByOwner[overlay.owner] = (overlaysByOwner[overlay.owner] || 0) + 1

      // Count by type
      overlaysByType[overlay.overlayType] = (overlaysByType[overlay.overlayType] || 0) + 1

      // Add detailed overlay info
      overlayDetails.push({
        id: overlayId,
        owner: overlay.owner,
        type: overlay.overlayType,
        isVisible: overlay.isVisible,
        priority: overlay.priority,
        createdAt: overlay.createdAt,
      })
    }

    return {
      totalOverlays,
      overlaysByOwner,
      overlaysByType,
      activeOverlayId: this.activeOverlayId,
      queueLength: this.overlayQueue.length,
      overlayDetails,
    }
  }
}