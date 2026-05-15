import type { MediatorAware, ProtectionMediator } from "../core/mediator/types"
import { ProtectionEvent, ProtectionEventType } from "../core/mediator/protection-event"
import { isEventType } from "../core/mediator/eventDataTypes"
import { SimpleLoggingService } from "../utils/logging/simple/SimpleLoggingService"

/**
 * Options for the protected content placeholder
 */
export interface PlaceholderOptions {
  /**
   * Title to display in the placeholder
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
   * Text color for the placeholder
   */
  textColor?: string

  /**
   * Background color for the placeholder
   */
  backgroundColor?: string
}

/**
 * Information about stored content state
 */
interface StoredContentState {
  /**
   * ID of the content state
   */
  id: string

  /**
   * Strategy or component that requested content to be hidden
   */
  owner: string

  /**
   * Reason for hiding content
   */
  reason: string

  /**
   * Options used for the placeholder
   */
  options: PlaceholderOptions

  /**
   * Priority for content hiding (higher numbers take precedence)
   * @default 0
   */
  priority: number

  /**
   * Timestamp when content was hidden
   */
  hiddenAt: number
}

/**
 * Utility class to manage protected content by hiding and revealing it
 */
export class ProtectedContentManager implements MediatorAware {
  public readonly COMPONENT_NAME = "ProtectedContentManager"
  private mediator: ProtectionMediator | null = null
  private targetElement: HTMLElement
  private originalContent: string | null = null
  private debugMode: boolean
  private logger: SimpleLoggingService

  // Track content states by owner
  private contentStates: Map<string, StoredContentState> = new Map()

  // Currently active content state
  private activeStateId: string | null = null

  // Queue of content state IDs waiting to be applied
  private stateQueue: string[] = []

  // Callbacks for content visibility changes (useful for framework re-mounting)
  private onContentHiddenCallback?: (reason: string, targetElement: HTMLElement | null) => void
  private onContentRestoredCallback?: (targetElement: HTMLElement | null) => void
  private lastHideReason: string = ''

  /**
   * Create a new ProtectedContentManager
   * @param targetElement Element containing sensitive content to protect
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(targetElement: HTMLElement, debugMode = false) {
    this.targetElement = targetElement
    this.debugMode = debugMode
    this.logger = new SimpleLoggingService(this.COMPONENT_NAME, debugMode)
  }

  /**
   * Set the mediator to communicate with the other components
   * @param mediator The protection mediator instance
   */
  public setMediator(mediator: ProtectionMediator): void {
    this.mediator = mediator

    // Subscribe only to general events directly related to content management
    this.mediator.subscribe(ProtectionEventType.CONTENT_HIDDEN, this.handleContentHidden.bind(this), {
      context: this.COMPONENT_NAME,
    })

    this.mediator.subscribe(ProtectionEventType.CONTENT_RESTORED, this.handleContentRestored.bind(this), {
      context: this.COMPONENT_NAME,
    })

    this.logger.log("Mediator set and subscriptions established")
  }

  /**
   * Handle content hidden event
   * @param event The protection event containing content hidden data
   */
  private handleContentHidden(event: ProtectionEvent): void {
    try {
      this.logger.log(`Received content hidden event from ${event.source}`, event.data)

      // Use type guard for type-safe access
      if (!isEventType(event, ProtectionEventType.CONTENT_HIDDEN)) {
        this.logger.error("Received invalid event type for CONTENT_HIDDEN");
        return;
      }

      const { data } = event;

      if (!data || !data.options) return

      // Only process if this is for our target element or we're the default handler
      if (data.targetElement && data.targetElement !== this.targetElement) return

      // Register the content state
      this.registerContentState(data.strategyName, data.reason, data.options, data.priority || 0)
    } catch (error) {
      this.logger.error("Error handling content hidden event", error)
    }
  }

  /**
   * Handle content restored event
   * @param event The protection event containing content restored data
   */
  private handleContentRestored(event: ProtectionEvent): void {
    try {
      this.logger.log(`Received content restored event from ${event.source}`, event.data)

      // Use type guard for type-safe access
      if (!isEventType(event, ProtectionEventType.CONTENT_RESTORED)) {
        this.logger.error("Received invalid event type for CONTENT_RESTORED");
        return;
      }

      const { data } = event;

      // Only process if this is for our target element or we're the default handler
      if (data && data.targetElement && data.targetElement !== this.targetElement) return

      // Remove content states for this owner
      this.removeContentStatesByOwner(data.strategyName)
    } catch (error) {
      this.logger.error("Error handling content restored event", error)
    }
  }

