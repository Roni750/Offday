import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
  /** `danger` for destructive or hard-to-undo actions. */
  tone?: 'primary' | 'danger';
  /** A second, alternative action shown between Cancel and the main one (see {@link choose}). */
  alternativeLabel?: string;
}

/** What the user picked: the main action, the alternative one, or neither (Cancel, Escape, backdrop). */
export type ConfirmChoice = 'confirm' | 'alternative' | null;

interface PendingConfirm extends ConfirmOptions {
  resolve: (choice: ConfirmChoice) => void;
}

/**
 * One app-wide confirmation dialog (rendered by ConfirmDialog in the app shell).
 * Usage: `if (await confirm({ title, body, confirmLabel })) { ... }`, or `choose()` for two actions.
 */
export const useConfirmStore = defineStore('confirm', () => {
  const current = ref<PendingConfirm | null>(null);

  function choose(options: ConfirmOptions): Promise<ConfirmChoice> {
    // A new request replaces an unanswered one, which counts as cancelled.
    current.value?.resolve(null);
    return new Promise((resolve) => {
      current.value = { ...options, resolve };
    });
  }

  async function confirm(options: ConfirmOptions): Promise<boolean> {
    return (await choose({ ...options, alternativeLabel: undefined })) === 'confirm';
  }

  function answer(choice: boolean | ConfirmChoice): void {
    const pending = current.value;
    current.value = null;
    pending?.resolve(choice === true ? 'confirm' : choice === false ? null : choice);
  }

  return { current, confirm, choose, answer };
});
