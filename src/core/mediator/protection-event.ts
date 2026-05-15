import { EventDataMap } from "./eventDataTypes"

/**
 * Types of protection events that can be published and subscribed to
 */
export enum ProtectionEventType {
  // Strategy lifecycle events
  STRATEGY_APPLIED = "strategy:applied",
  STRATEGY_REMOVED = "strategy:removed",
  STRATEGY_UPDATED = "strategy:updated",

  // User interaction events
  CONTEXT_MENU_ATTEMPT = "interaction:contextmenu",
  SELECTION_ATTEMPT = "interaction:selection",
  DRAG_ATTEMPT = "interaction:drag",
  KEYBOARD_SHORTCUT_BLOCKED = "interaction:keyboard",

  // Protection events
  PRINT_ATTEMPT = "protection:print",
  SCREENSHOT_ATTEMPT = "protection:screenshot",
  DEVTOOLS_STATE_CHANGE = "protection:devtools",
  EXTENSION_DETECTED = "protection:extension",
  FRAME_EMBEDDING_DETECTED = "protection:frame",
  FULLSCREEN_CHANGE = "protection:fullscreen",
  WATERMARK_TAMPERED = "protection:watermark_tampered",

  // Overlay events
  OVERLAY_SHOWN = "overlay:shown",
  OVERLAY_REMOVED = "overlay:removed",
  OVERLAY_RESTORED = "overlay:restored",

  // Content events
  CONTENT_HIDDEN = "content:hidden",
  CONTENT_RESTORED = "content:restored",
  WATERMARK_CREATED = "content:watermark_created",
  WATERMARK_REMOVED = "content:watermark_removed",

  // Mediator events
  MEDIATOR_INITIALIZED = "mediator:initialized",
  MEDIATOR_DISPOSED = "mediator:disposed",

  // System events
  ERROR_OCCURRED = "system:error",
  DEBUG_MESSAGE = "system:debug",
  CONFIG_UPDATED = "system:config_updated",

  // Keyboard 
  KEYBOARD_SHORTCUTS_REQUESTED = "keyboard:shortcuts_requested",
  KEYBOARD_SHORTCUTS_PROVIDED = "keyboard:shortcuts_provided",
  KEYBOARD_SHORTCUTS_UPDATED = "keyboard:shortcuts_updated",
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

/**
 * Event for watermark-related events
 */
export interface WatermarkEvent extends ProtectionEvent {
  data: {
    targetElement?: HTMLElement | null
    watermarkId?: string
    [key: string]: unknown
  }
}

