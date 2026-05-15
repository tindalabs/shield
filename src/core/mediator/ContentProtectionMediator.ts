import { ProtectionEvent, ProtectionEventType } from './protection-event';
import { ProtectionEventHandler, ProtectionMediator, Subscription, SubscriptionOptions } from './types';

/**
 * Mediator for coordinating communication between protection strategies
 * Implements the mediator pattern to decouple strategies and enable event-based communication
 */
export class ContentProtectionMediator implements ProtectionMediator {
  private subscriptions: Map<ProtectionEventType, Subscription[]> = new Map();
  private subscriptionCounter = 0;
  private debugMode: boolean;
  private eventHistory: ProtectionEvent[] = [];
  private readonly MAX_HISTORY_SIZE = 100;

  /**
   * Create a new ContentProtectionMediator
   * @param debugMode Enable debug mode for detailed logging
   */
  constructor(debugMode = false) {
    this.debugMode = debugMode;

    if (this.debugMode) {
      console.log('ContentProtectionMediator: Initialized');
    }
  }

  /**
   * Subscribe to an event
   * @param eventType Type of event to subscribe to
   * @param handler Handler function for the event
   * @param options Optional subscription options
   * @returns Subscription ID for later unsubscribing
   */
  public subscribe(
    eventType: ProtectionEventType,
    handler: ProtectionEventHandler,
    options?: SubscriptionOptions
  ): string {
    if (!handler || typeof handler !== 'function') {
      console.error('ContentProtectionMediator: Invalid handler provided to subscribe');
      return '';
    }

    // Generate a unique subscription ID
    const subscriptionId = `sub_${++this.subscriptionCounter}`;

    // Create the subscription object
    const subscription: Subscription = {
      id: subscriptionId,
      eventType,
      handler,
      filter: options?.filter,
      priority: options?.priority || 0,
      context: options?.context
    };

    // Get or create the array of subscriptions for this event type
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }

    // Add the subscription to the array
    const subscriptionsForType = this.subscriptions.get(eventType)!;
    subscriptionsForType.push(subscription);

    // Sort by priority (higher numbers first)
    subscriptionsForType.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    if (this.debugMode) {
      console.log(`ContentProtectionMediator: Subscribed to ${eventType} with ID ${subscriptionId}`,
        options ? `(priority: ${options.priority || 0}, context: ${options.context || 'none'})` : '');
    }

