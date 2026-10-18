<script setup lang="ts" generic="T extends string">
import type { SegmentedOption } from './types';

defineProps<{
  options: SegmentedOption<T>[];
  label: string;
}>();

const model = defineModel<T>({ required: true });
</script>

<template>
  <div role="tablist" :aria-label="label" class="flex max-w-full gap-0.5 overflow-x-auto rounded-control bg-canvas p-[3px]">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="tab"
      :aria-selected="model === option.value"
      class="flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors"
      :class="model === option.value ? 'bg-surface text-ink shadow-tab' : 'text-ink-3 hover:text-ink'"
      @click="model = option.value"
    >
      {{ option.label }}
      <span v-if="option.count !== undefined && option.count !== null" class="font-mono text-[11px] text-muted">
        {{ option.count }}
      </span>
    </button>
  </div>
</template>
