# Shield - Project Structure

## Core Components

### ContentProtector
**Location**: `src/core/ContentProtector.ts`
**Purpose**: Main entry point and orchestrator for all protection strategies
**Relations**:
- Instantiates and manages all protection strategies
- Uses `SecurityOverlayManager` for overlay management
- Uses `IntervalManager` for timing operations
- Uses `EventManager` for event handling

### ContentProtectionMediator
**Location**: `src/core/mediator/ContentProtectionMediator.ts`
**Purpose**: Handles communication between different components
**Relations**:
- Used by all strategies for event publishing/subscribing
- Manages `ProtectionEvent` distribution
- Interfaces with `EventManager`

## Protection Strategies

### AbstractStrategy
**Location**: `src/strategies/AbstractStrategy.ts`
**Purpose**: Base class for all protection strategies
**Relations**:
- Implements `ProtectionStrategy` interface
- Uses `ContentProtectionMediator` for events
- Uses `SecurityOverlayManager` for overlays

### KeyboardStrategy
**Location**: `src/strategies/KeyboardStrategy.ts`
**Purpose**: Prevents keyboard shortcuts
**Relations**:
- Extends `AbstractStrategy`
- Uses DOM event listeners

### ContextMenuStrategy
**Location**: `src/strategies/ContextMenuStrategy.ts`
**Purpose**: Prevents context menu access
**Relations**:
- Extends `AbstractStrategy`
- Uses DOM event listeners

### PrintStrategy
**Location**: `src/strategies/PrintStrategy.ts`
**Purpose**: Prevents printing attempts
**Relations**:
- Extends `AbstractStrategy`
- Uses DOM event listeners
- Uses `SecurityOverlayManager`

### SelectionStrategy
**Location**: `src/strategies/SelectionStrategy.ts`
**Purpose**: Prevents text selection
**Relations**:
- Extends `AbstractStrategy`
- Uses DOM event listeners

### WatermarkStrategy
**Location**: `src/strategies/WatermarkStrategy.ts`
**Purpose**: Adds watermarks to content
**Relations**:
- Extends `AbstractStrategy`
- Uses `DOMObserver`
- Uses `ProtectedContentManager`

### DevToolsStrategy
**Location**: `src/strategies/DevToolsStrategy.ts`
**Purpose**: Detects and responds to DevTools usage
**Relations**:
- Extends `AbstractStrategy`
- Uses `SecurityOverlayManager`
- Uses `IntervalManager`

### ScreenshotStrategy
**Location**: `src/strategies/ScreenshotStrategy.ts`
**Purpose**: Detects screenshot attempts
**Relations**:
- Extends `AbstractStrategy`
- Uses `SecurityOverlayManager`
- Uses DOM event listeners

### BrowserExtensionDetectionStrategy
**Location**: `src/strategies/BrowserExtensionDetectionStrategy.ts`
**Purpose**: Detects potentially malicious browser extensions
**Relations**:
- Extends `AbstractStrategy`
- Uses `DOMObserver`

### FrameEmbeddingProtectionStrategy
**Location**: `src/strategies/FrameEmbeddingProtectionStrategy.ts`
**Purpose**: Prevents unauthorized iframe embedding
**Relations**:
- Extends `AbstractStrategy`
- Uses `SecurityOverlayManager`

## Utility Classes

### SecurityOverlayManager
**Location**: `src/utils/SecurityOverlayManager.ts`
**Purpose**: Manages security overlays and messages
**Relations**:
- Used by multiple strategies
- Uses `DOMObserver` for overlay persistence

### ProtectedContentManager
**Location**: `src/utils/ProtectedContentManager.ts`
**Purpose**: Manages protected content visibility
**Relations**:
- Used by multiple strategies
- Uses `DOMObserver` for content protection

### DOMObserver
**Location**: `src/utils/DOMObserver.ts`
**Purpose**: Observes and responds to DOM changes
**Relations**:
- Used by `WatermarkStrategy`
- Used by `SecurityOverlayManager`
- Used by `ProtectedContentManager`

### IntervalManager
**Location**: `src/utils/IntervalManager.ts`
**Purpose**: Manages timing operations
**Relations**:
- Used by `DevToolsStrategy`
- Used by other strategies for periodic checks

### EventManager
**Location**: `src/utils/EventManager.ts`
**Purpose**: Manages custom events and subscriptions
**Relations**:
- Used by `ContentProtectionMediator`
- Used indirectly by all strategies

## Type Definitions

### ContentProtectionOptions
**Location**: `src/types/index.ts`
**Purpose**: Defines configuration options
**Relations**:
- Used by `ContentProtector`
- Referenced by all strategies

### ProtectionStrategy
**Location**: `src/types/index.ts`
**Purpose**: Interface for protection strategies
**Relations**:
- Implemented by `AbstractStrategy`
- Referenced by `ContentProtector`

### ProtectionEvent
**Location**: `src/core/mediator/protection-event.ts`
**Purpose**: Defines event types and structures
**Relations**:
- Used by `ContentProtectionMediator`
- Used by all strategies for event handling

## Event System

### ProtectionEventType
**Location**: `src/core/mediator/protection-event.ts`
**Purpose**: Enum of all possible protection events
**Relations**:
- Used by `ContentProtectionMediator`
- Used by all strategies
- Referenced in event handlers

## Class Hierarchy

```
ContentProtector
├── ProtectionStrategy (interface)
│   └── AbstractStrategy
│       ├── KeyboardStrategy
│       ├── ContextMenuStrategy
│       ├── PrintStrategy
│       ├── SelectionStrategy
│       ├── WatermarkStrategy
│       ├── DevToolsStrategy
│       ├── ScreenshotStrategy
│       ├── BrowserExtensionDetectionStrategy
│       └── FrameEmbeddingProtectionStrategy
│
├── Utilities
│   ├── SecurityOverlayManager
│   ├── ProtectedContentManager
│   ├── DOMObserver
│   ├── IntervalManager
│   └── EventManager
│
└── Mediator System
    ├── ContentProtectionMediator
    └── ProtectionEvent
```