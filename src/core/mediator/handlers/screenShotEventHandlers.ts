import type { ProtectionMediator } from "../../mediator/types"
import { type ProtectionEvent, ProtectionEventType } from "../protection-event"
import type { ScreenshotEvent } from "../protection-event"
import { TimeoutManager } from "../../../utils/timeoutManager";
import { AbstractEventHandler } from "./abstractEventHandler";

/**
 * Handler for screenshot detection events
 */
export class ScreenshotEventHandler extends AbstractEventHandler {
  private timeoutManager: TimeoutManager;
  private activeTimeouts: Set<string> = new Set(); // Track active timeouts

  /**
   * Create a new ScreenshotEventHandler
   * @param mediator The protection mediator
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(mediator: ProtectionMediator, debugMode = false) {
    super(mediator, "ScreenshotEventHandler", debugMode);
    this.timeoutManager = TimeoutManager.getInstance();
    this.timeoutManager.setDebugMode(this.debugMode);
  }

  /**
   * Initialize the handler and subscribe to events
   */
  protected initialize(): void {
    // Subscribe to the SCREENSHOT_ATTEMPT event
    this.subscribe(
      ProtectionEventType.SCREENSHOT_ATTEMPT,
      this.handleScreenshotAttempt.bind(this)
    );
  }

  /**
   * Handle screenshot attempt event
   * @param event The protection event
   */
  public handleScreenshotAttempt(event: ProtectionEvent): void {
    const screenshotEvent = event as ScreenshotEvent;

    this.log("Handling screenshot attempt event", screenshotEvent);

    // Generate a unique ID for this protection instance
    const protectionId = `screenshot_${Date.now()}`;

    if (screenshotEvent.data.showOverlay) {
      this.mediator.publish({
        type: ProtectionEventType.OVERLAY_SHOWN,
        source: screenshotEvent.source,
        timestamp: Date.now(),
        data: {
          strategyName: screenshotEvent.source,
          overlayType: "screenshot",
          options: {
            ...screenshotEvent.data.overlayOptions,
            blockEvents: false, // Don't block events, just show a notification
            autoRestore: true,
          },
          priority: screenshotEvent.data.priority || 5,
          duration: screenshotEvent.data.overlayOptions?.duration || 3000
        },
      });
    }

    if (screenshotEvent.data.hideContent) {
      this.mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: screenshotEvent.source,
        timestamp: Date.now(),
        data: {
          strategyName: screenshotEvent.source,
          reason: "screenshot_attempt",
          options: {
            title: screenshotEvent.data.overlayOptions?.title,
            message: screenshotEvent.data.overlayOptions?.message,
            secondaryMessage: screenshotEvent.data.overlayOptions?.secondaryMessage,
            textColor: 'black',
            backgroundColor: screenshotEvent.data.overlayOptions?.backgroundColor || "rgba(0, 0, 0, 0.05)",
          },
          targetElement: screenshotEvent.data.target,
          priority: screenshotEvent.data.priority || 5,
        },
      });

      // Create a unique timeout ID for this screenshot event
      const contentTimeoutId = `${protectionId}_content`;
      this.activeTimeouts.add(contentTimeoutId);

      // If duration is specified, set a timeout to restore content
      if (screenshotEvent.data.overlayOptions?.duration) {
        this.timeoutManager.setTimeout(
          contentTimeoutId,
          () => {
            this.mediator.publish({
              type: ProtectionEventType.CONTENT_RESTORED,
              source: screenshotEvent.source,
              timestamp: Date.now(),
              data: {
                strategyName: screenshotEvent.source,
                targetElement: screenshotEvent.data.target,
              },
            });
            this.activeTimeouts.delete(contentTimeoutId);
          },
          screenshotEvent.data.overlayOptions?.duration
        );

        this.log(`Set timeout ${contentTimeoutId} to restore content after ${screenshotEvent.data.overlayOptions.duration}s`);
      }
    }
  }

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  public setDebugMode(enabled: boolean): void {
    super.setDebugMode(enabled);
    this.timeoutManager.setDebugMode(enabled);
  }

  /**
   * Additional cleanup to be performed on disposal
   */
  protected onDispose(): void {
    // Clear all active timeouts
    for (const timeoutId of this.activeTimeouts) {
      this.timeoutManager.clearTimeout(timeoutId);
    }
    this.activeTimeouts.clear();
  }
}