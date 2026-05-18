import { ContentProtector } from '@/core/index.js';
import type { ContentProtectionOptions, CustomEventHandlers } from '@/types/index.js';

/**
 * A function that records one Shield security event as an immediately-ending
 * span (or any other sink). Keeping it framework-agnostic — Shield does not
 * depend on @opentelemetry/api; callers provide the emitter.
 *
 * @example with Blindspot:
 *   import { getTracer, getRouteContext } from '@tindalabs/blindspot';
 *   const emitter: SpanEmitter = (name, attrs) => {
 *     const span = getTracer().startSpan(name, { attributes: attrs }, getRouteContext());
 *     span.end();
 *   };
 */
export type SpanEmitter = (
  name: string,
  attrs?: Record<string, string | number | boolean>,
) => void;

function emit(
  emitter: SpanEmitter,
  name: string,
  attrs?: Record<string, string | number | boolean>,
): void {
  try { emitter(name, attrs); } catch { /* never let telemetry crash the app */ }
}

/**
 * Creates a ContentProtector with all callbacks wired to the provided SpanEmitter.
 * Each security event fires a call to emitter(), which should create and immediately
 * end a child span — so events are exported to Tempo without waiting for the
 * long-lived navigation span to close.
 *
 * Any existing customHandlers in options are preserved and called after the emit.
 */
export function attachShieldToSpan(
  options: ContentProtectionOptions,
  emitter: SpanEmitter,
): ContentProtector {
  const existing: CustomEventHandlers = options.customHandlers ?? {};

  const handlers: CustomEventHandlers = {
    ...existing,

    onDevToolsOpen(isOpen) {
      emit(emitter, isOpen ? 'shield.devtools.opened' : 'shield.devtools.closed');
      existing.onDevToolsOpen?.(isOpen);
    },

    onSelectionAttempt(event) {
      emit(emitter, 'shield.selection.attempted');
      existing.onSelectionAttempt?.(event);
    },

    onContextMenuAttempt(event) {
      emit(emitter, 'shield.context_menu.attempted');
      existing.onContextMenuAttempt?.(event);
    },

    onPrintAttempt(event) {
      emit(emitter, 'shield.print.attempted');
      existing.onPrintAttempt?.(event);
    },

    onKeyboardShortcutBlocked(event) {
      emit(emitter, 'shield.keyboard_shortcut.blocked', {
        'shield.keyboard.key': event.key,
        'shield.keyboard.code': event.code,
      });
      existing.onKeyboardShortcutBlocked?.(event);
    },

    onClipboardAttempt(event, action) {
      emit(emitter, `shield.clipboard.${action}`);
      existing.onClipboardAttempt?.(event, action);
    },

    onScreenshotAttempt(event) {
      emit(emitter, 'shield.screenshot.attempted');
      existing.onScreenshotAttempt?.(event);
    },

    onExtensionDetected(id, name, risk) {
      emit(emitter, 'shield.extension.detected', {
        'shield.extension.id': id,
        'shield.extension.name': name,
        'shield.extension.risk': risk,
      });
      existing.onExtensionDetected?.(id, name, risk);
    },

    onFrameEmbeddingDetected(isEmbedded, isExternal) {
      if (isEmbedded) {
        emit(emitter, 'shield.frame.embedding.detected', {
          'shield.frame.external': isExternal,
        });
      }
      existing.onFrameEmbeddingDetected?.(isEmbedded, isExternal);
    },

    onProtectionBypassed(method, event) {
      emit(emitter, 'shield.protection.bypassed', {
        'shield.bypass.method': method,
      });
      existing.onProtectionBypassed?.(method, event);
    },

    onContentHidden(reason, target) {
      emit(emitter, 'shield.content.hidden', { 'shield.hidden.reason': reason });
      existing.onContentHidden?.(reason, target);
    },

    onContentRestored(target) {
      emit(emitter, 'shield.content.restored');
      existing.onContentRestored?.(target);
    },
  };

  return new ContentProtector({ ...options, customHandlers: handlers });
}
