import type { ProtectionStrategy } from "../types"
import { eventManager } from "../utils/eventManager"
import { isBrowser } from "../utils/environment"
import type { MediatorAware, ProtectionMediator } from "../core/mediator/types"
import { SimpleLoggingService } from "../utils/logging/simple/SimpleLoggingService"

/**
 * Error types for protection strategies
 */
export enum StrategyErrorType {
  INITIALIZATION = "initialization",
  APPLICATION = "application",
  REMOVAL = "removal",
  EVENT_HANDLING = "event_handling",
  OPTION_UPDATE = "option_update",
  UNKNOWN = "unknown",
}

/**
 * Custom error class for protection strategies
 */
export class StrategyError extends Error {
  /**
   * Create a new StrategyError
   * @param strategyName Name of the strategy where the error occurred
   * @param errorType Type of error that occurred
   * @param message Error message
   * @param originalError Original error that was caught (if any)
   */
  constructor(
    public readonly strategyName: string,
    public readonly errorType: StrategyErrorType,
    message: string,
    public readonly originalError?: Error | unknown,
  ) {
    super(`[${strategyName}] ${message}${originalError instanceof Error ? `: ${originalError.message}` : ""}`)
    this.name = "StrategyError"

    // Maintain the stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StrategyError)
    }
  }
}

/**
 * Abstract base class for protection strategies
 * Implements common functionality to reduce duplication
 */
export abstract class AbstractStrategy implements ProtectionStrategy, MediatorAware {
  public readonly STRATEGY_NAME: string
  public readonly COMPONENT_NAME: string
  protected debugMode: boolean
  protected mediator: ProtectionMediator | null = null
  protected isAppliedFlag = false
  protected logger: SimpleLoggingService
  protected eventIds: string[] = []

  /**
   * Create a new strategy
   * @param strategyName Unique name for the strategy
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(strategyName: string, debugMode = false) {
    this.STRATEGY_NAME = strategyName
    this.COMPONENT_NAME = strategyName
    this.debugMode = debugMode
    this.logger = new SimpleLoggingService(strategyName, debugMode)
  }

  /**
   * Set the mediator
   * to communicate with the other components
   */
  public setMediator(mediator: ProtectionMediator): void {
    this.mediator = mediator
    this.logger.log("Mediator set")
  }

  /**
   * Apply the protection strategy
   * Must be implemented by subclasses
   */
  public abstract apply(): void

  /**
   * Remove the protection strategy
   * Can be overridden by subclasses for custom cleanup
   */
  public remove(): void {
    try {
      if (!this.isAppliedFlag) {
        this.logger.log("Protection not applied")
        return
      }

      if (isBrowser()) {
        // Remove all event listeners using EventManager
        const removedCount = this.removeEventsByOwner()

        // Clear the event IDs array
        this.eventIds = []

        this.isAppliedFlag = false

        this.logger.log(`Protection removed (${removedCount} events)`)
      }
    } catch (error) {
      this.handleError(StrategyErrorType.REMOVAL, "Failed to remove protection", error)
    }
  }

  /**
   * Check if the strategy is currently applied
   */
  public isApplied(): boolean {
    return this.isAppliedFlag
  }

  /**
   * Update strategy options
   * Should be implemented by subclasses that support options
   */
  public updateOptions(options: Record<string, unknown>): void {
    try {
      // Default implementation just logs that the method is not implemented
      this.logger.log("Method updateOptions not implemented", options)
    } catch (error) {
      this.handleError(StrategyErrorType.OPTION_UPDATE, "Failed to update options", error)
    }
  }

  /**
   * Get the debug mode status
   */
  public isDebugEnabled(): boolean {
    return this.debugMode
  }

