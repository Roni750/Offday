<script setup lang="ts">
withDefaults(
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
    <div v-if="loading" class="h-10 w-20 animate-pulse rounded-lg" :class="tone === 'accent' ? 'bg-ink/10' : 'bg-canvas'" />
    <slot v-else name="value">
      <span v-if="value !== null" class="font-semibold" :class="VALUE_SIZES[size]">{{ value }}</span>
    </slot>
    <slot>
      <span v-if="hint" class="text-[12px]" :class="tone === 'accent' ? 'text-ink' : 'text-ink-3'">{{ hint }}</span>
    </slot>
  </section>
</template>
