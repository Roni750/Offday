<script setup lang="ts">
import { computed } from 'vue';

type Variant = 'primary' | 'secondary' | 'reject' | 'danger' | 'subtle';
type Size = 'xs' | 'sm' | 'md' | 'lg';

const props = withDefaults(
  defineProps<{
    variant?: Variant;
    size?: Size;
    type?: 'button' | 'submit';
    disabled?: boolean;
    loading?: boolean;
    block?: boolean;
  }>(),
  { variant: 'secondary', size: 'md', type: 'button', disabled: false, loading: false, block: false },
);

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-hover',
  secondary: 'border border-line-input bg-surface text-ink hover:border-ink',
  reject: 'border border-line-input bg-surface text-ink hover:border-danger hover:text-danger',
  danger: 'bg-danger-solid text-white hover:bg-danger-solid-hover',
  subtle: 'bg-canvas text-ink hover:bg-line-divider',
};

const SIZES: Record<Size, string> = {
  xs: 'h-[30px] rounded-lg px-3 text-[12px]',
  sm: 'h-8 rounded-lg px-3 text-[13px]',
  md: 'h-10 rounded-control px-4 text-[14px]',
  lg: 'h-11 rounded-control px-4 text-[14px]',
};

const classes = computed(() => [VARIANTS[props.variant], SIZES[props.size], props.block ? 'w-full' : '']);
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    class="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
    :class="classes"
  >
    <span
      v-if="loading"
      class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
