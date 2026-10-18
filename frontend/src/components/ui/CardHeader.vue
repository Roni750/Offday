<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line-divider px-5 py-4">
    <div class="flex min-w-0 flex-col gap-1">
      <h2 class="text-[16px] font-semibold tracking-[-0.01em]">{{ title }}</h2>
      <p v-if="subtitle" class="text-[13px] text-ink-3">{{ subtitle }}</p>
    </div>
    <slot />
  </div>
</template>
