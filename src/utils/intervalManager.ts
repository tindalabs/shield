import { isBrowser } from "./environment"
import { SimpleLoggingService } from "./logging/simple/SimpleLoggingService"

export type IntervalTask = {
  id: string
  callback: () => void
  frequency: number
  lastRun?: number
  isActive: boolean
}

/**
 * Manages periodic tasks for the content protection toolkit
 * Consolidates multiple interval timers into a single efficient timer
 */
export class IntervalManager {
  private tasks: Map<string, IntervalTask> = new Map()
  private intervalId: number | null = null
  private intervalFrequency = 500 // Base interval in ms (2 checks per second)
  private isRunning = false
  private logger: SimpleLoggingService

  /**
   * Create a new IntervalManager
   * @param debugMode Enable debug mode for troubleshooting
   */
  constructor(debugMode = false) {
    this.logger = new SimpleLoggingService("IntervalManager", debugMode)
    this.logger.log("Initialized")
  }

  /**
   * Register a new task to be executed periodically
   * @param id Unique identifier for the task
   * @param callback Function to execute
   * @param frequency How often to run the task in milliseconds
   * @returns The task ID for later reference
   */
  public registerTask(id: string, callback: () => void, frequency: number): string {
    if (!isBrowser()) return id

    // Ensure we have a unique ID by appending a timestamp if needed
    let taskId = id
    if (this.tasks.has(taskId)) {
      taskId = `${id}-${Date.now()}`
    }

    this.tasks.set(taskId, {
      id: taskId,
      callback,
      frequency,
      lastRun: 0,
      isActive: true,
    })

    this.logger.log(`Registered task "${taskId}" with frequency ${frequency}ms`)

    // Start the interval if it's not already running
    this.startInterval()

    return taskId
  }

  /**
   * Unregister a task by ID
   * @param id Task ID to remove
   * @returns True if the task was found and removed
   */
  public unregisterTask(id: string): boolean {
    if (!isBrowser()) return false

    const result = this.tasks.delete(id)

    if (result) {
      this.logger.log(`Unregistered task "${id}"`)
    }

    // If no tasks remain, stop the interval
    if (this.tasks.size === 0) {
      this.stopInterval()
    }

    return result
  }

  /**
   * Pause a specific task without removing it
   * @param id Task ID to pause
   * @returns True if the task was found and paused
   */
  public pauseTask(id: string): boolean {
    if (!isBrowser()) return false

    const task = this.tasks.get(id)
    if (task) {
      task.isActive = false
      this.tasks.set(id, task)

      this.logger.log(`Paused task "${id}"`)
      return true
    }
    return false
  }

  /**
   * Resume a paused task
   * @param id Task ID to resume
   * @returns True if the task was found and resumed
   */
  public resumeTask(id: string): boolean {
    if (!isBrowser()) return false

    const task = this.tasks.get(id)
    if (task) {
      task.isActive = true
      this.tasks.set(id, task)

      this.logger.log(`Resumed task "${id}"`)
      return true
    }
    return false
  }

  /**
   * Start the interval timer
   */
  private startInterval(): void {
    if (this.isRunning || !isBrowser()) return

    this.intervalId = window.setInterval(() => {
      this.executeEligibleTasks()
    }, this.intervalFrequency) as unknown as number

    this.isRunning = true

    this.logger.log(`Started interval timer with frequency ${this.intervalFrequency}ms`)
  }

  /**
   * Stop the interval timer
   */
  private stopInterval(): void {
    if (!this.isRunning || !isBrowser()) return

    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.isRunning = false

    this.logger.log("Stopped interval timer")
  }

  /**
   * Execute all tasks that are due to run
   */
  private executeEligibleTasks(): void {
    const now = Date.now()

    this.tasks.forEach((task) => {
      // Skip inactive tasks
      if (!task.isActive) return

      // Check if the task is due to run
      const timeSinceLastRun = now - (task.lastRun || 0)
      if (timeSinceLastRun >= task.frequency) {
        try {
          this.logger.log(`Executing task "${task.id}"`)

          // Execute the task
          task.callback()

          // Update the last run time
          task.lastRun = now
          this.tasks.set(task.id, task)
        } catch (error) {
          this.logger.error(`Error executing task "${task.id}":`, error)
        }
      }
    })
  }

  /**
   * Force execution of a specific task immediately
   * @param id Task ID to execute
   * @returns True if the task was found and executed
   */
  public executeTaskNow(id: string): boolean {
    if (!isBrowser()) return false

    const task = this.tasks.get(id)
    if (task && task.isActive) {
      try {
        this.logger.log(`Executing task "${id}" immediately`)

        task.callback()
        task.lastRun = Date.now()
        this.tasks.set(id, task)
        return true
      } catch (error) {
        this.logger.error(`Error executing task "${id}" immediately:`, error)
      }
    }
    return false
  }

  /**
   * Get the current status of all registered tasks
   * @returns Array of task status objects
   */
  public getTasksStatus(): Array<{
    id: string
    isActive: boolean
    frequency: number
    lastRun: number | undefined
    timeSinceLastRun: number | null
  }> {
    const now = Date.now()
    const result: Array<{
      id: string
      isActive: boolean
      frequency: number
      lastRun: number | undefined
      timeSinceLastRun: number | null
    }> = []

    this.tasks.forEach((task) => {
      result.push({
        id: task.id,
        isActive: task.isActive,
        frequency: task.frequency,
        lastRun: task.lastRun,
        timeSinceLastRun: task.lastRun ? now - task.lastRun : null,
      })
    })

    return result
  }

  /**
   * Clean up and stop all intervals
   */
  public dispose(): void {
    if (!isBrowser()) return

    this.stopInterval()
    this.tasks.clear()

    this.logger.log("Disposed")
  }

  /**
   * Update the base interval frequency
   * @param frequency New frequency in milliseconds
   */
  public setIntervalFrequency(frequency: number): void {
    if (frequency < 100) {
      this.logger.warn("Frequency below 100ms may cause performance issues")
    }

    this.intervalFrequency = frequency

    // Restart the interval with the new frequency if it's running
    if (this.isRunning) {
      this.stopInterval()
      this.startInterval()
    }

    this.logger.log(`Updated interval frequency to ${frequency}ms`)
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

/**
 * Create a singleton instance for use throughout the application
 */
export const intervalManager = new IntervalManager(false)