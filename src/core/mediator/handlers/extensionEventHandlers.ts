import type { ProtectionMediator } from "../types";
import { ProtectionEvent, ProtectionEventType } from "../protection-event"
import { isEventType, TypedProtectionEvent } from "../eventDataTypes";
import type { ExtensionConfig } from "../../../types"
import { AbstractEventHandler } from "./abstractEventHandler";

// Type alias for Extension event
type ExtensionDetectedEvent = TypedProtectionEvent<typeof ProtectionEventType.EXTENSION_DETECTED>;

/**
 * Handler for browser extension detection events
 */
export class BrowserExtensionEventHandler extends AbstractEventHandler {
  /**
   * Create a new BrowserExtensionEventHandler
   * @param mediator The protection mediator
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(mediator: ProtectionMediator, debugMode = false) {
    super(mediator, "BrowserExtensionEventHandler", debugMode)
  }

  /**
   * Initialize the handler and subscribe to events
   */
  protected initialize(): void {
    this.subscribe(ProtectionEventType.EXTENSION_DETECTED, this.handleExtensionDetected.bind(this))
  }

  /**
   * Handle extension detection
   * @param event the ProtectionEvent
   */
  public handleExtensionDetected(event: ProtectionEvent): void {
    // Use type guard for type-safe access
    if (!isEventType(event, ProtectionEventType.EXTENSION_DETECTED)) {
      this.error("Received invalid event type");
      return;
    }

    const { data } = event;

    this.log(`Handling extension detection state change, name=${data.extension?.name || "unknown"}`)

    if (data.extension) {
      this.applyExtensionProtection(event)
      this.log("Blocking interface due to extension detection")
    } else {
      this.removeExtensionProtection(event)
      this.log("Unlocking interface after extension removal")
    }
  }

  /**
   * Handle extension detection
   * @param event the typed ExtensionDetectedEvent
   */
  public applyExtensionProtection(event: ExtensionDetectedEvent): void {
    const { data } = event;

    if (data.hideContent) {
      this.mediator.publish({
        type: ProtectionEventType.CONTENT_HIDDEN,
        source: this.COMPONENT_NAME,
        timestamp: Date.now(),
        data: {
          strategyName: this.COMPONENT_NAME,
          reason: "extension_detected",
          targetElement: data.target,
          options: {
            title: data.overlayOptions?.title,
            message: data.overlayOptions?.message,
            secondaryMessage: `"${data.extension?.name}" triggered this warning`,
            textColor: "black",
            backgroundColor: "rgba(0, 0, 0, 0.05)",
          },
          priority: 8,
        },
      })
    }

    if (data.showOverlay) {
      const extensionConfig = data.extension as ExtensionConfig
      const additionalContent = `
        <p style="font-size: 18px; margin-top: 20px;">Detected: ${extensionConfig.name}</p>
        <p style="font-size: 14px; margin-top: 10px;">Risk Level: ${extensionConfig.risk.toUpperCase()}</p>
        <button id="extension-protection-close" style="margin-top: 20px; padding: 10px 20px; background-color: white; color: black; border: none; border-radius: 4px; cursor: pointer; pointer-events: auto;">
          I've Disabled the Extension
        </button>
      `

      setTimeout(() => {
        const closeButton = document.getElementById("extension-protection-close")
        if (closeButton) {
          closeButton.addEventListener("click", () => {
            window.location.reload()
          })
        }
      }, 0)

      this.mediator.publish({
        type: ProtectionEventType.OVERLAY_SHOWN,
        source: this.COMPONENT_NAME,
        timestamp: Date.now(),
        data: {
          strategyName: this.COMPONENT_NAME,
          overlayType: "extension",
          options: {
            ...data.overlayOptions,
            blockEvents: true,
            autoRestore: true,
            additionalContent,
          },
          priority: 8,
        },
      })
    }
  }

  /**
   * Remove extension protection
   * @param event The typed ExtensionDetectedEvent
   */
  public removeExtensionProtection(event: ExtensionDetectedEvent): void {
    const { data } = event;

    if (data.hideContent) {
      this.mediator.publish({
        type: ProtectionEventType.CONTENT_RESTORED,
        source: this.COMPONENT_NAME,
        timestamp: Date.now(),
        data: {
          strategyName: this.COMPONENT_NAME,
          targetElement: data.target,
        },
      })
    }

    if (data.showOverlay) {
      this.mediator.publish({
        type: ProtectionEventType.OVERLAY_REMOVED,
        source: this.COMPONENT_NAME,
        timestamp: Date.now(),
        data: {
          strategyName: this.COMPONENT_NAME,
          overlayType: "extension",
          reason: "extension_removed",
        },
      })
    }
  }

  /**
   * Additional cleanup to be performed on disposal
   */
  protected onDispose(): void {
    // No additional cleanup needed for this handler
  }
}