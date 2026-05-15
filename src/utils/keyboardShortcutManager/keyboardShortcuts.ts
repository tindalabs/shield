export enum ShortcutCategory {
  COPY = "copy",
  SAVE = "save",
  PRINT = "print",
  VIEW_SOURCE = "viewSource",
  DEVTOOLS = "devTools",
  SCREENSHOT = "screenshot",
  FULLSCREEN = "fullscreen",
}

export interface KeyboardShortcut {
  id: string
  category: ShortcutCategory
  description: string
  // Default keys (typically Windows)
  keys: string[]
  // For Mac-specific variants
  macKeys?: string[]
  // For Linux-specific variants (if different from Windows)
  linuxKeys?: string[]
}

// Define all shortcuts
export const ALL_SHORTCUTS: KeyboardShortcut[] = [
  {
    id: "save",
    category: ShortcutCategory.SAVE,
    description: "Save page",
    keys: ["Control", "s"],
    macKeys: ["Meta", "s"],
    // Linux typically uses the same as Windows for this
  },
  {
    id: "print",
    category: ShortcutCategory.PRINT,
    description: "Print page",
    keys: ["Control", "p"],
    macKeys: ["Meta", "p"],
  },
  {
    id: "view-source",
    category: ShortcutCategory.VIEW_SOURCE,
    description: "View page source",
    keys: ["Control", "u"],
    macKeys: ["Meta", "u"],
  },
  {
    id: "copy",
    category: ShortcutCategory.COPY,
    description: "Copy selected content",
    keys: ["Control", "c"],
    macKeys: ["Meta", "c"],
  },
  {
    id: "cut",
    category: ShortcutCategory.COPY,
    description: "Cut selected content",
    keys: ["Control", "x"],
    macKeys: ["Meta", "x"],
  },
  {
    id: "devtools-open",
    category: ShortcutCategory.DEVTOOLS,
    description: "Open developer tools",
    keys: ["F12"],
    macKeys: ["F12"],
    linuxKeys: ["F12"],
  },
  {
    id: "devtools-inspect",
    category: ShortcutCategory.DEVTOOLS,
    description: "Open developer tools inspector",
    keys: ["Control", "Shift", "i"],
    macKeys: ["Meta", "Option", "i"],
    linuxKeys: ["Control", "Shift", "i"],
  },
  {
    id: "devtools-console",
    category: ShortcutCategory.DEVTOOLS,
    description: "Open developer tools console",
    keys: ["Control", "Shift", "j"],
    macKeys: ["Meta", "Option", "j"],
    linuxKeys: ["Control", "Shift", "j"],
  },
  {
    id: "screenshot-printscreen",
    category: ShortcutCategory.SCREENSHOT,
    description: "Take screenshot (Windows/Linux)",
    keys: ["PrintScreen"],
    linuxKeys: ["PrintScreen"],
  },
  {
    id: "screenshot-area-linux",
    category: ShortcutCategory.SCREENSHOT,
    description: "Take area screenshot (Linux)",
    keys: ["Shift", "PrintScreen"],
    linuxKeys: ["Shift", "PrintScreen"],
  },
  {
    id: "screenshot-window-linux",
    category: ShortcutCategory.SCREENSHOT,
    description: "Take window screenshot (Linux)",
    keys: ["Alt", "PrintScreen"],
    linuxKeys: ["Alt", "PrintScreen"],
  },
  {
    id: "screenshot-clipboard-linux",
    category: ShortcutCategory.SCREENSHOT,
    description: "Copy screenshot to clipboard (Linux)",
    keys: ["Control", "PrintScreen"],
    linuxKeys: ["Control", "PrintScreen"],
  },
  {
    id: "screenshot-gnome-special",
    category: ShortcutCategory.SCREENSHOT,
    description: "GNOME special screenshot shortcut",
    keys: ["Control", "Shift", "p"],
    linuxKeys: ["Control", "Shift", "p"],
  },
  {
    id: "screenshot-flameshot",
    category: ShortcutCategory.SCREENSHOT,
    description: "Flameshot screenshot tool (Linux)",
    keys: ["F10"],
    linuxKeys: ["F10"],
  },
  {
    id: "screenshot-mac-full",
    category: ShortcutCategory.SCREENSHOT,
    description: "Take full screenshot (Mac)",
    keys: [], // Empty for Windows/Linux
    macKeys: ["Shift", "Meta", "3"],
  },
  {
    id: "screenshot-mac-area",
    category: ShortcutCategory.SCREENSHOT,
    description: "Take area screenshot (Mac)",
    keys: [], // Empty for Windows/Linux
    macKeys: ["Shift", "Meta", "4"],
  },
  {
    id: "screenshot-mac-tools",
    category: ShortcutCategory.SCREENSHOT,
    description: "Open screenshot tools (Mac)",
    keys: [], // Empty for Windows/Linux
    macKeys: ["Shift", "Meta", "5"],
  },
  {
    id: "screenshot-win-snipping",
    category: ShortcutCategory.SCREENSHOT,
    description: "Open Snipping Tool (Windows)",
    keys: ["Win", "Shift", "s"],
  },
  {
    id: "screenshot-win-snapshot",
    category: ShortcutCategory.SCREENSHOT,
    description: "Windows SnapshotKey",
    keys: ["SnapshotKey"],
  },
  {
    id: "screenshot-firefox-save",
    category: ShortcutCategory.SCREENSHOT,
    description: "Firefox Save Page As (can be used for screenshots)",
    keys: ["Alt", "s"],
  },
  {
    id: "fullscreen",
    category: ShortcutCategory.FULLSCREEN,
    description: "Toggle fullscreen mode",
    keys: ["F11"],
    macKeys: ["F11"],
    linuxKeys: ["F11"],
  },
  {
    id: "fullscreen-alt-enter",
    category: ShortcutCategory.FULLSCREEN,
    description: "Toggle fullscreen mode (Alt+Enter)",
    keys: ["Alt", "Enter"],
    linuxKeys: ["Alt", "Enter"],
  },
  {
    id: "fullscreen-ctrl-f",
    category: ShortcutCategory.FULLSCREEN,
    description: "Toggle fullscreen in some browsers",
    keys: ["Control", "f"],
    macKeys: ["Meta", "f"],
  },
  {
    id: "fullscreen-alt-f",
    category: ShortcutCategory.FULLSCREEN,
    description: "Toggle fullscreen in some applications",
    keys: ["Alt", "f"],
  },
  {
    id: "fullscreen-alt-k",
    category: ShortcutCategory.FULLSCREEN,
    description: "Toggle fullscreen in some media players",
    keys: ["Alt", "k"],
  },
  {
    id: "fullscreen-mac",
    category: ShortcutCategory.FULLSCREEN,
    description: "Toggle fullscreen on Mac",
    keys: [],
    macKeys: ["Control", "Meta", "f"],
  },
]  