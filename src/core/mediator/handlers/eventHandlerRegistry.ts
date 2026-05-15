import type { ProtectionMediator } from "../types";
import { DevToolsEventHandler } from "./devToolsEventHandler";
import { BrowserExtensionEventHandler } from "./extensionEventHandlers";
import { FrameEmbeddingEventHandler } from "./iFrameEventHandlers";
import { ScreenshotEventHandler } from "./screenShotEventHandlers";

export class HandlerRegistry {
  private handlers: Record<string, unknown> = {};
  private mediator: ProtectionMediator;
  private debugMode: boolean;

  constructor(mediator: ProtectionMediator, debugMode = false) {
    this.mediator = mediator;
    this.debugMode = debugMode;
    this.initializeHandlers();
  }

  private initializeHandlers(): void {
    // Initialize all handlers
    this.handlers.devTools = new DevToolsEventHandler(this.mediator, this.debugMode);
    this.handlers.extension = new BrowserExtensionEventHandler(this.mediator, this.debugMode);
    this.handlers.screenshot = new ScreenshotEventHandler(this.mediator, this.debugMode);
    this.handlers.iFrame = new FrameEmbeddingEventHandler(this.mediator, this.debugMode);
    
    // Add more handlers as you implement them
    // this.handlers.screenshot = new ScreenshotEventHandler(this.mediator, this.debugMode);
    // this.handlers.frameEmbedding = new FrameEmbeddingEventHandler(this.mediator, this.debugMode);
    
    if (this.debugMode) {
      console.log("HandlerRegistry: Initialized all event handlers");
    }
  }

  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    
    // Update debug mode for all handlers
    Object.values(this.handlers).forEach(handler => {
      if (typeof (handler as { setDebugMode: (enabled: boolean) => void }).setDebugMode === 'function') {
        (handler as { setDebugMode: (enabled: boolean) => void }).setDebugMode(enabled);
      }
    });
  }
}