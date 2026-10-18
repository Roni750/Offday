<script setup lang="ts">
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import AppButton from '@/components/ui/AppButton.vue';
import { useDialog } from '@/composables/useDialog';
import { useConfirmStore } from '@/stores/confirm';

const store = useConfirmStore();
const { current } = storeToRefs(store);
const isOpen = computed(() => current.value !== null);
const panel = ref<HTMLElement | null>(null);
const cancelButton = ref<InstanceType<typeof AppButton> | null>(null);

// Focus starts on Cancel, so pressing Enter by reflex doesn't confirm a destructive action.
useDialog(isOpen, panel, {
  onClose: () => store.answer(false),
  initialFocus: () => (cancelButton.value?.$el as HTMLElement | undefined) ?? null,
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-100"
      leave-to-class="opacity-0"
    >
      <div v-if="current" class="fixed inset-0 z-[60] flex items-center justify-center p-6">
        <div class="absolute inset-0 bg-modal-overlay" aria-hidden="true" @click="store.answer(false)" />
        <div
          ref="panel"
          class="relative flex w-[420px] max-w-full flex-col gap-4 rounded-modal bg-surface p-6 shadow-modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-body"
        >
          <h2 id="confirm-title" class="text-[18px] font-semibold tracking-[-0.02em]">{{ current.title }}</h2>
          <p id="confirm-body" class="text-[14px] leading-[1.5] text-ink-2">{{ current.body }}</p>
          <div class="flex justify-end gap-2.5">
            <AppButton ref="cancelButton" @click="store.answer(false)">Cancel</AppButton>
            <AppButton :variant="current.tone === 'danger' ? 'danger' : 'primary'" @click="store.answer(true)">
              {{ current.confirmLabel }}
            </AppButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
