/**
 * Signal keys produced by assess(). All keys follow the shield.* OTel namespace
 * so they can be attached directly to Blindspot / OpenTelemetry spans.
 */
export interface ShieldSignals {
  /** DevTools panel is open in the current tab. */
  'shield.devtools.open': boolean;
  /** navigator.webdriver is set — Selenium, Playwright, Puppeteer, etc. */
  'shield.automation.webdriver': boolean;
  /** Browser is running in headless mode (no visible UI). */
  'shield.automation.headless': boolean;
  /** Page is embedded inside a cross-origin or unauthorized iframe. */
  'shield.frame.embedded': boolean;
  /** At least one known browser extension has been detected. */
  'shield.extension.detected': boolean;
  /** Comma-separated list of detected extension names (empty string if none). */
  'shield.extension.names': string;
}

export interface ShieldRisk {
  /** Normalised threat score in the [0, 1] range. */
  score: number;
  /** Machine-readable flag codes for each active threat. */
  flags: string[];
}

/**
 * Structured result returned by assess().
 */
export interface ShieldAssessment {
  signals: ShieldSignals;
  risk: ShieldRisk;
  /**
   * OTel-compatible span attributes.  Only truthy / non-default signal values
   * are included so spans stay lean.  Attach these directly to a Blindspot
   * span via span.setAttributes(result.spanAttributes).
   */
  spanAttributes: Record<string, string | boolean | number>;
}

/**
 * Options for the assess() call.
 */
export interface AssessOptions {
  /**
   * Run DevTools detection. Slightly slower (async timing-based).
   * @default true
   */
  devtools?: boolean;
  /**
   * Run browser-extension detection (async DOM scan).
   * @default true
   */
  extensions?: boolean;
  /**
   * Maximum milliseconds to wait for async detections before resolving.
   * @default 400
   */
  timeout?: number;
  /**
   * Inline extension config to check against. If omitted, uses the built-in
   * signatures bundled with Shield.
   */
  extensionConfig?: import('./index.js').ExtensionConfig[];
}
