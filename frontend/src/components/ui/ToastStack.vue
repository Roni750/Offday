<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { type Toast, type ToastKind, useToastStore } from '@/stores/toasts';

const store = useToastStore();
const { toasts } = storeToRefs(store);

const DOTS: Record<ToastKind, string> = {
  success: 'bg-approved-dot',
  error: 'bg-rejected-dot',
  info: 'bg-muted',
  live: 'bg-accent',
};

function runAction(toast: Toast): void {
  toast.action?.run();
  store.dismiss(toast.id);
}
</script>

<template>
  <div
    class="pointer-events-none fixed bottom-6 right-6 z-[60] flex w-[380px] max-w-[calc(100vw-32px)] flex-col gap-2.5 max-sm:bottom-4 max-sm:right-4"
    aria-live="polite"
  >
    <TransitionGroup
      enter-from-class="translate-y-2 opacity-0"
      enter-active-class="transition duration-200 ease-out"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :role="toast.kind === 'error' ? 'alert' : 'status'"
        class="pointer-events-auto flex items-start gap-3 rounded-[14px] border p-3.5 shadow-toast"
        :class="toast.kind === 'live' ? 'border-ink bg-ink' : 'border-line bg-surface'"
      >
        <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full" :class="DOTS[toast.kind]" />
        <div class="flex min-w-0 flex-1 flex-col gap-[3px]">
          <div class="flex items-center gap-2">
            <span
              v-if="toast.kind === 'live'"
              class="rounded-[5px] bg-accent px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink"
            >
              LIVE
            </span>
            <span class="text-[13px] font-semibold" :class="toast.kind === 'live' ? 'text-white' : 'text-ink'">
              {{ toast.title }}
            </span>
          </div>
          <span
            v-if="toast.body"
            class="text-[13px] leading-[1.4]"
            :class="toast.kind === 'live' ? 'text-faint' : 'text-ink-3'"
          >
            {{ toast.body }}
          </span>
          <button
            v-if="toast.action"
            type="button"
            class="mt-1.5 h-7 cursor-pointer self-start rounded-[7px] bg-accent px-2.5 text-[12px] font-semibold text-ink"
            @click="runAction(toast)"
          >
            {{ toast.action.label }}
          </button>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          class="h-6 w-6 shrink-0 cursor-pointer rounded-md text-[15px]"
          :class="toast.kind === 'live' ? 'text-faint hover:text-white' : 'text-ink-3 hover:text-ink'"
          @click="store.dismiss(toast.id)"
        >
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
