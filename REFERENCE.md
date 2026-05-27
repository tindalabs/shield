# Shield - Reference Documentation

This document provides detailed usage information and API reference for the Shield library.

## Table of Contents

- [Basic Usage](#basic-usage)
- [ContentProtector Options](#contentprotector-options)
  - [ClipboardOptions](#clipboardoptions)
  - [WatermarkOptions](#watermarkoptions)
  - [ContextMenuOptions](#contextmenuoptions)
  - [ScreenshotOptions](#screenshotoptions)
  - [DevToolsOptions](#devtoolsoptions)
  - [BrowserExtensionOptions](#browserextensionoptions)
  - [FrameEmbeddingOptions](#frameembeddingoptions)

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

  // Block copy/cut/paste (and the Clipboard API + execCommand)
  preventClipboard: true,
  clipboardOptions: {
    preventCopy: true,   // default: true
    preventCut: true,    // default: true
    preventPaste: false, // default: false
    replacementText: 'Content copying is disabled for security reasons.'
  },
  
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

## ContentProtector Options

All options are passed to the `ContentProtector` constructor. Every protection is **off by default** — you opt in per feature. Most `prevent*`/`enable*` toggles have an optional companion `*Options` object for fine-tuning; `preventSelection`, `preventPrinting`, and `preventKeyboardShortcuts` are boolean-only and take no further options.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `targetElement` | `HTMLElement \| null` | `document.body` | Element to protect. |
| `preventSelection` | `boolean` | `false` | Block text selection. |
| `preventContextMenu` | `boolean` | `false` | Block the right-click context menu. |
| `contextMenuOptions` | `ContextMenuOptions` | — | Context-menu behaviour (see below). |
| `preventKeyboardShortcuts` | `boolean` | `false` | Block shortcuts (copy, save, print, screenshot keys). |
| `preventPrinting` | `boolean` | `false` | Block printing and print-to-PDF. |
| `preventClipboard` | `boolean` | `false` | Block copy/cut/paste events, the Clipboard API, and `execCommand`. |
| `clipboardOptions` | `ClipboardOptions` | — | Per-operation clipboard control (see below). |
| `preventScreenshots` | `boolean` | `false` | Detect screenshot attempts and respond. |
| `screenshotOptions` | `ScreenshotOptions` | — | Screenshot response behaviour (see below). |
| `preventDevTools` | `boolean` | `false` | Detect DevTools opening and respond. |
| `devToolsOptions` | `DevToolsOptions` | — | DevTools detector configuration (see below). |
| `preventExtensions` | `boolean` | `false` | Detect scraping/automation browser extensions. |
| `extensionOptions` | `BrowserExtensionOptions` | — | Extension detection configuration (see below). |
| `preventEmbedding` | `boolean` | `false` | Block the page from being embedded in an iframe. |
| `frameEmbeddingOptions` | `FrameEmbeddingOptions` | — | Frame-embedding rules (see below). |
| `enableWatermark` | `boolean` | `false` | Overlay a repeating watermark. |
| `watermarkOptions` | `WatermarkOptions` | — | Watermark appearance (see below). |
| `customHandlers` | `CustomEventHandlers` | — | Callbacks fired on protection events (`onPrintAttempt`, `onKeyboardShortcutBlocked`, `onDevToolsOpen`, `onProtectionBypassed`, …). |
| `debugMode` | `boolean` | `false` | Verbose logging across all strategies. |

### `ClipboardOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `preventCopy` | `boolean` | `true` | Block copy operations. |
| `preventCut` | `boolean` | `true` | Block cut operations. |
| `preventPaste` | `boolean` | `false` | Block paste operations. |
| `replacementText` | `string` | `"Content copying is disabled for security reasons."` | Text written to the clipboard in place of copied content. |

### `WatermarkOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `text` | `string` | _(required)_ | Watermark text. |
| `userId` | `string` | — | Included in the watermark for traceability. |
| `opacity` | `number` | `0.15` | Opacity, `0`–`1`. |
| `density` | `number` | `3` | Pattern density, `1`–`10`. |
| `style` | `Partial<CSSStyleDeclaration>` | — | Custom CSS applied to each watermark element. |

### `ContextMenuOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `observeForIframes` | `boolean` | `false` | Also protect iframes added to the DOM dynamically. |

### `ScreenshotOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `showOverlay` | `boolean` | `true` | Show a blocking overlay when a screenshot is detected. |
| `overlayOptions` | `OverlayOptions` | — | Custom overlay appearance. |
| `hideContent` | `boolean` | `true` | Hide protected content while triggered. |
| `preventFullscreen` | `boolean` | `true` | Block fullscreen mode. |
| `fullscreenMessage` | `string` | — | Message shown when fullscreen is attempted. |

### `DevToolsOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `checkFrequency` | `number` | — | Detector poll interval, in milliseconds. |
| `showOverlay` | `boolean` | `true` | Show a blocking overlay when DevTools opens. |
| `overlayOptions` | `OverlayOptions` | — | Custom overlay appearance. |
| `hideContent` | `boolean` | `true` | Hide protected content while triggered. |
| `detectorTypes` | `string[]` | — | Specific detectors to run; empty selects the optimal set for the current browser. |

### `BrowserExtensionOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `configPath` | `string` | — | Path to a JSON extension-signature config. |
| `extensionsConfig` | `Record<string, ExtensionConfig>` | — | Inline extension signatures (alternative to `configPath`). |
| `detectionInterval` | `number` | — | How often to scan for extensions, in milliseconds. |
| `showOverlay` | `boolean` | `true` | Show a blocking overlay when an extension is detected. |
| `overlayOptions` | `OverlayOptions` | — | Custom overlay appearance. |
| `hideContent` | `boolean` | `true` | Hide protected content while triggered. |

### `FrameEmbeddingOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `allowedDomains` | `string[]` | `[]` | Domains permitted to embed the content; empty allows same-origin only. |
| `blockAllFrames` | `boolean` | `false` | Block embedding in any iframe, even same-origin. |
| `showOverlay` | `boolean` | `true` | Show a blocking overlay when embedding is detected. |
| `overlayOptions` | `OverlayOptions` | — | Custom overlay appearance. |
| `hideContent` | `boolean` | `true` | Hide protected content while triggered. |