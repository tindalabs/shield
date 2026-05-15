/**
 * Utility to detect when screenshots are being taken by monitoring focus events
 * and other browser behaviors that might indicate screenshot tools are active
 */
export class ScreenshotDetector {
    private focusLossTimestamps: number[] = [];
    private focusLossThreshold = 300; // ms
    private focusLossDetectionWindow = 1000; // ms
    private focusLossMinCount = 2; // Number of focus losses to trigger detection
    private lastKeyEvent = 0;
    private callbacks: Array<() => void> = [];
    private isMonitoring = false;
    private debugMode: boolean;
  
    /**
     * Create a new ScreenshotDetector
     * @param options Configuration options
     */
    constructor(options: {
      focusLossThreshold?: number;
      focusLossDetectionWindow?: number;
      focusLossMinCount?: number;
      debugMode?: boolean;
    } = {}) {
      this.focusLossThreshold = options.focusLossThreshold || 300;
      this.focusLossDetectionWindow = options.focusLossDetectionWindow || 1000;
      this.focusLossMinCount = options.focusLossMinCount || 2;
      this.debugMode = options.debugMode || false;
    }
  
    /**
     * Start monitoring for screenshot attempts
     */
    public startMonitoring(): void {
      if (this.isMonitoring) return;
      
      this.isMonitoring = true;
      window.addEventListener('blur', this.handleWindowBlur);
      window.addEventListener('focus', this.handleWindowFocus);
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('visibilitychange', this.handleVisibilityChange);
      
      if (this.debugMode) {
        console.log('ScreenshotDetector: Started monitoring');
      }
    }
  
    /**
     * Stop monitoring for screenshot attempts
     */
    public stopMonitoring(): void {
      if (!this.isMonitoring) return;
      
      this.isMonitoring = false;
      window.removeEventListener('blur', this.handleWindowBlur);
      window.removeEventListener('focus', this.handleWindowFocus);
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('visibilitychange', this.handleVisibilityChange);
      
      if (this.debugMode) {
        console.log('ScreenshotDetector: Stopped monitoring');
      }
    }
  
    /**
     * Add a callback to be called when a screenshot is detected
     * @param callback Function to call when a screenshot is detected
     */
    public onScreenshotDetected(callback: () => void): void {
      this.callbacks.push(callback);
    }
  
    /**
     * Remove a callback
     * @param callback Function to remove
     */
    public removeCallback(callback: () => void): void {
      const index = this.callbacks.indexOf(callback);
      if (index !== -1) {
        this.callbacks.splice(index, 1);
      }
    }
  
    /**
     * Handle window blur event - might indicate screenshot tool activation
     */
    private handleWindowBlur = (): void => {
      const now = Date.now();
      const timeSinceLastKey = now - this.lastKeyEvent;
  
      // Record the timestamp of this focus loss
      this.focusLossTimestamps.push(now);
      
      // Remove timestamps older than our detection window
      this.focusLossTimestamps = this.focusLossTimestamps.filter(
        timestamp => now - timestamp < this.focusLossDetectionWindow
      );
  
      // If we have multiple focus losses in a short period, it might be a screenshot tool
      if (this.focusLossTimestamps.length >= this.focusLossMinCount) {
        if (this.debugMode) {
          console.log(`ScreenshotDetector: ${this.focusLossTimestamps.length} rapid focus losses detected in ${this.focusLossDetectionWindow}ms window, possible screenshot attempt`);
        }
        this.notifyCallbacks();
      }
      // Traditional detection - if window loses focus shortly after a key event
      else if (timeSinceLastKey < 500) {
        if (this.debugMode) {
          console.log("ScreenshotDetector: Window blur detected shortly after key event, possible screenshot attempt");
        }
        this.notifyCallbacks();
      }
    };
  
    /**
     * Handle window focus event - check for rapid focus changes
     */
    private handleWindowFocus = (): void => {
      const now = Date.now();
    
      // Check if we have rapid focus changes
      if (this.detectRapidFocusChanges(now)) {
        if (this.debugMode) {
          console.log("ScreenshotDetector: Rapid focus changes detected, possible screenshot attempt");
        }
        this.notifyCallbacks();
      }
    };
  
    /**
     * Handle key down event to track timing for screenshot shortcuts
     */
    private handleKeyDown = (e: KeyboardEvent): void => {
      this.lastKeyEvent = Date.now();
      
      // Check for common screenshot shortcuts
      if (this.isPossibleScreenshotShortcut(e)) {
        if (this.debugMode) {
          console.log("ScreenshotDetector: Possible screenshot shortcut detected", {
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey
          });
        }
      }
    };
  
    /**
     * Handle visibility change event - might indicate screenshot tool activation
     */
    private handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        const timeSinceLastKey = Date.now() - this.lastKeyEvent;
  
        // If document becomes hidden within 500ms of a key event, it might be a screenshot tool
        if (timeSinceLastKey < 500) {
          if (this.debugMode) {
            console.log("ScreenshotDetector: Visibility change detected shortly after key event, possible screenshot attempt");
          }
          this.notifyCallbacks();
        }
      }
    };
  
    /**
     * Check if a key combination might be a screenshot shortcut
     */
    private isPossibleScreenshotShortcut(e: KeyboardEvent): boolean {
      // Common screenshot shortcuts across platforms
      return (
        // Windows: Win+Shift+S, PrtScn
        (e.key === 'PrintScreen' || e.code === 'PrintScreen') ||
        (e.shiftKey && e.metaKey && (e.key === 's' || e.key === 'S')) ||
        
        // macOS: Cmd+Shift+3, Cmd+Shift+4, Cmd+Shift+5
        (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) ||
        
        // Linux: PrtScn, Alt+PrtScn
        (e.altKey && (e.key === 'PrintScreen' || e.code === 'PrintScreen'))
      );
    }
  
    /**
     * Detect if there are rapid focus changes
     * @param timestamp Current timestamp
     * @returns True if rapid focus changes are detected
     */
    private detectRapidFocusChanges(timestamp: number): boolean {
      // Count how many focus changes happened within our threshold
      const recentChanges = this.focusLossTimestamps.filter(
        t => timestamp - t < this.focusLossThreshold
      ).length;
      
      return recentChanges >= this.focusLossMinCount;
    }
  
    /**
     * Notify all callbacks of a screenshot detection
     */
    private notifyCallbacks(): void {
      for (const callback of this.callbacks) {
        try {
          callback();
        } catch (error) {
          console.error('Error in screenshot detection callback:', error);
        }
      }
    }
  }
  