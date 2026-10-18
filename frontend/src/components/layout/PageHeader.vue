<script setup lang="ts">
import { useOfficeTime } from '@/composables/useOfficeTime';

defineProps<{ title: string }>();

const time = useOfficeTime();
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-4">
    <div class="flex flex-col gap-1.5">
      <p class="font-mono text-[12px] text-muted">
        {{ time.longToday() }} <span class="max-sm:hidden">· {{ time.zone.value }}</span>
      </p>
      <h1 class="text-[28px] font-semibold tracking-[-0.03em]">{{ title }}</h1>
    </div>
    <div class="flex flex-wrap items-center gap-2.5">
      <slot name="actions" />
    </div>
  </header>
</template>
