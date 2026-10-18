<script setup lang="ts">
import { computed } from 'vue';
import type { VacationRequest } from '@/api/types';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useOfficeTime } from '@/composables/useOfficeTime';
import { daysUntil, formatDays } from '@/utils/dates';

const props = withDefaults(
  defineProps<{
    /** Approved requests; the component keeps those within `horizonDays`. */
    requests: VacationRequest[];
    horizonDays?: number;
    loading?: boolean;
  }>(),
  { horizonDays: 21, loading: false },
);

const time = useOfficeTime();

const items = computed(() => {
  const now = time.now();
  const today = time.today();
  const horizon = today.plus({ days: props.horizonDays });
  return props.requests
    .filter((r) => r.status === 'Approved')
    .map((r) => ({ request: r, period: time.period(r) }))
    .filter(({ period }) => period.end > now && period.start < horizon)
    .sort((a, b) => a.period.start.toMillis() - b.period.start.toMillis())
    .map(({ request, period }) => {
      const out = period.start <= now;
      return { request, out, when: out ? 'Out now' : `In ${daysUntil(period.start, today)}d` };
    });
});
</script>

<template>
  <section class="card flex min-w-0 flex-[1_1_280px] flex-col gap-3.5 p-5">
    <div class="flex flex-col gap-1">
      <h2 class="text-[16px] font-semibold tracking-[-0.01em]">Upcoming absences</h2>
      <p class="text-[13px] text-ink-3">Approved, next 3 weeks</p>
    </div>
    <div class="flex flex-col">
      <template v-if="loading && !items.length">
        <div v-for="n in 3" :key="n" class="flex items-center gap-3 border-t border-line-divider py-2.5">
          <span class="h-8 w-8 animate-pulse rounded-full bg-canvas" />
          <span class="h-3.5 flex-1 animate-pulse rounded bg-canvas" />
        </div>
      </template>
      <p v-else-if="!items.length" class="border-t border-line-divider py-6 text-center text-muted">Nobody is out soon.</p>
      <div
        v-for="item in items"
        :key="item.request.id"
        class="flex items-center gap-3 border-t border-line-divider py-2.5"
      >
        <UserAvatar :id="item.request.user.id" :name="item.request.user.name" />
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-[13px] font-medium">{{ item.request.user.name }}</span>
          <span class="font-mono text-[12px] text-muted">
            {{ time.range(item.request) }} · {{ formatDays(item.request.days) }}d
          </span>
        </div>
        <span
          class="whitespace-nowrap rounded-md px-2 py-[3px] text-[12px] font-medium text-ink"
          :class="item.out ? 'bg-accent' : 'bg-canvas'"
        >
          {{ item.when }}
        </span>
      </div>
    </div>
  </section>
</template>
