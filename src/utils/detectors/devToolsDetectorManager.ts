import type { DevToolsDetector, DevToolsDetectorOptions } from "./detectorInterface"
import { DebuggerDetector } from "./debuggerDetector"
import { TimingDetector } from "./timingDetector"
import { DateToStringDetector } from "./dateToStringDetector"
import { FuncToStringDetector } from "./funcToStringDetector"
import { RegToStringDetector } from "./regToStringDetector"
import { DefineGetterDetector } from "./defineGetterDetector"
import { DebugLibDetector } from "./debugLibDetector"
import { SizeDetector } from "./sizeDetector"
import { getBrowser, isMobile } from "../environment"
import { SimpleLoggingService } from "../logging/simple/SimpleLoggingService"
import { AbstractDevToolsDetector } from "./AbstractDevToolsDetector"

/**
 * Type for detector types
 */
export type DetectorType =
  | "debugger"
  | "timing"
  | "dateToString"
  | "funcToString"
  | "regToString"
  | "defineGetter"
  | "debugLib"
  | "size"

/**
 * Options for the DevTools detector manager
 */
export interface DetectorManagerOptions extends DevToolsDetectorOptions {
  /**
   * Enable specific detection methods
   */
  enabledDetectors?: DetectorType[]

  /**
   * Timeout duration for the debugger detector
   */
  debuggerTimeoutDuration?: number

  /**
   * Check interval in milliseconds
   */
  checkInterval?: number

  /**
   * Delay initial check to avoid false positives during page load
   * @default true
   */
  delayInitialCheck?: boolean

  /**
   * Initial check delay in milliseconds
   * @default 1000
   */
  initialCheckDelay?: number
}

/**
 * Manager class that coordinates multiple DevTools detection methods
 * **Chrome, Edge, Opera**: Primarily uses `DebuggerDetector` with `DefineGetterDetector` as backup
 * **Firefox**: Uses `TimingDetector` and `RegToStringDetector` for reliable detection
 * **Safari**: Primarily uses `DateToStringDetector` with `DefineGetterDetector` as backup
 * **QQ Browser**: Uses `RegToStringDetector` which works particularly well for this browser
 * **Mobile Browsers**: Always includes `DebugLibDetector` to catch third-party debugging tools
 */
export class DevToolsDetectorManager extends AbstractDevToolsDetector {
  private detectors: Map<DetectorType, DevToolsDetector> = new Map()
  private activeDetectors: DevToolsDetector[] = []
  private browserInfo: { name: string; version: string }
  private isMobileDevice: boolean
  private isInitialCheckDone = false
  private initialCheckTimeout: number | null = null
  private delayInitialCheck: boolean
  private initialCheckDelay: number

  // Browser-specific detector mapping
  private static readonly BROWSER_DETECTOR_MAP: Record<string, DetectorType[]> = {
    // Chromium-based browsers
    chrome: ["debugger", "defineGetter"],
    edge: ["debugger", "defineGetter"],
    chromium: ["debugger", "defineGetter"],
    opera: ["debugger", "defineGetter"],
    vivaldi: ["debugger", "defineGetter"],

    // Firefox and derivatives
    firefox: ["timing", "regToString"],

    // Safari
    safari: ["dateToString", "defineGetter"],

    // Chinese browsers
    qq: ["regToString", "debugger"],
    uc: ["debugger", "defineGetter"],
    baidu: ["debugger", "defineGetter"],
    mi: ["debugger", "defineGetter"],
    wechat: ["debugger", "defineGetter"],

    // Korean browsers
    samsung: ["debugger", "defineGetter"],
    whale: ["debugger", "defineGetter"],

    // Russian browsers
    yandex: ["debugger", "defineGetter"],

    // Japanese browsers (typically WebKit/Blink based)
    // Fallback for unknown browsers
    unknown: ["debugger", "defineGetter", "dateToString"],
  }

  // Mobile-specific overrides
  private static readonly MOBILE_DETECTOR_MAP: Record<string, DetectorType[]> = {
    // iOS Safari needs special handling
    safari: ["dateToString", "debugLib"],

    // Android Chrome/WebView
    chrome: ["debugger", "debugLib"],

    // UC and QQ browsers on mobile
    uc: ["debugger", "debugLib"],
    qq: ["regToString", "debugLib"],

    // Default for other mobile browsers
    default: ["debugger", "debugLib"],
  }

  /**
   * Create a new DevToolsDetectorManager
   * @param options Configuration options
   */
  constructor(options: DetectorManagerOptions = {}) {
    super('DevToolsDetectorManager')
    const debugMode = !!options.debugMode
    this.logger = new SimpleLoggingService("DevToolsDetectorManager", debugMode)

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.onDevToolsChange = options.onDevToolsChange || ((isOpen: boolean): void => {})
    this.browserInfo = getBrowser()
    this.isMobileDevice = isMobile()
    this.delayInitialCheck = options.delayInitialCheck !== false // Default to true
    this.initialCheckDelay = options.initialCheckDelay || 1000

    // Initialize all available detectors
    this.initializeAllDetectors(options)

    // Select appropriate detectors based on browser
    this.selectActiveDetectors(options.enabledDetectors)

    this.logger.log("Initialized for browser:", this.browserInfo.name)
    this.logger.log("Mobile device:", this.isMobileDevice)
    this.logger.log(
      "Active detectors:",
      Array.from(this.activeDetectors).map((d) => d.constructor.name),
    )

    // Schedule initial check with delay to avoid false positives during page load
    if (this.delayInitialCheck) {
      this.logger.log(`Delaying initial check by ${this.initialCheckDelay}ms`)

      this.initialCheckTimeout = window.setTimeout(() => {
        this.isInitialCheckDone = true
        this.checkDevTools()
        this.initialCheckTimeout = null

        this.logger.log("Initial check completed")
      }, this.initialCheckDelay)
    } else {
      this.isInitialCheckDone = true
    }
  }

