import { type Ref, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { placePopover } from '@/utils/pickers';

export interface PopoverOptions {
  /** Preferred width in px; defaults to the trigger's width. Never exceeds the viewport. */
  width?: () => number;
  /** Cap on the popover's height in px (e.g. a scrolling listbox); the content height otherwise. */
  maxHeight?: number;
  /** Called on a pointer press outside both the trigger and the popover. */
  onOutside: () => void;
}

/**
 * Positions a popover that is teleported to `<body>` (so scroll containers such as the request drawer's
 * `overflow-auto` body can't clip it) with `position: fixed` next to its trigger, flipping above when it
 * doesn't fit below, and keeps it there while the page or any ancestor scrolls or the window resizes.
 */
export function usePopover(
  open: Ref<boolean>,
  trigger: Ref<HTMLElement | null>,
  popover: Ref<HTMLElement | null>,
  options: PopoverOptions,
) {
  const style = ref<Record<string, string>>({});

  function update(): void {
    const anchor = trigger.value;
    if (!anchor || !open.value) return;
    const rect = anchor.getBoundingClientRect();
    const width = options.width?.() ?? rect.width;
    // Measure the natural height (scrollHeight ignores the max-height set last time).
    const cap = options.maxHeight ?? Infinity;
    const height = Math.min(popover.value?.scrollHeight ?? 0, cap);
    const place = placePopover(rect, { width, height }, { width: window.innerWidth, height: window.innerHeight });
    style.value = {
      top: `${place.top}px`,
      left: `${place.left}px`,
      width: `${place.width}px`,
      maxHeight: `${Math.min(place.maxHeight, cap)}px`,
    };
  }

  function onPointerDown(event: Event): void {
    const target = event.target as Node | null;
    if (!target) return;
    if (trigger.value?.contains(target) || popover.value?.contains(target)) return;
    options.onOutside();
  }

  function listen(on: boolean): void {
    const method = on ? 'addEventListener' : 'removeEventListener';
    window[method]('scroll', update, true);
    window[method]('resize', update);
    document[method]('pointerdown', onPointerDown, true);
  }

  watch(open, async (value) => {
    listen(value);
    if (!value) return;
    update();
    await nextTick();
    update();
  });

  onBeforeUnmount(() => listen(false));

  return { style, update };
}