    return subscriptionId;
  }

  /**
   * Unsubscribe from an event
   * @param subscriptionId ID of the subscription to remove
   * @returns True if the subscription was found and removed
   */
  public unsubscribe(subscriptionId: string): boolean {
    if (!subscriptionId) return false;

    let found = false;

    // Check all event types
    for (const [eventType, subscriptions] of this.subscriptions.entries()) {
      const initialLength = subscriptions.length;

      // Filter out the subscription with the given ID
      const filteredSubscriptions = subscriptions.filter(sub => sub.id !== subscriptionId);

      if (filteredSubscriptions.length < initialLength) {
        // We found and removed the subscription
        this.subscriptions.set(eventType, filteredSubscriptions);
        found = true;

        if (this.debugMode) {
          console.log(`ContentProtectionMediator: Unsubscribed from ${eventType} with ID ${subscriptionId}`);
        }

        break;
      }
    }

    return found;
  }

  /**
   * Unsubscribe all handlers with a specific context
   * @param context Context to unsubscribe (e.g., strategy name)
   * @returns Number of subscriptions removed
   */
  public unsubscribeByContext(context: string): number {
    if (!context) return 0;

    let removedCount = 0;

    // Check all event types
    for (const [eventType, subscriptions] of this.subscriptions.entries()) {
      const initialLength = subscriptions.length;

      // Filter out subscriptions with the given context
      const filteredSubscriptions = subscriptions.filter(sub => sub.context !== context);

      if (filteredSubscriptions.length < initialLength) {
        // We found and removed subscriptions
        const removed = initialLength - filteredSubscriptions.length;
        removedCount += removed;

        this.subscriptions.set(eventType, filteredSubscriptions);

        if (this.debugMode) {
          console.log(`ContentProtectionMediator: Unsubscribed ${removed} handlers for ${context} from ${eventType}`);
        }
      }
    }

    return removedCount;
  }

  /**
   * Publish an event to all subscribers
   * @param event Event to publish
   */
  public publish(event: ProtectionEvent): void {
    console.log('Publishing event', event);
    if (!event || !event.type) {
      console.error('ContentProtectionMediator: Invalid event provided to publish');
      return;
    }

    // Add timestamp if not provided
    if (!event.timestamp) {
      event.timestamp = Date.now();
    }

    // Store in history for debugging
    this.addToEventHistory(event);

    // Get subscriptions for this event type
    const subscriptions = this.subscriptions.get(event.type) || [];

    if (subscriptions.length === 0) {
      if (this.debugMode) {
        console.log(`ContentProtectionMediator: No subscribers for ${event.type}`);
      }
      return;
    }

    if (this.debugMode) {
      console.log(`ContentProtectionMediator: Publishing ${event.type} from ${event.source}`,
        event.data ? `with data: ${JSON.stringify(event.data)}` : '');
    }

    // Call each handler
    for (const subscription of subscriptions) {
      try {
        // Apply filter if provided
        if (subscription.filter && !subscription.filter(event)) {
          continue;
        }

        // Call the handler
        subscription.handler(event);
      } catch (error) {
        console.error(`ContentProtectionMediator: Error in handler for ${event.type}:`, error);
      }
    }
  }

  /**
   * Get all subscriptions for a specific event type
   * @param eventType Type of event to get subscriptions for
   * @returns Array of subscriptions
   */
  public getSubscriptions(eventType: ProtectionEventType): Subscription[] {
    return [...(this.subscriptions.get(eventType) || [])];
  }

  /**
   * Get all subscriptions
   * @returns Map of event types to subscriptions
   */
  public getAllSubscriptions(): Map<ProtectionEventType, Subscription[]> {
    // Return a deep copy to prevent external modification
    const result = new Map<ProtectionEventType, Subscription[]>();

    for (const [eventType, subscriptions] of this.subscriptions.entries()) {
      result.set(eventType, [...subscriptions]);
    }

    return result;
  }

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;

    if (this.debugMode) {
      console.log('ContentProtectionMediator: Debug mode enabled');
    }
  }

  /**
   * Get debug information about the mediator
   * @returns Object with debug information
   */
  public getDebugInfo(): {
    subscriptionCount: number;
    eventTypeCount: number;
    eventTypes: string[];
    recentEvents: ProtectionEvent[];
  } {
    let totalSubscriptions = 0;

    for (const subscriptions of this.subscriptions.values()) {
      totalSubscriptions += subscriptions.length;
    }

    return {
      subscriptionCount: totalSubscriptions,
      eventTypeCount: this.subscriptions.size,
      eventTypes: Array.from(this.subscriptions.keys()),
      recentEvents: [...this.eventHistory]
    };
  }

  /**
   * Add an event to the history
   * @param event Event to add
   */
  private addToEventHistory(event: ProtectionEvent): void {
    this.eventHistory.unshift(event);

    // Limit history size
    if (this.eventHistory.length > this.MAX_HISTORY_SIZE) {
      this.eventHistory.pop();
    }
  }

  /**
   * Clear all subscriptions
   * @returns Number of subscriptions cleared
   */
  public clearAllSubscriptions(): number {
    let count = 0;

    for (const subscriptions of this.subscriptions.values()) {
      count += subscriptions.length;
    }

    this.subscriptions.clear();

    if (this.debugMode) {
      console.log(`ContentProtectionMediator: Cleared ${count} subscriptions`);
    }

    return count;
  }

  /**
   * Helper method to create and publish an event
   * @param type Event type
   * @param source Source of the event
   * @param data Additional data
   */
  public createAndPublishEvent(
    type: ProtectionEventType,
    source: string,
    data?: unknown
  ): void {
    const event: ProtectionEvent = {
      type,
      source,
      timestamp: Date.now(),
      data
    };

    this.publish(event);
  }
}