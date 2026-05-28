import { SimpleLoggingService } from "../logging/simple/SimpleLoggingService"

/**
 * Abstract base for any component that owns a named, debug-toggleable logger.
 *
 * Consolidates the logger + debug-mode plumbing that was previously duplicated
 * across {@link import("../../strategies/AbstractStrategy").AbstractStrategy},
 * {@link import("../detectors/AbstractDevToolsDetector").AbstractDevToolsDetector},
 * and {@link import("../../core/mediator/handlers/abstractEventHandler").AbstractEventHandler}.
 *
 * What lives here:
 *   - `COMPONENT_NAME` (used as the log prefix and as an owner key in event-
 *     manager / mediator subscriptions by subclasses).
 *   - `debugMode` + `logger`, kept in sync.
 *   - `log` / `warn` / `error` — thin pass-throughs to `SimpleLoggingService`,
 *     which already debug-gates `log` and applies the brief-vs-verbose split on
 *     `warn`. Subclasses' previous re-implementations of those gates were
 *     redundant.
 *
 * What does NOT live here: error-classification helpers like `handleError` and
 * `safeExecute` — `AbstractStrategy` and `AbstractDevToolsDetector` use
 * different error-type enums (`StrategyErrorType` vs `DetectorErrorType`) and
 * different reporting strategies, so hoisting them up would require generics
 * that obscure the call sites for little gain. They stay in the subclasses.
 */
export abstract class LoggableComponent {
  /** Used as the log prefix and as the owner key for event/mediator registrations. */
  public readonly COMPONENT_NAME: string
  protected debugMode: boolean
  protected logger: SimpleLoggingService

  constructor(componentName: string, debugMode = false) {
    this.COMPONENT_NAME = componentName
    this.debugMode = debugMode
    this.logger = new SimpleLoggingService(componentName, debugMode)
  }

  /**
   * Toggle debug mode on both this component and its logger. Emits a
   * confirmation line on enable (the disable case is silent because the logger
   * is gated by the post-update flag).
   */
  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled
    this.logger.setDebugMode(enabled)
    this.logger.log(`Debug mode ${enabled ? "enabled" : "disabled"}`)
  }

  public isDebugEnabled(): boolean {
    return this.debugMode
  }

  /** Debug log; suppressed in non-debug mode by `SimpleLoggingService`. */
  protected log(message: string, ...args: unknown[]): void {
    this.logger.log(message, ...args)
  }

  /** Warn log; brief form in non-debug mode (no args), full form with debug on. */
  protected warn(message: string, ...args: unknown[]): void {
    this.logger.warn(message, ...args)
  }

  /** Error log; always printed. */
  protected error(message: string, ...args: unknown[]): void {
    this.logger.error(message, ...args)
  }
}
