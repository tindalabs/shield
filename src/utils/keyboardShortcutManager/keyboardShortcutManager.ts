import { ShortcutCategory, KeyboardShortcut, ALL_SHORTCUTS } from "./keyboardShortcuts";
import { getOS } from "../environment";

export type OSType = "windows" | "mac" | "linux" | "unknown";

export class KeyboardShortcutManager {
  private static instance: KeyboardShortcutManager;
  private shortcuts: KeyboardShortcut[];
  private osType: OSType;

  private constructor() {
    this.shortcuts = ALL_SHORTCUTS;
    const os = getOS();
    this.osType = os.name as OSType;
  }

  public static getInstance(): KeyboardShortcutManager {
    if (!KeyboardShortcutManager.instance) {
      KeyboardShortcutManager.instance = new KeyboardShortcutManager();
    }
    return KeyboardShortcutManager.instance;
  }

  /**
   * Get all registered shortcuts
   */
  public getAllShortcuts(): KeyboardShortcut[] {
    return this.shortcuts;
  }

  /**
   * Get shortcuts by category
   */
  public getShortcutsByCategory(category: ShortcutCategory): KeyboardShortcut[] {
    return this.shortcuts.filter(shortcut => shortcut.category === category);
  }

  /**
   * Get shortcuts for multiple categories
   */
  public getShortcutsByCategories(categories: ShortcutCategory[]): KeyboardShortcut[] {
    return this.shortcuts.filter(shortcut => categories.includes(shortcut.category));
  }

  /**
   * Check if a keyboard event matches any shortcut in the given categories
   */
  public matchesShortcut(
    event: KeyboardEvent, 
    categories: ShortcutCategory[] = Object.values(ShortcutCategory)
  ): KeyboardShortcut | null {
    const relevantShortcuts = this.getShortcutsByCategories(categories);

    for (const shortcut of relevantShortcuts) {
      if (this.eventMatchesShortcut(event, shortcut)) {
        return shortcut;
      }
    }
    
    return null;
  }

  /**
   * Check if a keyboard event matches a specific shortcut
   */
  private eventMatchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
    // Get the appropriate keys based on platform
    let keysToCheck: string[] = shortcut.keys;
    
    if (this.osType === "mac" && shortcut.macKeys) {
      keysToCheck = shortcut.macKeys;
    } else if (this.osType === "linux" && shortcut.linuxKeys) {
      keysToCheck = shortcut.linuxKeys;
    }
    
    // If there are no keys for this platform, this shortcut doesn't apply
    if (!keysToCheck || keysToCheck.length === 0) {
      return false;
    }
    
    // Special case for modifier keys
    const modifiersMatch = this.checkModifiers(event, keysToCheck);
    
    // Check if the main key matches (non-modifier key)
    const mainKeys = keysToCheck.filter(key => 
      !["Control", "Alt", "Shift", "Meta", "Win", "Option"].includes(key)
    );
    
    // If there's no main key, just check modifiers
    if (mainKeys.length === 0) {
      return modifiersMatch;
    }
    
    // Check if any of the main keys match the event key
    const keyMatches = mainKeys.some(key => {
      // Handle special cases like PrintScreen which might be reported differently
      if (key === "PrintScreen" && 
          (event.key === "PrintScreen" || 
           event.key === "PrtScn" || 
           event.key === "Print" || 
           event.code === "PrintScreen" || 
           event.keyCode === 44)) {
        return true;
      }
      
      // Handle function keys
      if (key.startsWith("F") && !isNaN(parseInt(key.substring(1)))) {
        return event.key === key;
      }
      
      // Normal key matching
      return event.key.toLowerCase() === key.toLowerCase() || 
             event.code.toLowerCase() === key.toLowerCase();
    });
    
    return modifiersMatch && keyMatches;
  }

  /**
   * Check if modifiers in the event match the required modifiers
   */
  private checkModifiers(event: KeyboardEvent, keys: string[]): boolean {
    // Handle different naming conventions
    const hasCtrl = keys.includes("Control") || keys.includes("Ctrl");
    const hasAlt = keys.includes("Alt") || keys.includes("Option");
    const hasShift = keys.includes("Shift");
    const hasMeta = keys.includes("Meta") || keys.includes("Win") || keys.includes("Command");
    
    return (
      (hasCtrl === event.ctrlKey) &&
      (hasAlt === event.altKey) &&
      (hasShift === event.shiftKey) &&
      (hasMeta === event.metaKey)
    );
  }

  /**
   * Get a description of a keyboard shortcut for the current OS
   */
  public getShortcutDescription(shortcut: KeyboardShortcut): string {
    let keysToUse: string[] = shortcut.keys;
    
    if (this.osType === "mac" && shortcut.macKeys) {
      keysToUse = shortcut.macKeys;
    } else if (this.osType === "linux" && shortcut.linuxKeys) {
      keysToUse = shortcut.linuxKeys;
    }
    
    // Format the keys for display
    return this.formatKeysForDisplay(keysToUse);
  }

  /**
   * Format keys for display (e.g., "Ctrl+C")
   */
  private formatKeysForDisplay(keys: string[]): string {
    return keys.map(key => {
      // Replace with more readable versions
      switch (key) {
        case "Control": return this.osType === "mac" ? "Ctrl" : "Ctrl";
        case "Meta": return this.osType === "mac" ? "⌘" : "Win";
        case "Alt": return this.osType === "mac" ? "Option" : "Alt";
        case "Shift": return this.osType === "mac" ? "⇧" : "Shift";
        case "Option": return "Option";
        case "Win": return "Win";
        default: return key;
      }
    }).join(this.osType === "mac" ? " + " : "+");
  }
}