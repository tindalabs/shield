import { isBrowser } from "./environment"
import { SimpleLoggingService } from "./logging/simple/SimpleLoggingService"

/**
 * Options for event registration
 */
export interface EventRegistrationOptions extends AddEventListenerOptions {
  /**
   * Optional ID for the event (auto-generated if not provided)
   */
  id?: string

  /**
   * Priority for the event handler (higher executes first)
   * @default 0
   */
  priority?: number
}

/**
 * Stored event information
 */
interface StoredEvent {
  /**
   * The event type (e.g., "click", "keydown")
   */
  eventType: string

  /**
   * The event handler function
   */
  handler: EventListener

  /**
   * The wrapped handler function that includes error handling
   */
  wrappedHandler: EventListener

  /**
   * Options used when registering the event
   */
  options?: AddEventListenerOptions

  /**
   * Component or strategy that registered this event
   */
  owner: string

  /**
   * Priority for execution order (higher executes first)
   * @default 0
   */
  priority: number
}

/**
 * Target identifier for DOM elements
 */
type TargetId = string | symbol

/**
 * EventManager centralizes event handling across protection strategies
 * It provides a unified API for registering and removing event listeners
 * and ensures proper cleanup when strategies are removed
 */
export class EventManager {
  private static instance: EventManager | null = null

  // Main storage: Map<TargetId, Map<EventId, StoredEvent>>
  private events: Map<TargetId, Map<string, StoredEvent>> = new Map()

  // WeakMap to associate DOM elements with their target IDs
  private targetMap: WeakMap<EventTarget, TargetId> = new WeakMap()

  // Special symbols for document and window
  private readonly DOCUMENT_SYMBOL = Symbol("document")
  private readonly WINDOW_SYMBOL = Symbol("window")

  private logger: SimpleLoggingService

  /**
   * Create a new EventManager
   * @param debugMode Enable debug mode for troubleshooting
   */
  private constructor(debugMode = false) {
    this.logger = new SimpleLoggingService("EventManager", debugMode)
    this.logger.log("Initialized")
  }

  /**
   * Get the EventManager instance (singleton)
   * @param debugMode Enable debug mode for troubleshooting
   */
  public static getInstance(debugMode = false): EventManager {
    if (!EventManager.instance) {
      EventManager.instance = new EventManager(debugMode)
    }

    // Update debug mode if it's explicitly passed
    if (arguments.length > 0) {
      EventManager.instance.setDebugMode(debugMode)
    }

    return EventManager.instance
  }

  /**
   * Register an event listener
   * @param target The target element, document, or window
   * @param eventType The type of event (e.g., "click", "keydown")
   * @param handler The event handler function
   * @param owner The component or strategy that owns this event
   * @param options Additional options for the event listener
   * @returns The ID of the registered event
   */
  public addEventListener(
    target: EventTarget | null,
    eventType: string,
    handler: EventListener,
    owner: string,
    options?: EventRegistrationOptions,
  ): string {
    if (!isBrowser() || !target) {
      this.logger.log(`Cannot add event, ${!isBrowser() ? "not in browser" : "target is null"}`)
      return ""
    }

    // Get or create target ID
    const targetId = this.getTargetId(target)
    if(!targetId) return ""

    // Get or create event map for this target
    if (!this.events.has(targetId)) {
      this.events.set(targetId, new Map())
    }

    const targetEvents = this.events.get(targetId)!

    // Generate event ID if not provided
    const eventId = options?.id || `${owner}-${eventType}-${Date.now()}`

    // Set default priority if not specified
    const priority = options?.priority !== undefined ? options.priority : 0

    // Create a wrapped handler with error handling
    const wrappedHandler = (e: Event): void => {
      try {
        return handler(e)
      } catch (error) {
        this.logger.error(`Error in ${eventType} event handler for ${owner}:`, error)
        // Continue event propagation by not returning false
      }
    }

    // Store event information
    const storedEvent: StoredEvent = {
      eventType,
      handler,
      wrappedHandler,
      options,
      owner,
      priority,
    }

    // Add event listener to the target
    try {
      target.addEventListener(eventType, wrappedHandler, options)

      // Store the event information
      targetEvents.set(eventId, storedEvent)

      this.logger.log(`Added ${eventType} event for ${owner} with ID ${eventId} and priority ${priority}`)

      return eventId
    } catch (error) {
      this.logger.error(`Error adding ${eventType} event:`, error)
      return ""
    }
  }

