import type { ProtectionMediator } from "../types";
import type { ProtectionEvent, ProtectionEventType } from "../protection-event";
import { LoggableComponent } from "../../../utils/base/LoggableComponent";

/**
 * Abstract base class for all event handlers
 */
export abstract class AbstractEventHandler extends LoggableComponent {
  protected mediator: ProtectionMediator
  protected subscriptionIds: string[] = []

  /**
   * Create a new event handler
   * @param mediator The protection mediator
   * @param componentName The name of the component
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(mediator: ProtectionMediator, componentName: string, debugMode = false) {
    super(componentName, debugMode)
    this.mediator = mediator

    this.initialize()
    // `log` is debug-gated by the logger; the outer check is unnecessary.
    this.log("Initialized and subscribed to events")
  }

  /**
   * Initialize the handler and subscribe to events
   * This method should be implemented by subclasses
   */
  protected abstract initialize(): void

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