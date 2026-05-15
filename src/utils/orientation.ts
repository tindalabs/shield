/**
 * Check if the device is currently in landscape mode using the Screen Orientation API
 * @returns true if in landscape mode, false if in portrait mode
 */
export function isLandscape(): boolean {
  if (typeof screen === 'undefined' || !screen.orientation) {
    // Fallback to window dimensions if Screen Orientation API is not available
    return window.innerWidth > window.innerHeight;
  }
  
  // Use Screen Orientation API
  return screen.orientation.type.includes('landscape');
}

/**
 * Get the current orientation type
 * @returns The orientation type string or null if not available
 */
export function getOrientationType(): string | null {
  if (typeof screen === 'undefined' || !screen.orientation) {
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  }
  
  return screen.orientation.type;
}

/**
 * Get the current orientation angle in degrees
 * @returns The orientation angle in degrees or 0 if not available
 */
export function getOrientationAngle(): number {
  if (typeof screen === 'undefined' || !screen.orientation) {
    return 0;
  }
  
  return screen.orientation.angle;
}