  /**
   * Register a new content state
   * @param owner The strategy or component that owns this state
   * @param reason The reason for hiding content
   * @param options Options for the placeholder
   * @param priority Priority for content hiding (higher numbers take precedence)
   * @returns The ID of the registered content state
   */
  private registerContentState(owner: string, reason: string, options: PlaceholderOptions, priority = 0): string {
    // Generate a unique ID for the content state
    const stateId = `content-state-${owner}-${reason}-${Date.now()}`

    // Create the stored content state object
    const contentState: StoredContentState = {
      id: stateId,
      owner,
      reason,
      options: { ...options },
      priority,
      hiddenAt: Date.now(),
    }

    // Store the content state
    this.contentStates.set(stateId, contentState)

    this.logger.log(`Registered content state ${stateId} for ${owner} (${reason})`)

    // If no active state, apply this one immediately
    if (!this.activeStateId) {
      this.applyContentStateById(stateId)
    } else {
      // Otherwise, add to queue based on priority
      this.addToQueue(stateId)

      // Check if this state should replace the current one based on priority
      const activeState = this.contentStates.get(this.activeStateId)
      const newState = this.contentStates.get(stateId)

      if (activeState && newState && newState.priority > activeState.priority) {
        this.logger.log("New state has higher priority, replacing active state")

        // Apply the new state
        this.applyContentStateById(stateId)
      }
    }

    return stateId
  }

  /**
   * Add a content state to the queue
   * @param stateId ID of the content state to add to queue
   */
  private addToQueue(stateId: string): void {
    // Add to queue if not already in it
    if (!this.stateQueue.includes(stateId)) {
      this.stateQueue.push(stateId)

      // Sort queue by priority (highest first)
      this.stateQueue.sort((a, b) => {
        const stateA = this.contentStates.get(a)
        const stateB = this.contentStates.get(b)

        if (!stateA || !stateB) return 0
        return stateB.priority - stateA.priority
      })

      this.logger.log(
        `Added state ${stateId} to queue, position ${this.stateQueue.indexOf(stateId) + 1}/${this.stateQueue.length}`,
      )
    }
  }

  /**
   * Apply a specific content state by ID
   * @param stateId ID of the content state to apply
   * @returns True if the state was applied successfully
   */
  private applyContentStateById(stateId: string): boolean {
    const state = this.contentStates.get(stateId)
    if (!state) return false

    this.logger.log(`Applying content state ${stateId} (${state.reason})`)

    // Track the reason for hiding content (for callback)
    this.lastHideReason = state.reason

    // Hide content with the specified options
    this.hideContent(state.options)

    // Set as active state
    this.activeStateId = stateId

    // Remove from queue if it's in there
    this.stateQueue = this.stateQueue.filter((id) => id !== stateId)

    return true
  }

  /**
   * Remove content states for a specific owner
   * @param owner The owner to remove states for
   * @returns The number of states removed
   */
  private removeContentStatesByOwner(owner: string): number {
    let removedCount = 0
    const statesToRemove: string[] = []

    // Find all states owned by this owner
    for (const [stateId, state] of this.contentStates.entries()) {
      if (state.owner === owner) {
        statesToRemove.push(stateId)
      }
    }

    // Remove each state
    for (const stateId of statesToRemove) {
      this.contentStates.delete(stateId)
      removedCount++

      // If this was the active state, we need to restore content or apply the next state
      if (this.activeStateId === stateId) {
        this.activeStateId = null

        // Check if there are other states in the queue
        if (this.stateQueue.length > 0) {
          // Apply the next state in the queue
          const nextStateId = this.stateQueue.shift()
          if (nextStateId) {
            this.applyContentStateById(nextStateId)
          }
        } else {
          // No more states, restore the original content
          this.restoreContent()
        }
      } else {
        // If it wasn't active, just remove from queue if present
        this.stateQueue = this.stateQueue.filter((id) => id !== stateId)
      }
    }

    if (removedCount > 0) {
      this.logger.log(`Removed ${removedCount} content states for owner ${owner}`)
    }

    return removedCount
  }

  /**
   * Hide the original content and replace it with a placeholder
   * @param options Options for customizing the placeholder
   * @returns True if content was hidden, false if there was no content to hide
   */
  public hideContent(options: PlaceholderOptions): boolean {
    if (!this.targetElement) return false

    // Store original content if not already stored
    if (this.originalContent === null) {
      this.originalContent = this.targetElement.innerHTML
      this.logger.log("Original content stored")
    }

    // Create placeholder content with custom styles
    const placeholderStyles = {
      padding: "20px",
      textAlign: "center",
      color: options.textColor || "white",
      backgroundColor: options.backgroundColor || "rgba(0, 0, 0, 0.05)",
      borderRadius: "8px",
      margin: "20px",
      boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
    }

    // Convert styles object to inline style string
    const styleString = Object.entries(placeholderStyles)
      .map(([key, value]) => `${key}: ${value}`)
      .join("; ")

    // Replace content with a placeholder that uses the options text
    this.targetElement.innerHTML = `
      <div style="${styleString}">
        <h2 style="font-size: 24px; margin-bottom: 20px; color: ${options.textColor || "black"};">
          ${options.title || "Content Protected"}
        </h2>
        <p style="font-size: 16px; margin-bottom: 15px; color: ${options.textColor || "black"};">
          ${options.message || "This content is protected for security reasons."}
        </p>
        ${options.secondaryMessage
        ? `
          <p style="font-size: 16px; color: ${options.textColor || "black"};">
            ${options.secondaryMessage}
          </p>
        `
        : ""
      }
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.2);">
          <p style="font-size: 14px; color: ${options.textColor || "black"}; opacity: 0.8;">
            This content is protected by ContentSecurityToolkit
          </p>
        </div>
      </div>
    `

    this.logger.log("Content hidden")

    // Call the onContentHidden callback if registered
    if (this.onContentHiddenCallback) {
      try {
        this.onContentHiddenCallback(this.lastHideReason || 'unknown', this.targetElement)
        this.logger.log("onContentHidden callback invoked")
      } catch (error) {
        this.logger.error("Error in onContentHidden callback", error)
      }
    }

    return true
  }

