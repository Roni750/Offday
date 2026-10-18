import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { VacationRequest } from '@/api/types';

interface OpenOptions {
  /** Edit this Pending request instead of creating a new one. */
  edit?: VacationRequest;
  /** Pre-filled reason ("New dates" on a rejected request). */
  reason?: string;
}

/** UI state of the request drawer, which any page can open. */
export const useRequestDrawerStore = defineStore('requestDrawer', () => {
  const isOpen = ref(false);
  const editing = ref<VacationRequest | null>(null);
  const prefillReason = ref('');

  function open(options: OpenOptions = {}): void {
    editing.value = options.edit ?? null;
    prefillReason.value = options.edit?.reason ?? options.reason ?? '';
    isOpen.value = true;
  }

  function close(): void {
    isOpen.value = false;
  }

  return { isOpen, editing, prefillReason, open, close };
});
