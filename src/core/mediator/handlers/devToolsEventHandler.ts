import { ProtectionEvent, ProtectionEventType } from "../protection-event";
import { isEventType, TypedProtectionEvent } from "../eventDataTypes";
import type { ProtectionMediator } from "../types";
import { AbstractEventHandler } from "./abstractEventHandler";

// Type alias for DevTools event
type DevToolsStateEvent = TypedProtectionEvent<typeof ProtectionEventType.DEVTOOLS_STATE_CHANGE>;

export class DevToolsEventHandler extends AbstractEventHandler {
  constructor(mediator: ProtectionMediator, debugMode = false) {
    super(mediator, "DevToolsEventHandler", debugMode);
  }

  protected initialize(): void {
    this.subscribe(
      ProtectionEventType.DEVTOOLS_STATE_CHANGE,
      this.handleDevToolsStateChange.bind(this)
    );
  }

  private handleDevToolsStateChange(event: ProtectionEvent): void {
    // Use type guard for type-safe access
    if (!isEventType(event, ProtectionEventType.DEVTOOLS_STATE_CHANGE)) {
      this.error("Received invalid event type");
      return;
    }

    this.log(`Handling DevTools state change, isOpen=${event.data.isOpen}`);

    if (event.data.isOpen) {
      this.handleDevToolsOpened(event);
    } else {
      this.handleDevToolsClosed(event);
    }
  }

  private handleDevToolsOpened(event: DevToolsStateEvent): void {
    const { data } = event;

    // Show overlay if showOverlay is enabled (defaults to true)
    if (data.showOverlay !== false) {
      this.mediator.publish({
        type: ProtectionEventType.OVERLAY_SHOWN,
        source: this.COMPONENT_NAME,
        timestamp: Date.now(),
        data: {
          strategyName: this.COMPONENT_NAME,
          overlayType: "devtools",
          options: {
            ...data.overlayOptions,
            blockEvents: true,
            autoRestore: true,
          },
          priority: 10,
        },
      });
    }

    // Only hide content if hideContent option is explicitly enabled
    if (data.hideContent === true) {
      this.mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: this.COMPONENT_NAME,
        timestamp: Date.now(),
        data: {
          strategyName: this.COMPONENT_NAME,
          reason: "devtools_opened",
          options: {
            title: data.overlayOptions?.title,
            message: data.overlayOptions?.message,
            secondaryMessage: data.overlayOptions?.secondaryMessage,
            textColor: 'black',
            backgroundColor: data.overlayOptions?.backgroundColor,
          },
          targetElement: data.target,
          priority: 10,
        },
      });
    }
  }

  private handleDevToolsClosed(event: DevToolsStateEvent): void {
    const { data } = event;

    // Remove overlay if showOverlay was enabled
    if (data.showOverlay !== false) {
      this.mediator.publish({
        type: ProtectionEventType.OVERLAY_REMOVED,
        source: this.COMPONENT_NAME,
        timestamp: Date.now(),
        data: {
          strategyName: this.COMPONENT_NAME,
          overlayType: "devtools",
          reason: "devtools_closed",
        },
      });
    }

    // Only restore content if hideContent was explicitly enabled
    if (data.hideContent === true) {
      this.mediator.publish({
        type: ProtectionEventType.CONTENT_RESTORED,
        source: this.COMPONENT_NAME,
        timestamp: Date.now(),
        data: {
          strategyName: this.COMPONENT_NAME,
          targetElement: data.target,
        },
      });
    }
  }
}