  /**
   * Restore the original content
   * @returns True if content was restored, false if there was no content to restore
   */
  public restoreContent(): boolean {
    if (!this.targetElement || this.originalContent === null) return false

    // Restore the original content
    this.targetElement.innerHTML = this.originalContent
    this.originalContent = null

    this.logger.log("Original content restored")

    // Call the onContentRestored callback if registered
    if (this.onContentRestoredCallback) {
      try {
        this.onContentRestoredCallback(this.targetElement)
        this.logger.log("onContentRestored callback invoked")
      } catch (error) {
        this.logger.error("Error in onContentRestored callback", error)
      }
    }

    return true
  }

  /**
   * Check if content is currently hidden
   * @returns True if content is hidden, false otherwise
   */
  public isContentHidden(): boolean {
    return this.originalContent !== null
  }

  /**
   * Get the currently active content state ID
   * @returns The active content state ID or null if none is active
   */
  public getActiveContentStateId(): string | null {
    return this.activeStateId
  }

  /**
   * Get all content states for a specific owner
   * @param owner The owner to get states for
   * @returns Array of content state IDs
   */
  public getContentStatesByOwner(owner: string): string[] {
    const stateIds: string[] = []

    for (const [stateId, state] of this.contentStates.entries()) {
      if (state.owner === owner) {
        stateIds.push(stateId)
      }
    }

    return stateIds
  }

  /**
   * Update the target element
   * @param element New target element
   */
  public updateTargetElement(element: HTMLElement): void {
    // If content is hidden, restore it before changing the target
    if (this.isContentHidden()) {
      this.restoreContent()
    }

    this.targetElement = element

    // If we had an active state, reapply it to the new target
    if (this.activeStateId) {
      const activeState = this.contentStates.get(this.activeStateId)
      if (activeState) {
        this.hideContent(activeState.options)
      }
    }

    this.logger.log("Target element updated")
  }

  /**
   * Get the current target element
   * @returns The current target element
   */
  public getTargetElement(): HTMLElement {
    return this.targetElement
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
   * Set callbacks for content visibility changes
   * Useful for frameworks like Vue that need to re-mount components after content restoration
   * @param onHidden Callback invoked when content is hidden
   * @param onRestored Callback invoked when content is restored
   */
  public setContentCallbacks(
    onHidden?: (reason: string, targetElement: HTMLElement | null) => void,
    onRestored?: (targetElement: HTMLElement | null) => void
  ): void {
    this.onContentHiddenCallback = onHidden
    this.onContentRestoredCallback = onRestored
    this.logger.log("Content callbacks set")
  }

  /**
   * Clear all content states
   * @returns The number of states removed
   */
  public clearAllContentStates(): number {
    const stateCount = this.contentStates.size

    // Restore content if it's hidden
    if (this.isContentHidden()) {
      this.restoreContent()
    }

    // Clear all states and queue
    this.contentStates.clear()
    this.stateQueue = []
    this.activeStateId = null

    if (stateCount > 0) {
      this.logger.log(`Cleared all ${stateCount} content states`)
    }

    return stateCount
  }

  /**
   * Get debug information about content states
   * @returns Object with debug information
   */
  public getDebugInfo(): {
    totalStates: number
    statesByOwner: Record<string, number>
    statesByReason: Record<string, number>
    activeStateId: string | null
    queueLength: number
    stateDetails: Array<{
      id: string
      owner: string
      reason: string
      priority: number
      hiddenAt: number
    }>
  } {
    const statesByOwner: Record<string, number> = {}
    const statesByReason: Record<string, number> = {}
    let totalStates = 0
    const stateDetails: Array<{
      id: string
      owner: string
      reason: string
      priority: number
      hiddenAt: number
    }> = []

    for (const [stateId, state] of this.contentStates.entries()) {
      totalStates++

      // Count by owner
      statesByOwner[state.owner] = (statesByOwner[state.owner] || 0) + 1

      // Count by reason
      statesByReason[state.reason] = (statesByReason[state.reason] || 0) + 1

      // Add detailed state info
      stateDetails.push({
        id: stateId,
        owner: state.owner,
        reason: state.reason,
        priority: state.priority,
        hiddenAt: state.hiddenAt,
      })
    }

    return {
      totalStates,
      statesByOwner,
      statesByReason,
      activeStateId: this.activeStateId,
      queueLength: this.stateQueue.length,
      stateDetails,
    }
  }
}