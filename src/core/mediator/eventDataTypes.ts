import { OverlayOptions } from "@/utils/securityOverlayManager"
import { ProtectionEventType } from "./protection-event"
import { PlaceholderOptions } from "@/utils/protectedContentManager"
import { ExtensionConfig } from "@/types"

/**
 * Interface defining the data structure for each event type.
 *
 * Keep this in sync with the {@link ProtectionEventType} enum — every value
 * in the enum should have a matching `[ProtectionEventType.X]: { ... }` entry
 * here. The trailing index signature catches any drift (and lets ad-hoc
 * subscribers attach handlers for not-yet-typed events without compile errors).
 */
export interface EventDataMap {
  [ProtectionEventType.DEVTOOLS_STATE_CHANGE]: {
    isOpen: boolean,
    target?: HTMLElement | null
    showOverlay?: boolean | null
    overlayOptions?: OverlayOptions | null
    hideContent?: boolean | null
  }

  [ProtectionEventType.EXTENSION_DETECTED]: {
    extension: ExtensionConfig | null
    showOverlay?: boolean | null
    overlayOptions?: OverlayOptions | null
    hideContent?: boolean | null
    priority: number
    reason: string
    target?: HTMLElement | null
  }

  [ProtectionEventType.SCREENSHOT_ATTEMPT]: {
    showOverlay?: boolean | null
    hideContent?: boolean | null
    overlayOptions?: OverlayOptions | null
    duration?: number | null
    priority: number
    reason: string
    target?: HTMLElement | null
  }

  [ProtectionEventType.FRAME_EMBEDDING_DETECTED]: {
    isEmbedded: boolean
    isExternalFrame: boolean
    parentDomain?: string
    targetElement?: HTMLElement | null
    showOverlay?: boolean | null
    hideContent?: boolean | null
    overlayOptions?: OverlayOptions | null
  }

  [ProtectionEventType.CONTENT_HIDDEN]: {
    strategyName: string
    reason: string
    options: PlaceholderOptions
    targetElement?: HTMLElement | null
    priority: number
  }

  [ProtectionEventType.CONTENT_RESTORED]: {
    strategyName: string
    targetElement?: HTMLElement | null
  }

  [ProtectionEventType.OVERLAY_SHOWN]: {
    strategyName: string
    overlayType: string
    options: OverlayOptions
    priority: number,
    duration?: number
  }

  [ProtectionEventType.OVERLAY_REMOVED]: {
    strategyName: string
    overlayType: string
    reason?: string
  }

  [ProtectionEventType.OVERLAY_RESTORED]: {
    strategyName: string
    overlayType: string
    reason?: string
  }

  [ProtectionEventType.STRATEGY_REMOVED]: {
    strategyName: string
    reason?: string
  }

  // Default fallback for any event types not explicitly defined
  [key: string]: Record<string, unknown>
}

/**
 * Type-safe typed event interface
 * Use this instead of unsafe `as` assertions
 */
export interface TypedProtectionEvent<T extends ProtectionEventType> {
  type: T
  source: string
  timestamp: number
  data: EventDataMap[T]
}

/**
 * Type guard to check if an event has a specific type
 * @param event The event to check
 * @param eventType The expected event type
 * @returns True if the event matches the type
 */
export function isEventType<T extends ProtectionEventType>(
  event: { type: ProtectionEventType; data?: unknown },
  eventType: T
): event is TypedProtectionEvent<T> {
  return event.type === eventType
}

/**
 * Get typed event data with type safety
 * Returns undefined if the event type doesn't match
 * @param event The protection event
 * @param eventType The expected event type
 * @returns The typed data or undefined
 */
export function getTypedEventData<T extends ProtectionEventType>(
  event: { type: ProtectionEventType; data?: unknown },
  eventType: T
): EventDataMap[T] | undefined {
  if (event.type === eventType) {
    return event.data as EventDataMap[T]
  }
  return undefined
}
