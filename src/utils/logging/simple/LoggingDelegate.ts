import { Loggable } from "./Loggable";
import { SimpleLoggingService } from "./SimpleLoggingService";

/**
 * Delegate class that implements logging functionality
 * Can be composed into any class that needs logging
 */
export class LoggingDelegate implements Loggable {
  private logger: SimpleLoggingService;

  /**
   * Create a new LoggingDelegate
   * @param componentName Name of the component for log prefixing
   * @param debugMode Whether debug mode is enabled
   */
  constructor(componentName: string, debugMode = false) {
    this.logger = new SimpleLoggingService(componentName, debugMode);
  }

  /**
   * Log a debug message if debug mode is enabled
   * @param message Message to log
   * @param args Additional arguments to log
   */
  public log(message: string, ...args: unknown[]): void {
    this.logger.log(message, ...args);
  }

  /**
   * Log a warning message
   * @param message Warning message
   * @param args Additional arguments to log
   */
  public warn(message: string, ...args: unknown[]): void {
    this.logger.warn(message, ...args);
  }

  /**
   * Log an error message
   * @param message Error message
   * @param args Additional arguments to log
   */
  public error(message: string, ...args: unknown[]): void {
    this.logger.error(message, ...args);
  }

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  public setDebugMode(enabled: boolean): void {
    this.logger.setDebugMode(enabled);
  }

  /**
   * Check if debug mode is enabled
   * @returns Whether debug mode is enabled
   */
  public isDebugEnabled(): boolean {
    return this.logger.isDebugEnabled();
  }
}