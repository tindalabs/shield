import { isBrowser } from "../environment"
import { intervalManager } from "../intervalManager"
import { AbstractDevToolsDetector, DetectorErrorType } from "./AbstractDevToolsDetector"
import { DevToolsDetectorOptions } from "./detectorInterface"

/**
 * Options for the DebugLibDetector
 */
export interface DebugLibDetectorOptions extends DevToolsDetectorOptions {
  /**
   * Check interval in milliseconds
   */
  checkInterval?: number

  /**
   * Additional libraries to check for beyond the default ones
   * Format: { name: string, globalVar: string }
   */
  additionalLibraries?: Array<{ name: string; globalVar: string }>
}

/**
 * Known debug libraries to detect
 */
interface DebugLibrary {
  name: string
  globalVar: string
}

/**
 * Detector that checks for third-party debugging libraries like Eruda and vConsole
 */
export class DebugLibDetector extends AbstractDevToolsDetector {
  private checkInterval: number
  private taskId: string | null = null
  private libraries: DebugLibrary[]

  // Default libraries to check for
  private static readonly DEFAULT_LIBRARIES: DebugLibrary[] = [
    // Mobile debugging tools
    { name: "Eruda", globalVar: "eruda" },
    { name: "vConsole", globalVar: "VConsole" },
    { name: "Weinre", globalVar: "weinre" },
    { name: "Firebug Lite", globalVar: "firebug" },
    { name: "Console Plus", globalVar: "ConsolePanel" },

    // Emulators and virtualization platforms
    { name: "BlueStacks", globalVar: "BlueStacks" },
    { name: "BlueStacks Helper", globalVar: "BlueStacksGamepad" },
    { name: "NoxPlayer", globalVar: "NoxPlayer" },
    { name: "MEmu", globalVar: "MEmu" },
    { name: "LDPlayer", globalVar: "LDPlayer" },

    // Remote debugging tools
    { name: "Vorlon", globalVar: "VORLON" },
    { name: "GapDebug", globalVar: "GapDebug" },
    { name: "Bugsnag", globalVar: "Bugsnag" },
    { name: "LogRocket", globalVar: "LogRocket" },
    { name: "Sentry", globalVar: "Sentry" },

    // Framework-specific DevTools
    { name: "React DevTools", globalVar: "__REACT_DEVTOOLS_GLOBAL_HOOK__" },
    { name: "Redux DevTools", globalVar: "__REDUX_DEVTOOLS_EXTENSION__" },
    { name: "Vue DevTools", globalVar: "__VUE_DEVTOOLS_GLOBAL_HOOK__" },
    { name: "Angular DevTools", globalVar: "ng" },
    { name: "Ember Inspector", globalVar: "EmberInspector" },

    // Mobile app debugging
    { name: "Flipper", globalVar: "__FLIPPER__" },
    { name: "Reactotron", globalVar: "reactotronClient" },
    { name: "Apollo DevTools", globalVar: "__APOLLO_DEVTOOLS_GLOBAL_HOOK__" },
    { name: "Cypress", globalVar: "Cypress" },

    // Web proxies and network tools
    { name: "Fiddler", globalVar: "Fiddler" },
    { name: "Charles", globalVar: "Charles" },
    { name: "Proxyman", globalVar: "Proxyman" },
  ]

  /**
   * Create a new DebugLibDetector
   * @param options Configuration options
   */
  constructor(options: DebugLibDetectorOptions = {}) {
    super("DebugLibDetector", options)
    this.checkInterval = options.checkInterval || 1000

    // Combine default libraries with any additional ones
    this.libraries = [...DebugLibDetector.DEFAULT_LIBRARIES]

    if (options.additionalLibraries && Array.isArray(options.additionalLibraries)) {
      this.libraries = [...this.libraries, ...options.additionalLibraries]
    }

    this.logger.log("Initialized with interval:", this.checkInterval)
    this.logger.log("Monitoring libraries:", this.libraries.map((lib) => lib.name).join(", "))
  }

  /**
   * Start continuous detection
   */
  public startDetection(): void {
    return this.safeExecute("startDetection", DetectorErrorType.INITIALIZATION_ERROR, () => {
      if (this.taskId || !isBrowser()) return

      // Register with IntervalManager for periodic checks
      this.taskId = intervalManager.registerTask(
        "debug-lib-detection",
        () => {
          this.checkDevTools()
        },
        this.checkInterval,
      )

      this.logger.log(`Started continuous detection with task ID ${this.taskId}`)

      // Perform initial check
      this.checkDevTools()
    })
  }

  /**
   * Stop continuous detection
   */
  public stopDetection(): void {
    return this.safeExecute("stopDetection", DetectorErrorType.DISPOSAL_ERROR, () => {
      if (!this.taskId) return

      // Unregister from IntervalManager
      intervalManager.unregisterTask(this.taskId)
      this.taskId = null

      this.logger.log("Stopped continuous detection")
    })
  }

  /**
   * Check if any debug libraries are present in the global scope
   */
  public checkDevTools(): void {
    if (this.isChecking || !isBrowser()) return
    this.isChecking = true

    this.safeExecute("checkDevTools", DetectorErrorType.DETECTION_ERROR, () => {
      // Check for any debug libraries
      const detectedLibraries = this.detectDebugLibraries()
      const isOpen = detectedLibraries.length > 0

      if (isOpen) {
        this.logger.log(`Debug libraries detected: ${detectedLibraries.join(", ")}`)
      } else {
        this.logger.log("No debug libraries detected")
      }

      // Update state and notify listeners if changed
      this.updateDevToolsState(isOpen)
      this.isChecking = false
    })

    // Ensure isChecking is reset even if an error occurs
    if (this.isChecking) {
      this.isChecking = false
    }
  }

  /**
   * Detect which debug libraries are present
   * @returns Array of detected library names
   */
  private detectDebugLibraries(): string[] {
    return (
      this.safeExecute("detectDebugLibraries", DetectorErrorType.DETECTION_ERROR, () => {
        const detected: string[] = []

        for (const lib of this.libraries) {
          try {
            // Check if the global variable exists
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (typeof (window as any)[lib.globalVar] !== "undefined") {
              detected.push(lib.name)
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (e) {
            // Ignore errors in property access
          }
        }

        return detected
      }) || []
    )
  }

  /**
   * Clean up resources
   */
  public override dispose(): void {
    this.safeExecute("dispose", DetectorErrorType.DISPOSAL_ERROR, () => {
      this.stopDetection()
      this.logger.log("Disposed")
    })

    super.dispose()
  }

  /**
   * Static utility to check if any debug libraries are present
   * @returns True if any debug library is detected
   */
  public static isAnyDebugLibPresent(): boolean {
    if (!isBrowser()) return false

    try {
      for (const lib of DebugLibDetector.DEFAULT_LIBRARIES) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (window as any)[lib.globalVar] !== "undefined") {
          return true
        }
      }
      return false
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return false
    }
  }

  /**
   * Check if this detector is supported in the current browser
   * @returns True if supported
   */
  public static isSupported(): boolean {
    if (!isBrowser()) return false

    // This detector works in all browser environments
    // It's especially useful for mobile browsers where other detectors might be less reliable
    // It detects third-party debugging libraries and tools that might be injected

    // No specific browser feature requirements beyond basic JS environment
    // The detector primarily checks for global objects and properties

    // Check if we can access the window object and its properties
    try {
      // Basic check to ensure we can access window properties
      if (typeof window === "undefined" || typeof window.navigator === "undefined") {
        return false
      }

      return true
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      // If we can't access window properties (e.g., in a restricted environment)
      return false
    }
  }
}