import { EventDataMap } from './eventDataTypes';
import { ProtectionEvent, ProtectionEventType } from './protection-event';

/**
 * Event handler function type
 */
export type ProtectionEventHandler = (event: ProtectionEvent) => void;

/**
 * Subscription information
 */
export interface Subscription {
  /**
   * Unique ID for the subscription
   */
  id: string;

  /**
   * Event type being subscribed to
   */
  eventType: ProtectionEventType;

  /**
   * Handler function for the event
   */
  handler: ProtectionEventHandler;

  /**
   * Optional filter function to determine if the handler should be called
   */
  filter?: (event: ProtectionEvent) => boolean;

  /**
   * Optional priority for the handler (higher numbers execute first)
   */
  priority?: number;

  /**
   * Optional context information (e.g., strategy name)
   */
  context?: string;
}

/**
 * Subscription options
 */
export interface SubscriptionOptions {
  /**
   * Optional filter function to determine if the handler should be called
   */
  filter?: (event: ProtectionEvent) => boolean;

  /**
   * Optional priority for the handler (higher numbers execute first)
   */
  priority?: number;

  /**
   * Optional context information (e.g., strategy name)
   */
  context?: string;
}

/**
 * Interface for the protection mediator
 */
export interface ProtectionMediator {
  /**
   * Subscribe to an event
   * @param eventType Type of event to subscribe to
   * @param handler Handler function for the event
   * @param options Optional subscription options
   * @returns Subscription ID for later unsubscribing
   */
  subscribe(eventType: ProtectionEventType, handler: ProtectionEventHandler, options?: SubscriptionOptions): string;

  /**
   * Unsubscribe from an event
   * @param subscriptionId ID of the subscription to remove
   * @returns True if the subscription was found and removed
   */
  unsubscribe(subscriptionId: string): boolean;

  /**
   * Publish an event to all subscribers
   * @param event Event to publish
   */
  publish<T extends ProtectionEventType | string>(
    event: Omit<ProtectionEvent, "data"> & {
      type: T
      data?: T extends ProtectionEventType ? EventDataMap[T] : Record<string, unknown>
    },
  ): void

  /**
   * Get all subscriptions for a specific event type
   * @param eventType Type of event to get subscriptions for
   * @returns Array of subscriptions
   */
  getSubscriptions(eventType: ProtectionEventType): Subscription[];

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  setDebugMode(enabled: boolean): void;
}

/**
 * Interface for components that can work with the mediator
 */
export interface MediatorAware {
  /**
   * Set the mediator for this component
   * @param mediator The protection mediator
   */
  setMediator(mediator: ProtectionMediator): void;
  
  /**
   * Get the component name
   * Used to identify the component in mediator communications
   */
  readonly COMPONENT_NAME: string; //REFACTOR STRATEGYNAME WITH THIS OR EQUIVALENT
}