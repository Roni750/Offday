<script setup lang="ts">
import { computed } from 'vue';
import { DateTime } from 'luxon';
import type { MonthlyStat } from '@/api/types';
import { formatDays } from '@/utils/dates';

const props = defineProps<{
  data: MonthlyStat[];
  /** `"2026-10"`, highlighted. */
  currentMonth: string;
  loading?: boolean;
}>();

const LEGEND = [
  { label: 'Approved', class: 'bg-chart-approved' },
  { label: 'Pending', class: 'bg-chart-pending' },
  { label: 'Rejected', class: 'bg-chart-rejected' },
] as const;

/** Every month is zero (or there's no data): show a message instead of empty bars. */
const isEmpty = computed(() => !props.data.some((m) => m.approved + m.pending + m.rejected > 0));

const bars = computed(() => {
  const totals = props.data.map((m) => m.approved + m.pending + m.rejected);
  // Leave 10% headroom above the tallest bar for its label.
  const max = Math.max(...totals, 1) * 1.1;
  return props.data.map((m, i) => ({
    key: m.month,
    label: DateTime.fromFormat(m.month, 'yyyy-MM').toFormat('LLL'),
    total: totals[i] ?? 0,
    current: m.month === props.currentMonth,
    segments: [
      { key: 'rejected', value: m.rejected, class: 'bg-chart-rejected' },
      { key: 'pending', value: m.pending, class: 'bg-chart-pending' },
      { key: 'approved', value: m.approved, class: 'bg-chart-approved' },
    ]
      .filter((s) => s.value > 0)
      .map((s) => ({ ...s, height: `${(s.value / max) * 100}%` })),
    tooltip: {
      title: DateTime.fromFormat(m.month, 'yyyy-MM').toFormat('LLLL yyyy'),
      rows: [
        { label: 'Approved', value: `${formatDays(m.approved)}d`, swatch: 'bg-chart-approved' },
        { label: 'Pending', value: `${formatDays(m.pending)}d`, swatch: 'bg-chart-pending' },
        { label: 'Rejected', value: `${formatDays(m.rejected)}d`, swatch: 'bg-chart-rejected' },
      ],
    },
  }));
});
</script>

<template>
  <section class="card flex min-w-0 flex-[2_1_420px] flex-col gap-5 p-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h2 class="text-[16px] font-semibold tracking-[-0.01em]">Requested days by month</h2>
        <p class="text-[13px] text-ink-3">Working days, grouped by start date</p>
      </div>
      <div class="flex gap-3.5 text-[12px] text-ink-2">
        <span v-for="item in LEGEND" :key="item.label" class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-[2px]" :class="item.class" />{{ item.label }}
        </span>
      </div>
    </div>

    <div v-if="loading && !data.length" class="h-[220px] animate-pulse rounded-lg bg-canvas" />
    <div v-else-if="isEmpty" class="flex h-[220px] items-center justify-center text-muted">No requested days in these months.</div>
    <div v-else class="flex h-[220px] items-stretch gap-3.5" role="img" aria-label="Requested working days per month">
      <div v-for="bar in bars" :key="bar.key" class="flex min-w-0 flex-1 flex-col gap-2" v-tooltip="bar.tooltip">
        <div class="text-center font-mono text-[12px] text-ink-2">{{ formatDays(bar.total) }}</div>
        <div
          class="flex flex-1 flex-col justify-end overflow-hidden rounded-lg"
          :class="bar.current ? 'bg-accent-tint' : 'bg-chart-track'"
        >
          <div v-for="segment in bar.segments" :key="segment.key" :class="segment.class" :style="{ height: segment.height }" />
        </div>
        <div class="text-center font-mono text-[12px]" :class="bar.current ? 'text-ink' : 'text-muted'">{{ bar.label }}</div>
      </div>
    </div>
  </section>
</template>
