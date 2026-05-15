import type { CustomEventHandlers } from "../types"
import { isBrowser } from "../utils/environment"
import { AbstractStrategy, StrategyErrorType } from "./AbstractStrategy"
import { eventManager } from "../utils/eventManager"
import { KeyboardShortcutManager } from "../utils/keyboardShortcutManager/keyboardShortcutManager"
import { ShortcutCategory } from "../utils/keyboardShortcutManager/keyboardShortcuts"

/**
 * Strategy for preventing keyboard shortcuts
 */
export class KeyboardStrategy extends AbstractStrategy {
  private handler: (e: KeyboardEvent) => void
  private customHandler?: CustomEventHandlers["onKeyboardShortcutBlocked"]
  private eventId = ""
  private shortcutManager: KeyboardShortcutManager
  private categories: ShortcutCategory[] = [
    ShortcutCategory.COPY,
    ShortcutCategory.SAVE,
    ShortcutCategory.PRINT,
    ShortcutCategory.VIEW_SOURCE,
    ShortcutCategory.DEVTOOLS,
  ]

  /**
   * Create a new KeyboardStrategy
   * @param customHandler Optional custom handler for blocked keyboard shortcuts
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(customHandler?: CustomEventHandlers["onKeyboardShortcutBlocked"], debugMode = false) {
    super("KeyboardStrategy", debugMode)

    this.customHandler = customHandler
    this.handler = this.handleKeyDown.bind(this)
    this.shortcutManager = KeyboardShortcutManager.getInstance()

    this.log("Initialized with shortcut categories:", this.categories)
  }

  /**
   * Handle keydown events
   */
  private handleKeyDown(e: Event): boolean | undefined {
    return this.safeExecute("handleKeyDown", StrategyErrorType.EVENT_HANDLING, () => {
      // Cast to KeyboardEvent
      const keyEvent = e as KeyboardEvent

      // Use the shortcut manager to detect shortcuts
      const shortcut = this.shortcutManager.matchesShortcut(keyEvent, this.categories)

      if (shortcut) {
        // Prevent the default action
        keyEvent.preventDefault()
        keyEvent.stopPropagation()

        this.log(`Blocked keyboard shortcut: ${shortcut.id} (${this.shortcutManager.getShortcutDescription(shortcut)})`)

        // Call custom handler if provided
        if (this.customHandler) {
          this.customHandler(keyEvent)
        }

        return false
      }

      return undefined
    })
  }

  /**
   * Apply keyboard protection
   */
  public apply(): void {
    return this.safeExecute("apply", StrategyErrorType.APPLICATION, () => {
      if (this.isAppliedFlag) {
        this.log("Protection already applied")
        return
      }

      if (isBrowser()) {
        // Register the keydown event using our registerEvent method from AbstractStrategy
        this.eventId = this.registerEvent(document, "keydown", this.handler as EventListener, {
          capture: true,
          priority: 10, // High priority to ensure it runs before other handlers
        })

        this.isAppliedFlag = true

        this.log("Keyboard protection applied", {
          hasCustomHandler: !!this.customHandler,
          eventId: this.eventId,
        })
      } else {
        this.log("Browser environment not available, protection not applied")
      }
    })
  }

  /**
   * Remove keyboard protection
   */
  public remove(): void {
    return this.safeExecute("remove", StrategyErrorType.REMOVAL, () => {
      if (!this.isAppliedFlag) {
        this.log("Protection not applied")
        return
      }

      if (isBrowser()) {
        // Try multiple removal strategies for robustness

        // 1. Try removing by specific event ID if we have it
        if (this.eventId) {
          const removed = eventManager.removeEventListener(document, this.eventId)
          this.log(`Removed event by ID ${this.eventId}: ${removed}`)
        }

        // 2. Remove all events for this owner using the parent class method
        this.removeEventsByOwner()

        // 3. Try direct DOM removal as a last resort
        try {
          document.removeEventListener("keydown", this.handler as EventListener, { capture: true })
          this.log("Removed event via direct DOM API")
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (domError) {
          // Ignore errors in direct DOM removal
        }

        this.eventId = ""
        this.isAppliedFlag = false

        this.log("Keyboard protection removed")
      }
    })
  }

  /**
   * Update strategy options
   * @param options Options to update
   */
  public updateOptions(options: Record<string, unknown>): void {
    return this.safeExecute("updateOptions", StrategyErrorType.OPTION_UPDATE, () => {
      this.log("Updating options", options)

      // Handle debug mode if present
      if (options.debugMode !== undefined) {
        this.setDebugMode(!!options.debugMode)
      }

      // Handle categories if present
      if (options.categories !== undefined && Array.isArray(options.categories)) {
        this.categories = options.categories as ShortcutCategory[]
        this.log("Updated shortcut categories:", this.categories)
      }
    })
  }
}