<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import type { SearchOption } from './types';

const props = withDefaults(
  defineProps<{
    options: SearchOption[];
    label: string;
    placeholder?: string;
    /** Cap on rendered matches, to keep long lists snappy. */
    limit?: number;
  }>(),
  { placeholder: 'Search…', limit: 80 },
);

const model = defineModel<string>({ required: true });

const id = useId();
const query = ref('');
const open = ref(false);
const activeIndex = ref(0);
const list = ref<HTMLUListElement | null>(null);

const selected = computed(() => props.options.find((o) => o.value === model.value) ?? null);

const normalize = (text: string) => text.toLowerCase().replace(/[_/]/g, ' ');

const matches = computed(() => {
  const terms = normalize(query.value).split(/\s+/).filter(Boolean);
  const found = terms.length
    ? props.options.filter((o) => {
        const haystack = normalize(`${o.label} ${o.hint ?? ''}`);
        return terms.every((t) => haystack.includes(t));
      })
    : props.options;
  return found.slice(0, props.limit);
});

watch(query, () => (activeIndex.value = 0));

function show(): void {
  open.value = true;
  const index = matches.value.findIndex((o) => o.value === model.value);
  activeIndex.value = Math.max(0, index);
  void scrollActive();
}

function choose(option: SearchOption): void {
  model.value = option.value;
  query.value = '';
  open.value = false;
}

async function scrollActive(): Promise<void> {
  await nextTick();
  list.value?.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' });
}

function move(step: number): void {
  if (!open.value) return show();
  const count = matches.value.length;
  if (!count) return;
  activeIndex.value = (activeIndex.value + step + count) % count;
  void scrollActive();
}

function confirmActive(): void {
  const option = matches.value[activeIndex.value];
  if (open.value && option) choose(option);
}

function close(): void {
  open.value = false;
  query.value = '';
}
</script>

<template>
  <div class="relative">
    <input
      :id="`${id}-input`"
      v-model="query"
      type="text"
      role="combobox"
      autocomplete="off"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="`${id}-list`"
      :aria-activedescendant="open && matches.length ? `${id}-opt-${activeIndex}` : undefined"
      :placeholder="selected ? selected.label : placeholder"
      class="field-input pr-9"
      :class="{ 'placeholder:text-ink': !!selected && !open }"
      @focus="show"
      @click="show"
      @blur="close"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="confirmActive"
      @keydown.esc="close"
    />
    <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted" aria-hidden="true">▾</span>

    <ul
      v-show="open"
      :id="`${id}-list`"
      ref="list"
      role="listbox"
      class="absolute z-20 mt-1.5 max-h-72 w-full overflow-auto rounded-control border border-line bg-surface p-1 shadow-toast"
    >
      <li v-if="!matches.length" class="px-3 py-2.5 text-[13px] text-muted">No matches.</li>
      <li
        v-for="(option, index) in matches"
        :id="`${id}-opt-${index}`"
        :key="option.value"
        role="option"
        :data-index="index"
        :aria-selected="option.value === model"
        class="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-[13px]"
        :class="index === activeIndex ? 'bg-canvas' : ''"
        @mousedown.prevent="choose(option)"
        @mousemove="activeIndex = index"
      >
        <span class="truncate" :class="option.value === model ? 'font-semibold' : ''">{{ option.label }}</span>
        <span v-if="option.hint" class="shrink-0 font-mono text-[11px] text-muted">{{ option.hint }}</span>
      </li>
    </ul>
  </div>
</template>
