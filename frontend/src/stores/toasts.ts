import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * `live` is the ink "LIVE" card meant for server-push events. There is no push
 * channel (the API runs on Lambda), so it is only raised after the user's own
 * successful actions that map to a domain event (request created / approved).
 */
export type ToastKind = 'success' | 'error' | 'info' | 'live';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  action?: ToastAction;
}

export type ToastInput = Omit<Toast, 'id'>;

const MAX_VISIBLE = 4;
const DURATION_MS: Record<ToastKind, number> = {
  success: 4500,
  info: 4500,
  error: 6500,
  live: 9000,
};

export const useToastStore = defineStore('toasts', () => {
  const toasts = ref<Toast[]>([]);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let nextId = 1;

  function dismiss(id: number): void {
    clearTimeout(timers.get(id));
    timers.delete(id);
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function push(input: ToastInput): number {
    const id = nextId++;
    const overflow = toasts.value.length - (MAX_VISIBLE - 1);
    toasts.value.slice(0, Math.max(0, overflow)).forEach((t) => dismiss(t.id));
    toasts.value = [...toasts.value, { ...input, id }];
    timers.set(
      id,
      setTimeout(() => dismiss(id), DURATION_MS[input.kind]),
    );
    return id;
  }

  function clear(): void {
    [...toasts.value].forEach((t) => dismiss(t.id));
  }

  return { toasts, push, dismiss, clear };
});