  /**
   * Set debug mode
   */
  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled
    this.logger.setDebugMode(enabled)
    this.logger.log(`Debug mode ${enabled ? "enabled" : "disabled"}`)
  }

  /**
   * Handle an error that occurred in the strategy
   * @param errorType Type of error
   * @param message Error message
   * @param originalError Original error that was caught
   */
  protected handleError(errorType: StrategyErrorType, message: string, originalError?: unknown): void {
    const error = new StrategyError(this.STRATEGY_NAME, errorType, message, originalError)

    if (this.debugMode) {
      console.error(error)
      if (error.originalError instanceof Error && error.originalError.stack) {
        console.error("Original stack:", error.originalError.stack)
      }
    } else {
      console.error(error.message)
    }
  }

  /**
   * Log a debug message if debug mode is enabled
   * @param message Message to log
   * @param args Additional arguments to log
   */
  protected log(message: string, ...args: unknown[]): void {
    this.logger.log(message, ...args)
  }

  /**
   * Log a warning message
   * @param message Warning message
   * @param args Additional arguments to log
   */
  protected warn(message: string, ...args: unknown[]): void {
    this.logger.warn(message, ...args)
  }

  /**
   * Log an error message
   * @param message Error message
   * @param args Additional arguments to log
   */
  protected error(message: string, ...args: unknown[]): void {
    this.logger.error(message, ...args)
  }

  /**
   * Execute a function with error handling
   * @param operation Name of the operation for error reporting
   * @param errorType Type of error for categorization
   * @param fn Function to execute
   * @returns The result of the function or undefined if an error occurred
   */
  protected safeExecute<T>(operation: string, errorType: StrategyErrorType, fn: () => T): T | undefined {
    try {
      return fn()
    } catch (error) {
      this.handleError(errorType, `Error during ${operation}`, error)
      return undefined
    }
  }

  /**
   * Execute an async function with error handling
   * @param operation Name of the operation for error reporting
   * @param errorType Type of error for categorization
   * @param fn Async function to execute
   * @returns Promise resolving to the result of the function or undefined if an error occurred
   */
  protected async safeExecuteAsync<T>(
    operation: string,
    errorType: StrategyErrorType,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await fn()
    } catch (error) {
      this.handleError(errorType, `Error during ${operation}`, error)
      return undefined
    }
  }

  /**
   * Register an event with the EventManager
   * @param target The target element, document, or window
   * @param eventType The type of event (e.g., "click", "keydown")
   * @param handler The event handler function
   * @param options Additional options for the event listener
   * @returns The ID of the registered event
   */
  protected registerEvent(
    target: EventTarget | null,
    eventType: string,
    handler: EventListener,
    options?: AddEventListenerOptions & { priority?: number; id?: string },
  ): string {
    if (!target || !isBrowser()) return ""

    // Defensive check: ensure the provided target supports addEventListener
    // This prevents runtime TypeError when non-DOM objects (Vue refs, selectors, etc.) are passed
    // and provides a clearer StrategyError for easier debugging.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (target as any).addEventListener !== "function") {
      this.handleError(
        StrategyErrorType.EVENT_HANDLING,
        `Invalid event target for ${eventType} - target does not implement addEventListener`,
        new Error("target.addEventListener is not a function"),
      )
      return ""
    }

    try {
      // Create a wrapped handler that includes error handling
      const wrappedHandler: EventListener = (event) => {
        try {
          return handler(event)
        } catch (error) {
          this.handleError(StrategyErrorType.EVENT_HANDLING, `Error handling ${eventType} event`, error)
        }
      }

      // Pass all options including priority to the eventManager
      const eventId = eventManager.addEventListener(target, eventType, wrappedHandler, this.STRATEGY_NAME, options)

      if (eventId) {
        this.eventIds.push(eventId)
        this.logger.log(`Registered ${eventType} event (ID: ${eventId})`)
      }

      return eventId
    } catch (error) {
      this.handleError(StrategyErrorType.EVENT_HANDLING, `Failed to register ${eventType} event`, error)
      return ""
    }
  }

  /**
   * Remove all event listeners for this strategy
   * @returns The number of events removed
   */
  protected removeEventsByOwner(): number {
    try {
      const removedCount = eventManager.removeEventsByOwner(this.STRATEGY_NAME)
      if (removedCount > 0) {
        this.logger.log(`Removed ${removedCount} events by owner ID`)
      }
      return removedCount
    } catch (error) {
      this.handleError(StrategyErrorType.REMOVAL, "Failed to remove events by owner", error)
      return 0
    }
  }

  /**
   * Remove all event listeners for a specific target
   * @param target The target to remove events from
   * @returns The number of events removed
   */
  protected removeAllEventsForTarget(target: EventTarget | null): number {
    if (!target || !isBrowser()) return 0

    try {
      const removedCount = eventManager.removeAllEventsForTarget(target)
      if (removedCount > 0) {
        this.logger.log(`Removed ${removedCount} events from target`)
      }
      return removedCount
    } catch (error) {
      this.handleError(StrategyErrorType.REMOVAL, "Failed to remove events for target", error)
      return 0
    }
  }

  /**
   * Remove event listeners by CSS selector
   * @param selector CSS selector to match elements
   * @param eventType Type of event to remove
   * @returns The number of events removed
   */
  protected removeEventsBySelector(selector: string, eventType: string): number {
    if (!isBrowser()) return 0

    try {
      const removedCount = eventManager.removeEventsBySelector(selector, eventType, this.STRATEGY_NAME)
      if (removedCount > 0) {
        this.logger.log(`Removed ${removedCount} ${eventType} events via selector "${selector}"`)
      }
      return removedCount
    } catch (error) {
      this.handleError(StrategyErrorType.REMOVAL, `Failed to remove events by selector "${selector}"`, error)
      return 0
    }
  }
}
