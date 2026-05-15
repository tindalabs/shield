export class SimpleLoggingService {
  private componentName: string
  private debugMode: boolean

  /**
   * Create a new SimpleLoggingService
   * for consistent logging across the toolkit
   * @param componentName Name of the component for log prefixing
   * @param debugMode Whether debug mode is enabled
   */
  constructor(componentName: string, debugMode = false) {
    this.componentName = componentName
    this.debugMode = debugMode
  }

  /**
   * Log a debug message if debug mode is enabled
   * @param message Message to log
   * @param args Additional arguments to log
   */
  public log(message: string, ...args: unknown[]): void {
    if (this.debugMode) {
      console.log(`${this.componentName}: ${message}`, ...args)
    }
  }

  /**
   * Log a warning message
   * @param message Warning message
   * @param args Additional arguments to log
   */
  public warn(message: string, ...args: unknown[]): void {
    if (this.debugMode) {
      console.warn(`${this.componentName}: ${message}`, ...args)
    } else {
      // In non-debug mode, only log the message without args for brevity
      console.warn(`${this.componentName}: ${message}`)
    }
  }

  /**
   * Log an error message
   * @param message Error message
   * @param args Additional arguments to log
   */
  public error(message: string, ...args: unknown[]): void {
    console.error(`${this.componentName}: ${message}`, ...args)
  }

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled
  }

  /**
   * Get current debug mode
   * @returns Whether debug mode is enabled
   */
  public isDebugEnabled(): boolean {
    return this.debugMode
  }
}