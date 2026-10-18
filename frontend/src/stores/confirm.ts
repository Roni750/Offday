import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
  /** `danger` for destructive or hard-to-undo actions. */
  tone?: 'primary' | 'danger';
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * One app-wide confirmation dialog (rendered by ConfirmDialog in the app shell).
 * Usage: `if (await confirm({ title, body, confirmLabel })) { ... }`.
 */
export const useConfirmStore = defineStore('confirm', () => {
  const current = ref<PendingConfirm | null>(null);

  function confirm(options: ConfirmOptions): Promise<boolean> {
    // A new request replaces an unanswered one, which counts as cancelled.
    current.value?.resolve(false);
    return new Promise((resolve) => {
      current.value = { ...options, resolve };
    });
  }

  function answer(confirmed: boolean): void {
    const pending = current.value;
    current.value = null;
    pending?.resolve(confirmed);
  }

  return { current, confirm, answer };
});
