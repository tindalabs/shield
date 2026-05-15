import type { ProtectionMediator } from "../types";
import type { ProtectionEvent, ProtectionEventType } from "../protection-event";
import { SimpleLoggingService } from "../../../utils/logging/simple/SimpleLoggingService";

/**
 * Abstract base class for all event handlers
 */
export abstract class AbstractEventHandler {
  protected mediator: ProtectionMediator
  protected readonly COMPONENT_NAME: string
  protected logger: SimpleLoggingService
  protected debugMode: boolean
  protected subscriptionIds: string[] = []

  /**
   * Create a new event handler
   * @param mediator The protection mediator
   * @param componentName The name of the component
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(mediator: ProtectionMediator, componentName: string, debugMode = false) {
    this.mediator = mediator
    this.COMPONENT_NAME = componentName
    this.debugMode = debugMode

    // Create a logger instance for this component
    this.logger = new SimpleLoggingService(componentName, debugMode)

    this.initialize()

    if (this.debugMode) {
      this.log("Initialized and subscribed to events")
    }
  }

  /**
   * Initialize the handler and subscribe to events
   * This method should be implemented by subclasses
   */
  protected abstract initialize(): void

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled
    this.logger.setDebugMode(enabled)

    if (this.debugMode) {
      this.log(`Debug mode ${enabled ? "enabled" : "disabled"}`)
    }
  }

  /**
   * Subscribe to an event and track the subscription ID
   * @param eventType The event type to subscribe to
   * @param handler The event handler function
   * @param options Optional subscription options
   * @returns The subscription ID
   */
  protected subscribe(
    eventType: ProtectionEventType,
    handler: (event: ProtectionEvent) => void,
    options?: { context?: string },
  ): string {
    const subId = this.mediator.subscribe(eventType, handler, {
      ...options,
      context: options?.context || this.COMPONENT_NAME,
    })

    this.subscriptionIds.push(subId)

    if (this.debugMode) {
      this.log(`Subscribed to ${eventType} with ID ${subId}`)
    }

    return subId
  }

  /**
   * Log a debug message if debug mode is enabled
   * @param message Message to log
   * @param args Additional arguments to log
   */
  protected log(message: string, ...args: unknown[]): void {
    if (this.debugMode) {
      this.logger.log(message, ...args)
    }
  }

  /**
   * Log a warning message
   * @param message Warning message
   * @param args Additional arguments to log
   */
  protected warn(message: string, ...args: unknown[]): void {
    if (this.debugMode) {
      this.logger.warn(message, ...args)
    } else {
      // In non-debug mode, only log the message without args for brevity
      console.warn(`${this.COMPONENT_NAME}: ${message}`)
    }
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
   * Unsubscribe from all events and clean up
   */
  public dispose(): void {
    if (this.debugMode) {
      this.log(`Disposing handler, unsubscribing from ${this.subscriptionIds.length} events`)
    }

    // Unsubscribe from all events
    for (const id of this.subscriptionIds) {
      this.mediator.unsubscribe(id)
    }
    this.subscriptionIds = []

    this.onDispose()
  }

  /**
   * Additional cleanup to be performed on disposal
   * This method can be overridden by subclasses
   */
  protected onDispose(): void {
    // Default implementation does nothing
  }
}