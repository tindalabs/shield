import { EventDataMap } from "./eventDataTypes"

/**
 * Types of protection events that can be published and subscribed to.
 *
 * Only the events listed below are actually wired through the mediator today.
 * The mediator pattern serves a specific case: a detect-and-react fan-out where
 * one detection signal needs to coordinate multiple visible reactions (overlay,
 * content hiding, telemetry). That's why only 4 of the 10 strategies use it —
 * DevTools, Extension, IFrame, and Screenshot. The other 6 (Clipboard,
 * Selection, ContextMenu, Keyboard, Print, Watermark) are direct-blocking
 * strategies where the handler IS the strategy; routing them through the
 * mediator would add ceremony for no decoupling benefit.
 *
 * If you need a NEW event type, add it here AND give it a `[NewType]: { ... }`
 * entry in {@link EventDataMap}.
 */
export enum ProtectionEventType {
  // Strategy lifecycle
  STRATEGY_REMOVED = "strategy:removed",

  // Detection signals (published by the detect-and-react strategies)
  DEVTOOLS_STATE_CHANGE = "protection:devtools",
  EXTENSION_DETECTED = "protection:extension",
  FRAME_EMBEDDING_DETECTED = "protection:frame",
  SCREENSHOT_ATTEMPT = "protection:screenshot",

  // Overlay coordination
  OVERLAY_SHOWN = "overlay:shown",
  OVERLAY_REMOVED = "overlay:removed",
  OVERLAY_RESTORED = "overlay:restored",

  // Content coordination
  CONTENT_HIDDEN = "content:hidden",
  CONTENT_RESTORED = "content:restored",
}

/**
 * Base protection event interface
 */
export interface ProtectionEvent {
  /**
   * Type of the event
   */
  type: ProtectionEventType

  /**
   * Source of the event (usually strategy name)
   */
  source: string

  /**
   * Timestamp when the event occurred
   */
  timestamp: number

  /**
   * Additional data specific to the event type
   */
  data?: unknown
}

/**
 * Event for DevTools state changes
 */
export interface DevToolsEvent extends ProtectionEvent {
  type: ProtectionEventType.DEVTOOLS_STATE_CHANGE
  data: EventDataMap[ProtectionEventType.DEVTOOLS_STATE_CHANGE]
}

/**
 * Event for extension detection
 */
export interface ExtensionEvent extends ProtectionEvent {
  type: ProtectionEventType.EXTENSION_DETECTED
  data: EventDataMap[ProtectionEventType.EXTENSION_DETECTED]
}

/**
 * Event for screenshot detection
 */
export interface ScreenshotEvent extends ProtectionEvent {
  type: ProtectionEventType.SCREENSHOT_ATTEMPT
  data: EventDataMap[ProtectionEventType.SCREENSHOT_ATTEMPT]
}

/**
 * Event for frame embedding detection
 */
export interface FrameEmbeddingEvent extends ProtectionEvent {
  type: ProtectionEventType.FRAME_EMBEDDING_DETECTED
  data: EventDataMap[ProtectionEventType.FRAME_EMBEDDING_DETECTED]
}
