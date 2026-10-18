import { type Ref, nextTick, onBeforeUnmount, watch } from 'vue';

/**
 * Keyboard and focus behavior shared by every modal (request drawer, reject dialog, confirmations),
 * following the WAI-ARIA dialog pattern:
 * - focus moves into the dialog when it opens (`initialFocus`, or the first focusable element);
 * - Tab / Shift+Tab cycle inside it (focus trap);
 * - Escape closes it from anywhere on the page, not only when focus is inside;
 * - on close, focus returns to the element that opened it.
 * Dialogs can stack (e.g. a confirmation over a drawer); only the top one reacts to keys.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const stack: symbol[] = [];

export interface DialogOptions {
  /** Called on Escape; the dialog decides whether it can close (e.g. not while saving). */
  onClose: () => void;
  /** Element to focus on open; defaults to the first focusable element in the panel. */
  initialFocus?: () => HTMLElement | null | undefined;
}

export function useDialog(isOpen: Ref<boolean>, panel: Ref<HTMLElement | null>, options: DialogOptions): void {
  const id = Symbol('dialog');
  let returnFocusTo: HTMLElement | null = null;

  const focusables = (): HTMLElement[] =>
    panel.value ? [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null) : [];

  function onKeydown(event: KeyboardEvent): void {
    if (stack.at(-1) !== id) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      options.onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const outside = !panel.value?.contains(active);
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  }

  async function open(): Promise<void> {
    returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stack.push(id);
    document.addEventListener('keydown', onKeydown);
    await nextTick();
    (options.initialFocus?.() ?? focusables()[0] ?? panel.value)?.focus();
  }

  function close(): void {
    const index = stack.indexOf(id);
    if (index === -1) return;
    stack.splice(index, 1);
    document.removeEventListener('keydown', onKeydown);
    // The opener can be gone (e.g. a withdrawn row); then focus simply stays on the page.
    if (returnFocusTo?.isConnected) returnFocusTo.focus();
    returnFocusTo = null;
  }

  watch(isOpen, (value) => void (value ? open() : close()), { immediate: true });
  onBeforeUnmount(close);
}
