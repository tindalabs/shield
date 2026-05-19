import { OverlayOptions } from "@/utils/securityOverlayManager";

/**
 * Configuration options for content protection
 */
export interface ContentProtectionOptions {
  /** Enable/disable keyboard shortcuts protection */
  preventKeyboardShortcuts?: boolean;

  /** Enable/disable context menu protection */
  preventContextMenu?: boolean;

  /** Context menu protection options */
  contextMenuOptions?: ContextMenuOptions;

  /** Enable/disable print protection */
  preventPrinting?: boolean;

  /** Enable/disable selection protection */
  preventSelection?: boolean;

  /** Enable/disable watermarking */
  enableWatermark?: boolean;

  /** Enable/disable DevTools detection */
  preventDevTools?: boolean;

  /** Dev tools protection options */
  devToolsOptions?: DevToolsOptions;

  /** Enable/disable screenshot protection */
  preventScreenshots?: boolean;

  /** Screenshot protection options */
  screenshotOptions?: ScreenshotOptions;

  /** Watermark options */
  watermarkOptions?: WatermarkOptions;

  /** Enable/disable scraping extension protection */
  preventExtensions?: boolean;

  /** Extension protection options */
  extensionOptions?: BrowserExtensionOptions;

  /** Enable/disable iFrame protection */
  preventEmbedding?: boolean;

  /** iFrame protection options */
  frameEmbeddingOptions?: FrameEmbeddingOptions;

  /** Enable/disable clipboard protection (copy/cut/paste events + Clipboard API)
   * @default false
   */
  preventClipboard?: boolean;

  /** Clipboard protection options */
  clipboardOptions?: ClipboardOptions;

  /** Target element (defaults to document.body) */
  targetElement?: HTMLElement | null;

  /** Custom event handlers */
  customHandlers?: CustomEventHandlers;

  /** Enable debug mode for all strategies
  * @default false
  */
  debugMode?: boolean;
}

/**
 * Watermark configuration options
 */
export interface WatermarkOptions {
  /** Text to display in watermark */
  text: string;

  /** User identifier to include in watermark */
  userId?: string;

  /** Opacity of watermark (0-1) */
  opacity?: number;

  /** Density of watermark pattern (1-10) */
  density?: number;

  /** Custom styling for watermark */
  style?: Partial<CSSStyleDeclaration>;
}

export interface ContextMenuOptions {
  /**
   * Whether to observe and protect iframes that are dynamically added to the DOM
   * @default false
   */
  observeForIframes?: boolean;
}

/**
 * Clipboard protection options
 */
export interface ClipboardOptions {
  /**
   * Whether to prevent copy operations
   * @default true
   */
  preventCopy?: boolean

  /**
   * Whether to prevent cut operations
   * @default true
   */
  preventCut?: boolean

  /**
   * Whether to prevent paste operations
   * @default false
   */
  preventPaste?: boolean

  /**
   * Text to replace copied content with
   * @default "Content copying is disabled for security reasons."
   */
  replacementText?: string
}

/**
 * Screenshot protection overlay options
 */
export interface ScreenshotOptions {

  /**
   * Whether to show overlay when triggered
   * @default true
   */
  showOverlay?: boolean;

  // Custom overlay options when blocking content
  overlayOptions?: OverlayOptions;

  /**
   * Whether to hide sensitive content when triggered
   * @default true
   */
  hideContent?: boolean;

  /**
  * Whether to prevent fullscreen mode
  * @default true
  */
  preventFullscreen?: boolean

  /**
   * Message to display when fullscreen is attempted
   */
  fullscreenMessage?: string
}

/**
 * Options for the DevTools protection overlay
 */
export interface DevToolsOptions {
  /**
  * Check frequency in milliseconds
  */
  checkFrequency?: number;

  /**
   * Whether to show overlay when triggered
   * @default true
   */
  showOverlay?: boolean;

  // Custom overlay options when blocking content
  overlayOptions?: OverlayOptions;

  /**
   * Whether to hide sensitive content when triggered
   * @default true
   */
  hideContent?: boolean;

  /**
  * Specific detector types to use
  * If empty, will use the optimal detectors for the current browser
  */
  detectorTypes?: string[]
}

