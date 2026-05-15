/**
 * Interface for components that support logging
 */
export interface Loggable {
  /**
   * Log a debug message if debug mode is enabled
   * @param message Message to log
   * @param args Additional arguments to log
   */
  log(message: string, ...args: unknown[]): void;

  /**
   * Log a warning message
   * @param message Warning message
   * @param args Additional arguments to log
   */
  warn(message: string, ...args: unknown[]): void;

  /**
   * Log an error message
   * @param message Error message
   * @param args Additional arguments to log
   */
  error(message: string, ...args: unknown[]): void;

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  setDebugMode(enabled: boolean): void;

  /**
   * Check if debug mode is enabled
   * @returns Whether debug mode is enabled
   */
  isDebugEnabled(): boolean;
}