// DOM UTILITIES
/**
 * Safely add event listener with error handling
 */
export const safeAddEventListener = (
  element: HTMLElement | Document | Window,
  event: string,
  handler: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
): boolean => {
  try {
    element.addEventListener(event, handler, options);
    return true;
  } catch (error) {
    console.error(`Failed to add event listener for ${event}:`, error);
    return false;
  }
};

/**
 * Safely remove event listener with error handling
 */
export const safeRemoveEventListener = (
  element: HTMLElement | Document | Window,
  event: string,
  handler: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions
): boolean => {
  try {
    element.removeEventListener(event, handler, options);
    return true;
  } catch (error) {
    console.error(`Failed to remove event listener for ${event}:`, error);
    return false;
  }
};

/**
 * Create and inject a style element
 */
export const injectStyles = (css: string, id?: string): HTMLStyleElement | null => {
  if (typeof document === 'undefined') return null;
  
  try {
    const style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    
    if (id) {
      style.id = id;
    }
    
    style.textContent = css;
    document.head.appendChild(style);
    
    return style;
  } catch (error) {
    console.error('Failed to inject styles:', error);
    return null;
  }
};

/**
 * Remove a style element by ID
 */
export const removeStyles = (id: string): boolean => {
  if (typeof document === 'undefined') return false;
  
  try {
    const style = document.getElementById(id);
    if (style && style.parentNode) {
      style.parentNode.removeChild(style);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to remove styles with ID ${id}:`, error);
    return false;
  }
};

/**
 * Create an element with attributes and styles
 */
export const createElement = <T extends HTMLElement>(
  tag: string,
  attributes: Record<string, string> = {},
  styles: Partial<CSSStyleDeclaration> = {}
): T => {
  if (typeof document === 'undefined') {
    throw new Error('Document is not available');
  }
  
  const element = document.createElement(tag) as T;
  
  // Set attributes
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  
  // Set styles
  Object.assign(element.style, styles);
  
  return element;
};