export interface BrowserExtensionOptions {
  // Path to JSON configuration file
  configPath?: string
  // Inline configuration (alternative to configPath)
  extensionsConfig?: Record<string, ExtensionConfig>
  // How often to check for extensions (in milliseconds)
  detectionInterval?: number
  /**
   * Whether to show overlay when triggered
   * @default true
   */
  showOverlay: true,
  // Custom overlay options when blocking content
  overlayOptions?: OverlayOptions
  /**
   * Whether to hide sensitive content when triggered
   * @default true
   */
  hideContent?: boolean;
}

/**
 * Configuration for a specific browser extension to detect
 */
export interface ExtensionConfig {
  name: string
  description?: string
  risk: string
  detectionMethods: {
    // CSS selectors for DOM elements injected by this extension
    domSelectors?: string[]
    // JavaScript variables or functions injected by this extension
    jsSignatures?: string[]
  }
}

/**
 * Options for the FrameEmbeddingProtectionStrategy
 */
export interface FrameEmbeddingOptions {
  /**
   * Whether to show overlay when triggered
   * @default true
   */
  showOverlay: true,
  // Custom overlay options when blocking content
  overlayOptions?: OverlayOptions;
  /**
  * Whether to hide sensitive content when triggered
  * @default true
  */
  hideContent?: boolean;

  /**
   * Allowed domains that can embed the content (empty array means only same-origin is allowed)
   */
  allowedDomains?: string[]

  /**
   * Whether to completely block the content from loading in any iframe (even same-origin)
   */
  blockAllFrames?: boolean
}

/**
 * Custom event handlers
 */
export interface CustomEventHandlers {
  /** Called when protection is bypassed */
  onProtectionBypassed?: (method: string, event: Event) => void;

  /** Called when print is attempted */
  onPrintAttempt?: (event: Event) => void;

  /** Called when keyboard shortcut is blocked */
  onKeyboardShortcutBlocked?: (event: KeyboardEvent) => void;

  /** Called when DevTools is opened or closed */
  onDevToolsOpen?: (isOpen: boolean) => void;

  /** Called when a clipboard operation is detected */
  onClipboardAttempt?: (event: Event, action: "copy" | "cut" | "paste") => void

  onContextMenuAttempt?: (event: Event) => void;

  onSelectionAttempt?: (event: Event) => void;

  onScreenshotAttempt?: (event: Event) => void;

  onExtensionDetected?: (extensionId: string, extensionName: string, riskLevel: "low" | "medium" | "high") => void;

  onFrameEmbeddingDetected?: (isEmbedded: boolean, isExternalFrame: boolean) => void

  /** 
   * Called when content is hidden due to a security event (e.g., DevTools opened)
   * @param reason The reason why content was hidden
   * @param targetElement The element whose content was hidden
   */
  onContentHidden?: (reason: string, targetElement: HTMLElement | null) => void;

  /**
   * Called when content is restored after a security event clears (e.g., DevTools closed)
   * Useful for frameworks like Vue to re-mount components after innerHTML restoration
   * @param targetElement The element whose content was restored
   */
  onContentRestored?: (targetElement: HTMLElement | null) => void;
}

/**
 * Protection strategy interface
 */
export interface ProtectionStrategy {
  /**
  * Unique identifier for the strategy
  * Used for logging and event management
  */
  readonly STRATEGY_NAME: string
  /** Apply the protection strategy */
  apply(options?: unknown): void;

  /** Remove the protection strategy */
  remove(): void;

  /** Check if strategy is currently applied */
  isApplied(): boolean;

  /** Update strategy options */
  updateOptions(options: Record<string, unknown>): void;

  /** Get the debug mode status
  * @returns True if debug mode is enabled
  */
  isDebugEnabled(): boolean

  /** Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  setDebugMode(enabled: boolean): void
}

/**
 * Protection strategy names
 */
export enum StrategyName {
  KEYBOARD = "KeyboardStrategy",
  CONTEXT_MENU = "ContextMenuStrategy",
  PRINT = "PrintStrategy",
  SELECTION = "SelectionStrategy",
  WATERMARK = "WatermarkStrategy",
  DEV_TOOLS = "DevToolsStrategy",
  SCREENSHOT = "ScreenshotStrategy",
  BROWSER_EXTENSION = "BrowserExtensionStrategy",
  FRAME_EMBEDDING = "FrameEmbeddingStrategy",
  CLIPBOARD = "ClipboardStrategy",
}


// Add Firefox-specific console properties to the global Window interface
declare global {
  interface Console {
    // Firefox-specific console properties
    exception?: (...data: unknown[]) => void
  }
}
export * from './assessment.js';