  /**
   * Remove a specific event listener by ID
   * @param target The target element, document, or window
   * @param eventId The ID of the event to remove
   * @returns True if the event was removed, false otherwise
   */
  public removeEventListener(target: EventTarget | null, eventId: string): boolean {
    if (!isBrowser() || !target) {
      return false
    }

    const targetId = this.getTargetId(target, false)
    if (!targetId) return false

    const targetEvents = this.events.get(targetId)
    if (!targetEvents || !targetEvents.has(eventId)) {
      return false
    }

    // Get the stored event information
    const storedEvent = targetEvents.get(eventId)!

    // Remove the event listener
    try {
      target.removeEventListener(storedEvent.eventType, storedEvent.wrappedHandler, storedEvent.options)

      // Remove from our map
      targetEvents.delete(eventId)

      // Clean up the target map if no more events
      if (targetEvents.size === 0) {
        this.events.delete(targetId)

        // Only remove from targetMap if it's not document or window
        if (targetId !== this.DOCUMENT_SYMBOL && targetId !== this.WINDOW_SYMBOL) {
          this.targetMap.delete(target)
        }
      }

      this.logger.log(`Removed event ${eventId} (${storedEvent.eventType}) for ${storedEvent.owner}`)

      return true
    } catch (error) {
      this.logger.error(`Error removing event ${eventId}:`, error)
      return false
    }
  }

  /**
   * Remove all event listeners for a specific owner (strategy/component)
   * @param owner The owner to remove events for
   * @returns The number of events removed
   */
  public removeEventsByOwner(owner: string): number {
    if (!isBrowser()) return 0

    let removedCount = 0

    // We need to track which target IDs to clean up after removal
    const emptyTargetIds: TargetId[] = []

    // Iterate through all targets
    for (const [targetId, targetEvents] of this.events.entries()) {
      // Find all events owned by this owner
      const eventsToRemove: string[] = []

      for (const [eventId, storedEvent] of targetEvents.entries()) {
        if (storedEvent.owner === owner) {
          eventsToRemove.push(eventId)
        }
      }

      // If we have events to remove, try to get the target
      if (eventsToRemove.length > 0) {
        const target = this.getTargetFromId(targetId)

        if (target) {
          // For document and window targets, we can reliably remove events
          if (targetId === this.DOCUMENT_SYMBOL || targetId === this.WINDOW_SYMBOL) {
            // Remove each event
            for (const eventId of eventsToRemove) {
              if (this.removeEventListener(target, eventId)) {
                removedCount++
              }
            }
          } else {
            // For DOM elements that might be recreated (like in Vue),
            // we need to be more cautious and remove handlers directly
            for (const eventId of eventsToRemove) {
              const storedEvent = targetEvents.get(eventId)
              if (storedEvent) {
                try {
                  target.removeEventListener(storedEvent.eventType, storedEvent.wrappedHandler, storedEvent.options)
                  targetEvents.delete(eventId)
                  removedCount++

                  this.logger.log(
                    `Removed event ${eventId} (${storedEvent.eventType}) for ${storedEvent.owner}`
                  )
                } catch (e) {
                  // If we can't remove the listener, just remove from our maps
                  targetEvents.delete(eventId)
                  removedCount++

                  this.logger.log(
                    `Removed event ${eventId} from maps only - could not remove listener directly (${String(e)})`
                  )
                }
              }
            }
          }
        } else {
          // For targets we can't retrieve (due to WeakMap limitations),
          // we'll just remove the event entries from our maps
          for (const eventId of eventsToRemove) {
            const storedEvent = targetEvents.get(eventId)
            if (storedEvent) {
              targetEvents.delete(eventId)
              removedCount++

              this.logger.log(
                `Removed event ${eventId} (${storedEvent.eventType}) for ${storedEvent.owner} (target unavailable)`
              )
            }
          }
        }

        // Check if the target events map is now empty
        if (targetEvents.size === 0) {
          emptyTargetIds.push(targetId)
        }
      }
    }

    // Clean up empty target maps
    for (const targetId of emptyTargetIds) {
      this.events.delete(targetId)
    }

    if (removedCount > 0) {
      this.logger.log(`Removed ${removedCount} events for owner ${owner}`)
    }

    return removedCount
  }

