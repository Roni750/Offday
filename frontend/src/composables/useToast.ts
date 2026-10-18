import { type ToastAction, useToastStore } from '@/stores/toasts';

/** Small façade over the toast store: `toast.success('Saved', 'Details…')`. */
export function useToast() {
  const store = useToastStore();
  return {
    success: (title: string, body?: string) => store.push({ kind: 'success', title, body }),
    error: (title: string, body?: string) => store.push({ kind: 'error', title, body }),
    info: (title: string, body?: string) => store.push({ kind: 'info', title, body }),
    live: (title: string, body?: string, action?: ToastAction) => store.push({ kind: 'live', title, body, action }),
    dismiss: store.dismiss,
  };
}
