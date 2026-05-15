import type { ProtectionMediator } from "../../mediator/types"
import { type ProtectionEvent, ProtectionEventType } from "../../mediator/protection-event"
import type { FrameEmbeddingEvent } from "../../mediator/protection-event"
import { AbstractEventHandler } from "./abstractEventHandler"

/**
 * Handler for frame embedding events
 */
export class FrameEmbeddingEventHandler extends AbstractEventHandler {
    /**
     * Create a new FrameEmbeddingEventHandler
     * @param mediator The protection mediator
     * @param debugMode Enable debug mode for troubleshooting
     */
    constructor(mediator: ProtectionMediator, debugMode = false) {
      super(mediator, "FrameEmbeddingEventHandler", debugMode)
    }
  
    /**
     * Initialize the handler and set up event subscriptions
     */
    protected initialize(): void {
      // Subscribe to the FRAME_EMBEDDING_DETECTED event
      this.subscribe(ProtectionEventType.FRAME_EMBEDDING_DETECTED, this.handleFrameEmbeddingDetected.bind(this))
  
      this.log("Initialized and subscribed to frame embedding events")
    }
  
    /**
     * Handle frame embedding detection event
     * @param event The protection event containing frame embedding data
     */
    public handleFrameEmbeddingDetected(event: ProtectionEvent): void {
      try {
        const frameEvent = event as FrameEmbeddingEvent
  
        this.log("Handling frame embedding detected event", frameEvent)
  
        const data = frameEvent.data
  
        if (!data) {
          this.warn("Received invalid frame embedding event data")
          return
        }
  
        // Only handle external frames
        if (data.isEmbedded && data.isExternalFrame) {
          this.log(`Applying protection for external frame embedding from ${data.parentDomain || "unknown domain"}`)
  
          // Show overlay if configured
          if (data.showOverlay) {
            this.mediator.publish({
              type: ProtectionEventType.OVERLAY_SHOWN,
              source: this.COMPONENT_NAME,
              timestamp: Date.now(),
              data: {
                strategyName: this.COMPONENT_NAME,
                overlayType: "frame_embedding",
                options: {
                  ...data.overlayOptions,
                  blockEvents: true,
                  autoRestore: true,
                },
                priority: 9, // High priority for frame embedding
              },
            })
          }
  
          // Hide content if configured
          if (data.hideContent) {
            this.mediator.publish({
              type: ProtectionEventType.CONTENT_HIDDEN,
              source: this.COMPONENT_NAME,
              timestamp: Date.now(),
              data: {
                strategyName: this.COMPONENT_NAME,
                reason: "frame_embedding",
                targetElement: data.targetElement,
                options: {
                  title: data.overlayOptions?.title,
                  message: data.overlayOptions?.message,
                  secondaryMessage: data.overlayOptions?.secondaryMessage,
                  textColor: "black",
                  backgroundColor: "rgba(0, 0, 0, 0.05)",
                },
                priority: 9, // High priority for frame embedding
              },
            })
          }
        } else {
          this.log("Skipping protection for non-external frame embedding")
        }
      } catch (error) {
        this.error("Error handling frame embedding detected event:", error)
      }
    }
  
    /**
     * Clean up resources when the handler is disposed
     */
    protected onDispose(): void {
      // No additional cleanup needed beyond what the base class does
    }
  }  