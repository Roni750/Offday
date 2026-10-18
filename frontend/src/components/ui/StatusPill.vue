<script setup lang="ts">
import type { Status } from '@/api/types';

defineProps<{ status: Status }>();

const TONES: Record<Status, { pill: string; dot: string }> = {
  Pending: { pill: 'bg-pending-bg text-pending-fg', dot: 'bg-pending-dot' },
  Approved: { pill: 'bg-approved-bg text-approved-fg', dot: 'bg-approved-dot' },
  Rejected: { pill: 'bg-rejected-bg text-rejected-fg', dot: 'bg-rejected-dot' },
};
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[9px] py-[3px] text-[12px] font-medium"
    :class="TONES[status].pill"
  >
    <span class="h-1.5 w-1.5 rounded-full" :class="TONES[status].dot" />
    {{ status }}
  </span>
</template>