  /**
   * Initialize all available detectors
   */
  private initializeAllDetectors(options: DetectorManagerOptions): void {
    const commonOptions = {
      onDevToolsChange: this.handleDetectorChange.bind(this),
      debugMode: this.logger.isDebugEnabled(),
    }

    // Initialize all detectors but don't activate them yet
    this.detectors.set(
      "debugger",
      new DebuggerDetector({
        ...commonOptions,
        timeoutDuration: options.debuggerTimeoutDuration || 50,
      }),
    )

    this.detectors.set(
      "timing",
      new TimingDetector({
        ...commonOptions,
        thresholdMultiplier: 3, // Slightly higher for better reliability
      }),
    )

    if (DateToStringDetector.isSupported()) {
      this.detectors.set(
        "dateToString",
        new DateToStringDetector({
          ...commonOptions,
          threshold: 2,
        }),
      )
    }

    if (FuncToStringDetector.isSupported()) {
      this.detectors.set(
        "funcToString",
        new FuncToStringDetector({
          ...commonOptions,
          threshold: 2,
        }),
      )
    }

    if (RegToStringDetector.isSupported()) {
      this.detectors.set(
        "regToString",
        new RegToStringDetector({
          ...commonOptions,
          timeThreshold: 100,
        }),
      )
    }

    this.detectors.set(
      "defineGetter",
      new DefineGetterDetector({
        ...commonOptions,
        checkInterval: options.checkInterval || 1000,
      }),
    )

    this.detectors.set(
      "debugLib",
      new DebugLibDetector({
        ...commonOptions,
        checkInterval: options.checkInterval || 1000,
      }),
    )

    if (SizeDetector.isSupported()) {
      this.detectors.set(
        "size",
        new SizeDetector({
          ...commonOptions,
          widthThreshold: 200,
          heightThreshold: 300,
        }),
      )
    }
  }

  /**
   * Select which detectors to activate based on browser
   */
  private selectActiveDetectors(userEnabledDetectors?: DetectorType[]): void {
    // If user specified detectors, use those
    if (userEnabledDetectors && userEnabledDetectors.length > 0) {
      this.activeDetectors = userEnabledDetectors
        .filter((type) => this.detectors.has(type))
        .map((type) => this.detectors.get(type)!)
        .filter(Boolean)

      this.logger.log("Using user-specified detectors")
      return
    }

    // Get browser-specific detectors
    let detectorTypes: DetectorType[] =
      DevToolsDetectorManager.BROWSER_DETECTOR_MAP[this.browserInfo.name] ||
      DevToolsDetectorManager.BROWSER_DETECTOR_MAP.unknown

    // Apply mobile overrides if on mobile
    if (this.isMobileDevice) {
      const mobileDetectorTypes =
        DevToolsDetectorManager.MOBILE_DETECTOR_MAP[this.browserInfo.name] ||
        DevToolsDetectorManager.MOBILE_DETECTOR_MAP.default

      // Combine with browser-specific detectors, prioritizing mobile ones
      detectorTypes = [...mobileDetectorTypes, ...detectorTypes.filter((type) => !mobileDetectorTypes.includes(type))]
    }

    // Activate the selected detectors
    this.activeDetectors = detectorTypes
      .filter((type) => this.detectors.has(type))
      .map((type) => this.detectors.get(type)!)
      .filter(Boolean)

    // Always start the continuous detectors
    const continuousDetector = this.detectors.get("debugLib") as DebugLibDetector
    if (continuousDetector) {
      continuousDetector.startDetection()
    }

    this.logger.log("Selected detectors for", this.browserInfo.name, ":", detectorTypes)
  }

  /**
   * Handle state change from any detector
   */
  private handleDetectorChange(isOpen: boolean): void {
    // Skip state changes until initial check is done
    if (!this.isInitialCheckDone) {
      this.logger.log("Ignoring state change before initial check")
      return
    }

    this.updateDevToolsState(isOpen)
  }

  /**
   * Check if DevTools is open using all active detectors
   */
  public checkDevTools(): void {
    // Skip checks until initial check is done
    if (!this.isInitialCheckDone) {
      this.logger.log("Skipping check before initial delay")
      return
    }

    for (const detector of this.activeDetectors) {
      detector.checkDevTools()

      // If any detector reports DevTools as open, we can stop checking
      if (detector.isOpen()) {
        break
      }
    }
  }

  /**
   * Get the current DevTools state
   * @returns True if DevTools is open
   */
  public isOpen(): boolean {
    return this.isDevToolsOpen
  }

  /**
   * Clean up resources for all detectors
   */
  public dispose(): void {
    // Clear initial check timeout if it exists
    if (this.initialCheckTimeout !== null) {
      clearTimeout(this.initialCheckTimeout)
      this.initialCheckTimeout = null
    }

    for (const detector of this.detectors.values()) {
      detector.dispose()
    }

    this.detectors.clear()
    this.activeDetectors = []

    this.logger.log("Disposed all detectors")
  }

  /**
   * Set debug mode for all detectors
   * @param enabled Whether debug mode should be enabled
   */
  public setDebugMode(enabled: boolean): void {
    this.logger.setDebugMode(enabled)

    for (const detector of this.detectors.values()) {
      detector.setDebugMode(enabled)
    }
  }
}