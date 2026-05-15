/**
 * Interface for all DevTools detector implementations
 */
export interface DevToolsDetector {
  /**
   * Check if DevTools is currently open
   */
  checkDevTools(): void

  /**
   * Get the current DevTools state
   * @returns True if DevTools is open
   */
  isOpen(): boolean

  /**
   * Clean up resources
   */
  dispose(): void

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  setDebugMode(enabled: boolean): void
}

/**
 * Common options for all DevTools detectors
 */
export interface DevToolsDetectorOptions {
  /**
   * Callback function when DevTools state changes
   */
  onDevToolsChange?: (isOpen: boolean) => void

  /**
   * Enable debug mode for troubleshooting
   */
  debugMode?: boolean
}
