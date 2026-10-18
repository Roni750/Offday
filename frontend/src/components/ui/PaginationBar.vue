<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  page: number;
  pageSize: number;
  total: number;
}>();

const emit = defineEmits<{ 'update:page': [page: number] }>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));

const info = computed(() => {
  if (!props.total) return 'No results';
  const first = (props.page - 1) * props.pageSize + 1;
  const last = Math.min(props.page * props.pageSize, props.total);
  return `Showing ${first}–${last} of ${props.total}`;
});

/** Page numbers with `null` gaps once there are more than 7 pages. */
const pages = computed<(number | null)[]>(() => {
  const count = pageCount.value;
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const around = [props.page - 1, props.page, props.page + 1].filter((p) => p > 1 && p < count);
  const result: (number | null)[] = [1];
  if ((around[0] ?? count) > 2) result.push(null);
  result.push(...around);
  if ((around[around.length - 1] ?? 1) < count - 1) result.push(null);
  result.push(count);
  return result;
});

function go(page: number): void {
  if (page >= 1 && page <= pageCount.value && page !== props.page) emit('update:page', page);
}
</script>

<template>
  <nav class="flex flex-wrap items-center justify-between gap-3 px-5 py-3" aria-label="Pagination">
    <span class="text-[13px] text-ink-3">{{ info }}</span>
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="h-8 cursor-pointer rounded-lg border border-line-input bg-surface px-2.5 text-[13px] text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line-input"
        :disabled="page <= 1"
        @click="go(page - 1)"
      >
        Prev
      </button>
      <template v-for="(p, index) in pages" :key="p ?? `gap-${index}`">
        <span v-if="p === null" class="w-6 text-center font-mono text-[12px] text-muted">…</span>
        <button
          v-else
          type="button"
          class="h-8 w-8 cursor-pointer rounded-lg border font-mono text-[12px]"
          :class="p === page ? 'border-ink bg-ink text-white' : 'border-line-input bg-surface text-ink hover:border-ink'"
          :aria-current="p === page ? 'page' : undefined"
          @click="go(p)"
        >
          {{ p }}
        </button>
      </template>
      <button
        type="button"
        class="h-8 cursor-pointer rounded-lg border border-line-input bg-surface px-2.5 text-[13px] text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line-input"
        :disabled="page >= pageCount"
        @click="go(page + 1)"
      >
        Next
      </button>
    </div>
  </nav>
</template>
