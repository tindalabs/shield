import { isBrowser } from "./environment"
import { SimpleLoggingService } from "./logging/simple/SimpleLoggingService"

/**
 * Manages timeouts for the content protection toolkit
 * Provides a centralized way to create, track, and clear timeouts
 */
export class TimeoutManager {
  private static instance: TimeoutManager | null = null
  private timeouts: Map<string, number> = new Map()
  private logger: SimpleLoggingService

  /**
   * Create a new TimeoutManager
   * @param debugMode Enable debug mode for troubleshooting
   */
  private constructor(debugMode = false) {
    this.logger = new SimpleLoggingService("TimeoutManager", debugMode)
    this.logger.log("Initialized")
  }

  /**
   * Get the TimeoutManager instance (singleton)
   * @param debugMode Enable debug mode for troubleshooting
   */
  public static getInstance(debugMode = false): TimeoutManager {
    if (!TimeoutManager.instance) {
      TimeoutManager.instance = new TimeoutManager(debugMode)
    }

    // Update debug mode if it's explicitly passed
    if (arguments.length > 0) {
      TimeoutManager.instance.setDebugMode(debugMode)
    }

    return TimeoutManager.instance
  }

  /**
   * Set a timeout with a unique ID
   * @param id Unique identifier for the timeout
   * @param callback Function to execute
   * @param delay Delay in milliseconds
   * @returns The timeout ID for later reference
   */
  public setTimeout(id: string, callback: () => void, delay: number): string {
    if (!isBrowser()) return id

    // Clear any existing timeout with this ID
    this.clearTimeout(id)

    // Create a new timeout
    const timeoutId = window.setTimeout(() => {
      // Remove from our map when it executes
      this.timeouts.delete(id)

      // Execute the callback
      try {
        callback()
      } catch (error) {
        this.logger.error(`Error executing timeout "${id}":`, error)
      }
    }, delay) as unknown as number

    // Store in our map
    this.timeouts.set(id, timeoutId)

    this.logger.log(`Set timeout "${id}" with delay ${delay}ms`)

    return id
  }

  /**
   * Clear a timeout by ID
   * @param id Timeout ID to clear
   * @returns True if the timeout was found and cleared
   */
  public clearTimeout(id: string): boolean {
    if (!isBrowser()) return false

    const timeoutId = this.timeouts.get(id)
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
      this.timeouts.delete(id)

      this.logger.log(`Cleared timeout "${id}"`)
      return true
    }

    return false
  }

  /**
   * Clear all timeouts
   * @returns Number of timeouts cleared
   */
  public clearAllTimeouts(): number {
    if (!isBrowser()) return 0

    let count = 0

    this.timeouts.forEach((timeoutId, _id) => {
      window.clearTimeout(timeoutId)
      count++
    })

    this.timeouts.clear()

    if (count > 0) {
      this.logger.log(`Cleared all ${count} timeouts`)
    }

    return count
  }

  /**
   * Check if a timeout exists
   * @param id Timeout ID to check
   * @returns True if the timeout exists
   */
  public hasTimeout(id: string): boolean {
    return this.timeouts.has(id)
  }

  /**
   * Get the number of active timeouts
   * @returns Number of active timeouts
   */
  public getTimeoutCount(): number {
    return this.timeouts.size
  }

  /**
   * Set debug mode
   * @param enabled Whether debug mode should be enabled
   */
  public setDebugMode(enabled: boolean): void {
    this.logger.setDebugMode(enabled)
    this.logger.log(`Debug mode ${enabled ? "enabled" : "disabled"}`)
  }
}

// Create a singleton instance for use throughout the application
export const timeoutManager = TimeoutManager.getInstance(false)