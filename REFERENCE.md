# Shield - Reference Documentation

This document provides detailed usage information and API reference for the Shield library.

## Table of Contents

- [Basic Usage](#basic-usage)
- [Advanced Usage](#advanced-usage)
  - [Custom Event Handlers](#custom-event-handlers)
  - [Using Individual Strategies](#using-individual-strategies)
  - [Updating Options](#updating-options)
- [API Reference](#api-reference)
  - [ContentProtector](#contentprotector)
  - [Protection Strategies](#protection-strategies)
    - [ContextMenuStrategy](#contextmenustrategy)
    - [SelectionStrategy](#selectionstrategy)
    - [PrintStrategy](#printstrategy)
    - [KeyboardStrategy](#keyboardstrategy)
    - [DevToolsStrategy](#devtoolsstrategy)
    - [ScreenshotStrategy](#screenshotstrategy)
    - [WatermarkStrategy](#watermarkstrategy)
    - [BrowserExtensionDetectionStrategy](#browserextensiondetectionstrategy)
    - [FrameEmbeddingProtectionStrategy](#frameembeddingprotectionstrategy)
  - [Utility Classes](#utility-classes)
    - [SecurityOverlayManager](#securityoverlaymanager)
    - [ProtectedContentManager](#protectedcontentmanager)
    - [DomObserver](#domobserver)

## Basic Usage

```javascript
import { ContentProtector } from '@tindalabs/shield';

// Create a protector with default options
const protector = new ContentProtector({
  // Target element (defaults to document.body)
  targetElement: document.getElementById('protected-content'),
  
  // Enable/disable specific protections
  preventSelection: true,
  preventContextMenu: true,
  preventPrinting: true,
  preventKeyboardShortcuts: true,
  preventDevTools: true,
  preventScreenshots: true,
  preventExtensions: true,
  preventEmbedding: true,
  
  // Enable watermarking
  enableWatermark: true,
  watermarkOptions: {
    text: 'CONFIDENTIAL',
    opacity: 0.2,
    density: 3
  },
  
  // Enable debug mode
  debugMode: false
});

// Apply all protections
protector.protect();

// Remove all protections when needed
protector.unprotect();
```