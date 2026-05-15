import type { DevToolsDetector, DevToolsDetectorOptions } from "./detectorInterface"
import { SimpleLoggingService } from "../logging/simple/SimpleLoggingService"

/**
 * Enum representing different types of errors that can occur in detectors
 */
export enum DetectorErrorType {
  /**
   * Error during initialization of a detector
   */
  INITIALIZATION_ERROR = "initialization_error",

  /**
   * Error during detection check
   */
  DETECTION_ERROR = "detection_error",

  /**
   * Error related to browser compatibility
   */
  COMPATIBILITY_ERROR = "compatibility_error",

  /**
   * Error during cleanup/disposal
   */
  DISPOSAL_ERROR = "disposal_error",

  /**
   * Error in worker communication
   */
  WORKER_ERROR = "worker_error",

  /**
   * Error in DOM manipulation
   */
  DOM_ERROR = "dom_error",

  /**
   * Error in event handling
   */
  EVENT_ERROR = "event_error",

  /**
   * Unexpected or unknown error
   */
  UNKNOWN_ERROR = "unknown_error",
}


/**
 * Abstract base class for DevTools detectors
 * Implements common functionality to reduce duplication across detector implementations
 */
export abstract class AbstractDevToolsDetector implements DevToolsDetector {
  protected debugMode: boolean
  protected isDevToolsOpen = false
  protected isChecking = false
  protected onDevToolsChange: (isOpen: boolean) => void
  protected logger: SimpleLoggingService

  /**
   * Create a new detector instance
   * @param detectorName Name of the detector for logging
   * @param options Configuration options
   */
  constructor(
    protected readonly detectorName: string,
    options: DevToolsDetectorOptions = {},
  ) {
    this.onDevToolsChange = options.onDevToolsChange || ((): void => {})
    this.debugMode = !!options.debugMode
    this.logger = new SimpleLoggingService(detectorName, !!options.debugMode)

    this.logger.log("Initialized")
  }

  /**
   * Check if DevTools is open
   * This method must be implemented by subclasses
   */
  public abstract checkDevTools(): void

  /**
   * Get the current DevTools state
   * @returns True if DevTools is open
   */
  public isOpen(): boolean {
    return this.isDevToolsOpen
  }

  /**
   * Update the DevTools state and notify listeners if changed
   * @param isOpen New DevTools state
   */
  protected updateDevToolsState(isOpen: boolean): void {
    // Only trigger callback if state changed
    if (isOpen !== this.isDevToolsOpen) {
      this.isDevToolsOpen = isOpen
      this.onDevToolsChange(isOpen)

      this.logger.log(`DevTools ${isOpen ? "opened" : "closed"}`)
    }
  }

  /**
   * Handle an error with appropriate logging
   * @param errorType Type of error that occurred
   * @param message Error message
   * @param error The error object
   */
  protected handleError(errorType: DetectorErrorType, message: string, error: unknown): void {
    this.logger.error(`[${errorType}] ${message}:`, error)

    // Additional error handling logic can be added here
    // For example, reporting errors to a monitoring service
  }

  /**
   * Execute a function with error handling
   * @param operation Name of the operation for error reporting
   * @param errorType Type of error to report if the operation fails
   * @param fn Function to execute
   * @returns The result of the function or undefined if an error occurred
   */
  protected safeExecute<T>(operation: string, errorType: DetectorErrorType, fn: () => T): T | undefined {
    try {
      return fn()
    } catch (error) {
      this.handleError(errorType, `Error during ${operation}`, error)
      return undefined
    }
  }

  /**
   * Execute an async function with error handling
   * @param operation Name of the operation for error reporting
   * @param errorType Type of error to report if the operation fails
   * @param fn Async function to execute
   * @returns Promise resolving to the result of the function or undefined if an error occurred
   */
  protected async safeExecuteAsync<T>(
    operation: string,
    errorType: DetectorErrorType,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await fn()
    } catch (error) {
      this.handleError(errorType, `Error during ${operation}`, error)
      return undefined
    }
  }

  /**
   * Clean up resources
   * Override in subclasses to perform detector-specific cleanup
   */
  public dispose(): void {
    this.logger.log("Disposed")
  }

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled
    this.logger.setDebugMode(enabled)
  }
}