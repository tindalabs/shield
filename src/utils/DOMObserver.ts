/**
 * Options for the DOM observer
 */
export interface DomObserverOptions {
  /**
   * Target element to observe
   */
  targetElement: HTMLElement;

  /**
   * Callback function when elements are removed
   */
  onElementsRemoved?: (removedElements: HTMLElement[]) => void;

  /**
   * Callback function when elements are added
   */
  onElementsAdded?: (addedElements: HTMLElement[]) => void;

  /**
   * Elements to watch for removal
   */
  elementsToWatch: HTMLElement[];

  /**
   * Whether to observe child elements as well
   */
  observeSubtree?: boolean;

  /**
   * Enable debug mode for troubleshooting
   */
  debugMode?: boolean;

  /**
   * Custom name for logging
   */
  name?: string;
}

/**
 * Helper class to observe DOM changes and detect when specific elements are added or removed
 */
export class DomObserver {
  private observer: MutationObserver | null = null;
  private options: DomObserverOptions;
  private isObserving: boolean = false;

  /**
   * Create a new DOM observer
   * @param options Observer options
   */
  constructor(options: DomObserverOptions) {
    this.options = {
      observeSubtree: true,
      debugMode: false,
      name: 'DomObserver',
      ...options,
    };
  }

  /**
   * Start observing the DOM for changes
   */
  public startObserving(): void {
    if (this.isObserving || typeof MutationObserver === 'undefined' || !this.options.targetElement) {
      return;
    }

    // Remove any existing observer
    this.stopObserving();

    // Create a new observer
    this.observer = new MutationObserver((mutations) => {
      const removedElements: HTMLElement[] = [];
      const addedElements: HTMLElement[] = [];

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Check if any of our watched elements were removed
          for (const node of Array.from(mutation.removedNodes)) {
            if (node instanceof HTMLElement) {
              if (this.options.elementsToWatch.includes(node)) {
                removedElements.push(node);

                if (this.options.debugMode) {
                  console.log(`${this.options.name}: Watched element was removed from DOM`, node);
                }
              }
            }
          }

          // Check for added nodes if we have an onElementsAdded callback
          if (this.options.onElementsAdded) {
            for (const node of Array.from(mutation.addedNodes)) {
              if (node instanceof HTMLElement) {
                addedElements.push(node);

                // If we're observing the subtree, also check for child elements
                if (this.options.observeSubtree) {
                  const childElements = node.querySelectorAll("*");
                  childElements.forEach((child) => {
                    if (child instanceof HTMLElement) {
                      addedElements.push(child);
                    }
                  })
                }

                if (this.options.debugMode) {
                  console.log(`${this.options.name}: Element was added to DOM`, node);
                }
              }
            }
          }
        }
      }

      // Call callbacks if we have elements to report
      if (removedElements.length > 0 && this.options.onElementsRemoved) {
        this.options.onElementsRemoved(removedElements);
      }

      if (addedElements.length > 0 && this.options.onElementsAdded) {
        this.options.onElementsAdded(addedElements);
      }
    });

    // Start observing the target element
    this.observer.observe(this.options.targetElement, {
      childList: true,
      subtree: this.options.observeSubtree,
    });

    this.isObserving = true;

    if (this.options.debugMode) {
      console.log(`${this.options.name}: Started observing`, {
        target: this.options.targetElement,
        elementsCount: this.options.elementsToWatch.length,
        subtree: this.options.observeSubtree,
      });
    }
  }

  /**
   * Stop observing the DOM
   */
  public stopObserving(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      this.isObserving = false;

      if (this.options.debugMode) {
        console.log(`${this.options.name}: Stopped observing`);
      }
    }
  }

  /**
   * Update the elements to watch
   * @param elements New elements to watch
   */
  public updateElementsToWatch(elements: HTMLElement[]): void {
    this.options.elementsToWatch = elements;

    if (this.isObserving && this.options.debugMode) {
      console.log(`${this.options.name}: Updated elements to watch`, {
        elementsCount: elements.length,
      });
    }
  }

  /**
   * Update the target element
   * @param element New target element
   */
  public updateTargetElement(element: HTMLElement): void {
    if (this.options.targetElement !== element) {
      this.options.targetElement = element;

      // Restart observing with the new target
      if (this.isObserving) {
        this.stopObserving();
        this.startObserving();
      }
    }
  }

  /**
   * Check if the observer is currently observing
   */
  public isActive(): boolean {
    return this.isObserving;
  }
}