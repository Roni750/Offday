<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    label: string;
    value?: string | number | null;
    hint?: string;
    /** `accent` is the lime hero card. */
    tone?: 'default' | 'accent';
    size?: 'md' | 'lg' | 'xl';
    loading?: boolean;
  }>(),
  { value: null, hint: '', tone: 'default', size: 'lg', loading: false },
);

const VALUE_SIZES = {
  md: 'text-[28px] tracking-[-0.03em]',
  lg: 'text-[40px] leading-none tracking-[-0.04em]',
  xl: 'text-[48px] leading-none tracking-[-0.04em]',
} as const;

// Skeleton heights match the rendered value, so the card doesn't jump when data arrives.
const SKELETON_SIZES = {
  md: 'h-[42px] w-24',
  lg: 'h-10 w-20',
  xl: 'h-12 w-24',
} as const;

// Read through `props`, where withDefaults guarantees `size` is set; the bare template binding is typed optional.
const valueClass = computed(() => VALUE_SIZES[props.size]);
const skeletonClass = computed(() => SKELETON_SIZES[props.size]);
</script>

<template>
  <section
    class="flex min-w-0 flex-col gap-2.5 rounded-card px-5 py-[18px]"
    :class="tone === 'accent' ? 'bg-accent text-ink' : 'border border-line bg-surface'"
  >
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-[13px] font-medium" :class="tone === 'accent' ? 'text-ink' : 'text-ink-2'">{{ label }}</h3>
      <slot name="aside" />
    </div>
    <!-- While loading, the hint is hidden too: it's usually built from the same data ("Across 0 team members"). -->
    <template v-if="loading">
      <div class="animate-pulse rounded-lg" :class="[skeletonClass,tone === 'accent' ? 'bg-ink/10' : 'bg-canvas']" />
      <div class="h-3 w-32 animate-pulse rounded" :class="tone === 'accent' ? 'bg-ink/10' : 'bg-canvas'" />
    </template>
    <template v-else>
      <slot name="value">
        <span v-if="value !== null" class="font-semibold" :class="valueClass">{{ value }}</span>
      </slot>
      <slot>
        <span v-if="hint" class="text-[12px]" :class="tone === 'accent' ? 'text-ink' : 'text-ink-3'">{{ hint }}</span>
      </slot>
    </template>
  </section>
</template>