  /**
   * Remove all event listeners for a specific target
   * @param target The target to remove events from
   * @returns The number of events removed
   */
  public removeAllEventsForTarget(target: EventTarget | null): number {
    if (!isBrowser() || !target) return 0

    const targetId = this.getTargetId(target, false)
    if (!targetId) return 0

    const targetEvents = this.events.get(targetId)
    if (!targetEvents) return 0

    let removedCount = 0

    // Create a copy of the event IDs to avoid modification during iteration
    const eventIds = Array.from(targetEvents.keys())

    for (const eventId of eventIds) {
      try {
        const storedEvent = targetEvents.get(eventId)
        if (storedEvent) {
          // Try to properly remove the event listener
          target.removeEventListener(storedEvent.eventType, storedEvent.wrappedHandler, storedEvent.options)

          // Remove from our map
          targetEvents.delete(eventId)
          removedCount++

          this.logger.log(`Removed event ${eventId} (${storedEvent.eventType}) from target`)
        }
      } catch (e) {
        // If removal fails, still remove from our maps
        targetEvents.delete(eventId)
        removedCount++

        this.logger.log(`Removed event ${eventId} from maps (${String(e)})`)
      }
    }

    if (removedCount > 0) {
      this.logger.log(`Removed ${removedCount} events for target`)
    }

    return removedCount
  }

  /**
   * Get all event IDs for a specific owner
   * @param owner The owner to get events for
   * @returns Array of event IDs
   */
  public getEventsByOwner(owner: string): string[] {
    if (!isBrowser()) return []

    const eventIds: string[] = []

    for (const targetEvents of this.events.values()) {
      for (const [eventId, storedEvent] of targetEvents.entries()) {
        if (storedEvent.owner === owner) {
          eventIds.push(eventId)
        }
      }
    }

    return eventIds
  }

  /**
   * Check if an event exists
   * @param target The target element
   * @param eventId The event ID
   * @returns True if the event exists
   */
  public hasEvent(target: EventTarget | null, eventId: string): boolean {
    if (!isBrowser() || !target) return false

    const targetId = this.getTargetId(target, false)
    if (!targetId) return false

    const targetEvents = this.events.get(targetId)
    return targetEvents ? targetEvents.has(eventId) : false
  }

