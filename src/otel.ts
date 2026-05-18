import { ContentProtector } from '@/core/index.js';
import type { ContentProtectionOptions, CustomEventHandlers } from '@/types/index.js';

/**
 * Minimal span interface — matches @opentelemetry/api Span without requiring
 * it as a dependency. Pass any object with addEvent() — including real OTel spans
 * or a Blindspot route span from getRouteSpan().
 */
export interface SpanLike {
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
}

export type SpanProvider = () => SpanLike | null | undefined;

function emit(
  provider: SpanProvider,
  name: string,
  attrs?: Record<string, string | number | boolean>,
): void {
  try { provider()?.addEvent(name, attrs); } catch { /* never let telemetry crash the app */ }
}

/**
 * Creates a ContentProtector with all callbacks wired to OTel span events.
 *
 * Pass any existing customHandlers in options — they run after the span event
 * is recorded, so UI state updates and span recording both happen.
 *
 * @example
 * // With Blindspot:
 * import { getRouteSpan } from '@tindalabs/blindspot';
 * const protector = attachShieldToSpan(options, () => getRouteSpan());
 * protector.protect();
 */
export function attachShieldToSpan(
  options: ContentProtectionOptions,
  spanProvider: SpanProvider,
): ContentProtector {
  const existing: CustomEventHandlers = options.customHandlers ?? {};

  const handlers: CustomEventHandlers = {
    ...existing,

    onDevToolsOpen(isOpen) {
      emit(spanProvider, isOpen ? 'shield.devtools.opened' : 'shield.devtools.closed');
      existing.onDevToolsOpen?.(isOpen);
    },

    onSelectionAttempt(event) {
      emit(spanProvider, 'shield.selection.attempted');
      existing.onSelectionAttempt?.(event);
    },

    onContextMenuAttempt(event) {
      emit(spanProvider, 'shield.context_menu.attempted');
      existing.onContextMenuAttempt?.(event);
    },

    onPrintAttempt(event) {
      emit(spanProvider, 'shield.print.attempted');
      existing.onPrintAttempt?.(event);
    },

    onKeyboardShortcutBlocked(event) {
      emit(spanProvider, 'shield.keyboard_shortcut.blocked', {
        'shield.keyboard.key': event.key,
        'shield.keyboard.code': event.code,
      });
      existing.onKeyboardShortcutBlocked?.(event);
    },

    onClipboardAttempt(event, action) {
      emit(spanProvider, `shield.clipboard.${action}`);
      existing.onClipboardAttempt?.(event, action);
    },

    onScreenshotAttempt(event) {
      emit(spanProvider, 'shield.screenshot.attempted');
      existing.onScreenshotAttempt?.(event);
    },

    onExtensionDetected(id, name, risk) {
      emit(spanProvider, 'shield.extension.detected', {
        'shield.extension.id': id,
        'shield.extension.name': name,
        'shield.extension.risk': risk,
      });
      existing.onExtensionDetected?.(id, name, risk);
    },

    onFrameEmbeddingDetected(isEmbedded, isExternal) {
      if (isEmbedded) {
        emit(spanProvider, 'shield.frame.embedding.detected', {
          'shield.frame.external': isExternal,
        });
      }
      existing.onFrameEmbeddingDetected?.(isEmbedded, isExternal);
    },

    onProtectionBypassed(method, event) {
      emit(spanProvider, 'shield.protection.bypassed', {
        'shield.bypass.method': method,
      });
      existing.onProtectionBypassed?.(method, event);
    },

    onContentHidden(reason, target) {
      emit(spanProvider, 'shield.content.hidden', { 'shield.hidden.reason': reason });
      existing.onContentHidden?.(reason, target);
    },

    onContentRestored(target) {
      emit(spanProvider, 'shield.content.restored');
      existing.onContentRestored?.(target);
    },
  };

  return new ContentProtector({ ...options, customHandlers: handlers });
}
