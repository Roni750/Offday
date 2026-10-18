<script setup lang="ts" generic="T extends { id: number }">
import { computed } from 'vue';
import type { TableColumn } from './types';

const props = withDefaults(
  defineProps<{
    columns: TableColumn[];
    rows: T[];
    loading?: boolean;
    emptyText?: string;
    /** Below this width the table scrolls horizontally. */
    minWidth?: number;
    hideHeader?: boolean;
    dense?: boolean;
    skeletonRows?: number;
  }>(),
  { loading: false, emptyText: 'Nothing here yet.', minWidth: 820, hideHeader: false, dense: false, skeletonRows: 4 },
);

defineSlots<
  { [K in `cell-${string}`]?: (props: { row: T }) => unknown } & {
    /** Extra content under a row (e.g. a rejection comment). */
    below?: (props: { row: T }) => unknown;
    empty?: () => unknown;
  }
>();

const gridStyle = computed(() => ({ gridTemplateColumns: props.columns.map((c) => c.width).join(' ') }));
const showSkeleton = computed(() => props.loading && props.rows.length === 0);
</script>

<template>
  <div class="overflow-x-auto">
    <div :style="{ minWidth: `${minWidth}px` }" :aria-busy="loading || undefined">
      <div v-if="!hideHeader" role="row" class="table-head grid gap-4" :style="gridStyle">
        <span
          v-for="column in columns"
          :key="column.key"
          role="columnheader"
          :class="column.align === 'right' ? 'text-right' : ''"
        >
          {{ column.label }}
        </span>
      </div>

      <template v-if="showSkeleton">
        <div v-for="n in skeletonRows" :key="n" class="grid items-center gap-4 border-b border-line-divider px-5 py-4" :style="gridStyle">
          <span v-for="column in columns" :key="column.key" class="h-3.5 animate-pulse rounded bg-canvas" />
        </div>
      </template>

      <div v-else-if="rows.length === 0" class="px-5 py-10 text-center text-muted">
        <slot name="empty">{{ emptyText }}</slot>
      </div>

      <div v-else class="transition-opacity" :class="loading ? 'opacity-60' : ''">
        <div
          v-for="row in rows"
          :key="row.id"
          role="row"
          class="flex flex-col gap-2.5 border-b border-line-divider px-5 hover:bg-surface-hover"
          :class="dense ? 'py-3' : 'py-3.5'"
        >
          <div class="grid items-center gap-4" :style="gridStyle">
            <div
              v-for="column in columns"
              :key="column.key"
              role="cell"
              class="min-w-0"
              :class="column.align === 'right' ? 'flex justify-end' : ''"
            >
              <slot :name="`cell-${column.key}`" :row="row" />
            </div>
          </div>
          <slot name="below" :row="row" />
        </div>
      </div>
    </div>
  </div>
</template>