  /**
   * Get a unique identifier for a target
   * @param target The target element, document, or window
   * @param create Whether to create a new ID if one doesn't exist
   * @returns The target ID
   */
  private getTargetId(target: EventTarget, create = true): TargetId | null {
    // Special cases for document and window
    if (target === document) {
      return this.DOCUMENT_SYMBOL
    }

    if (target === window) {
      return this.WINDOW_SYMBOL
    }

    // Check if we already have an ID for this target
    let targetId = this.targetMap.get(target)

    // Create a new ID if needed
    if (!targetId && create) {
      targetId = `target-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      this.targetMap.set(target, targetId)
    }

    return targetId || null
  }

  /**
   * Get a target from its ID
   * @param targetId The target ID
   * @returns The target element or null
   */
  private getTargetFromId(targetId: TargetId): EventTarget | null {
    if (!isBrowser()) return null

    // Special cases for document and window
    if (targetId === this.DOCUMENT_SYMBOL) {
      return document
    }

    if (targetId === this.WINDOW_SYMBOL) {
      return window
    }

    // For other targets, we can't easily look up by ID since WeakMap doesn't support iteration
    // This is a limitation of WeakMap, but in practice, most events will be on document/window
    // For element-specific events, we'll need to rely on the caller having a reference to the element

    // Return null for other target IDs - this means some operations like removeEventsByOwner
    // will only work fully for document and window events
    this.logger.warn(
      `Cannot retrieve target for ID ${String(targetId)}. This is a limitation for element-specific events.`
    )
    return null
  }

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  public setDebugMode(enabled: boolean): void {
    this.logger.setDebugMode(enabled)
    this.logger.log(`Debug mode ${enabled ? "enabled" : "disabled"}`)
  }

  /**
   * Get the number of registered events
   * @returns The total number of registered events
   */
  public getEventCount(): number {
    let count = 0

    for (const targetEvents of this.events.values()) {
      count += targetEvents.size
    }

    return count
  }

  /**
   * Get debug information about registered events
   * @returns Object with debug information
   */
  public getDebugInfo(): {
    totalEvents: number
    eventsByOwner: Record<string, number>
    eventsByType: Record<string, number>
    eventDetails: Array<{
      targetId: string | symbol
      eventId: string
      eventType: string
      owner: string
      priority: number
    }>
  } {
    const eventsByOwner: Record<string, number> = {}
    const eventsByType: Record<string, number> = {}
    let totalEvents = 0
    const eventDetails: Array<{
      targetId: string | symbol
      eventId: string
      eventType: string
      owner: string
      priority: number
    }> = []

    for (const [targetId, targetEvents] of this.events.entries()) {
      for (const [eventId, storedEvent] of targetEvents.entries()) {
        totalEvents++

        // Count by owner
        eventsByOwner[storedEvent.owner] = (eventsByOwner[storedEvent.owner] || 0) + 1

        // Count by event type
        eventsByType[storedEvent.eventType] = (eventsByType[storedEvent.eventType] || 0) + 1

        // Add detailed event info
        eventDetails.push({
          targetId: targetId,
          eventId,
          eventType: storedEvent.eventType,
          owner: storedEvent.owner,
          priority: storedEvent.priority,
        })
      }
    }

    return {
      totalEvents,
      eventsByOwner,
      eventsByType,
      eventDetails,
    }
  }

  /**
   * Clear all registered events
   * @returns The number of events removed
   */
  public clearAllEvents(): number {
    if (!isBrowser()) return 0

    let removedCount = 0

    // Handle document and window events first
    if (this.events.has(this.DOCUMENT_SYMBOL)) {
      removedCount += this.removeAllEventsForTarget(document)
    }

    if (this.events.has(this.WINDOW_SYMBOL)) {
      removedCount += this.removeAllEventsForTarget(window)
    }

    // For other targets, we'll have to just clear our maps
    // Create a copy of the entries to avoid modification during iteration
    const entries = Array.from(this.events.entries())

    for (const [targetId, targetEvents] of entries) {
      // Skip document and window as we already handled them
      if (targetId === this.DOCUMENT_SYMBOL || targetId === this.WINDOW_SYMBOL) {
        continue
      }

      // For other targets, just clear the events from our maps
      removedCount += targetEvents.size
      this.events.delete(targetId)

      this.logger.log(
        `Cleared ${targetEvents.size} events for target ID ${String(targetId)} (target unavailable)`
      )
    }

    // Clear the target map
    this.targetMap = new WeakMap()

    if (removedCount > 0) {
      this.logger.log(`Cleared all ${removedCount} events`)
    }

    return removedCount
  }

  /**
   * Check if an event handler is already registered for this target, event type, and owner
   * This helps prevent duplicate registrations
   * @param target The target element
   * @param eventType The event type (e.g., "click", "contextmenu")
   * @param owner The owner of the event handler
   * @returns True if an event handler is already registered
   */
  public hasRegisteredEventType(target: EventTarget | null, eventType: string, owner: string): boolean {
    if (!isBrowser() || !target) return false

    const targetId = this.getTargetId(target, false)
    if (!targetId) return false

    const targetEvents = this.events.get(targetId)
    if (!targetEvents) return false

    // Check if any event of this type is already registered for this owner
    for (const storedEvent of targetEvents.values()) {
      if (storedEvent.eventType === eventType && storedEvent.owner === owner) {
        return true
      }
    }

    return false
  }

  /**
   * Check for potential conflicts with existing event listeners
   * @param target The target element
   * @param eventType The event type (e.g., "click", "contextmenu")
   * @param owner The owner of the event handler
   * @returns Object with conflict information
   */
  public checkForConflicts(
    target: EventTarget | null,
    eventType: string,
    owner: string,
  ): {
    hasConflicts: boolean
    conflictsWith: Array<{ owner: string; eventId: string }>
  } {
    const result = {
      hasConflicts: false,
      conflictsWith: [] as Array<{ owner: string; eventId: string }>,
    }

    if (!isBrowser() || !target) {
      return result
    }

    const targetId = this.getTargetId(target, false)
    if (!targetId) return result

    const targetEvents = this.events.get(targetId)
    if (!targetEvents) return result

    for (const [eventId, storedEvent] of targetEvents.entries()) {
      if (storedEvent.eventType === eventType && storedEvent.owner !== owner) {
        result.hasConflicts = true
        result.conflictsWith.push({
          owner: storedEvent.owner,
          eventId,
        })
      }
    }

    return result
  }

  /**
   * Get events of a specific type for a target
   * @param target The target element
   * @param eventType The event type (e.g., "click", "contextmenu")
   * @returns Array of event information
   */
  public getEventsByType(
    target: EventTarget | null,
    eventType: string,
  ): Array<{
    eventId: string
    owner: string
    priority: number
  }> {
    const events: Array<{ eventId: string; owner: string; priority: number }> = []

    if (!isBrowser() || !target) {
      return events
    }

    const targetId = this.getTargetId(target, false)
    if (!targetId) return events

    const targetEvents = this.events.get(targetId)
    if (!targetEvents) return events

    for (const [eventId, storedEvent] of targetEvents.entries()) {
      if (storedEvent.eventType === eventType) {
        events.push({
          eventId,
          owner: storedEvent.owner,
          priority: storedEvent.priority,
        })
      }
    }

    // Sort by priority (higher first)
    return events.sort((a, b) => b.priority - a.priority)
  }

  /**
   * Remove event listeners by selector
   * Useful for Vue components and other dynamically created elements
   * @param selector CSS selector to match elements
   * @param eventType The event type (e.g., "click", "contextmenu")
   * @param owner The owner of the event handler
   * @returns The number of events removed
   */
  public removeEventsBySelector(selector: string, eventType: string, owner: string): number {
    if (!isBrowser()) return 0

    let removedCount = 0

    try {
      // Find all matching elements
      const elements = document.querySelectorAll(selector)

      if (elements.length > 0) {
        this.logger.log(
          `Attempting to remove ${eventType} events for ${owner} on ${elements.length} matched elements`
        )

        // For each element, find and remove matching events
        elements.forEach((element) => {
          const targetId = this.getTargetId(element, false)
          if (targetId) {
            const targetEvents = this.events.get(targetId)
            if (targetEvents) {
              for (const [eventId, storedEvent] of targetEvents.entries()) {
                if (storedEvent.owner === owner && storedEvent.eventType === eventType) {
                  element.removeEventListener(eventType, storedEvent.wrappedHandler, storedEvent.options)
                  targetEvents.delete(eventId)
                  removedCount++
                  this.logger.log(`Removed ${eventType} event for ${owner} via selector`)
                }
              }
            }
          }
        })
      }
    } catch (error) {
      this.logger.error("Error removing events by selector:", error)
    }

    return removedCount
  }
}

// Export a singleton instance
export const eventManager = EventManager.getInstance()