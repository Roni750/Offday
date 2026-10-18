<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import type { UserSummary } from '@/api/types';
import AppCheckbox from '@/components/ui/AppCheckbox.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';

/** A teammate's time off in the chosen period: Approved blocks them from the trip, Pending only warns. */
export interface ColleagueHint {
  status: 'Approved' | 'Pending';
  /** "12–14 Oct" */
  range: string;
}

/**
 * "Going with": a searchable checklist of office teammates. Native checkboxes (AppCheckbox) keep Tab and Space;
 * Arrow Up/Down move between rows, and Enter in the search box toggles the only match.
 */
const props = withDefaults(
  defineProps<{
    teammates: UserSummary[];
    max: number;
    /** userId → their overlapping time off in the period being picked. */
    hints?: ReadonlyMap<number, ColleagueHint>;
    invalid?: boolean;
    describedby?: string;
  }>(),
  { hints: () => new Map(), invalid: false, describedby: undefined },
);

const model = defineModel<number[]>({ required: true });

const id = useId();
const query = ref('');
const search = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const selected = computed(() => new Set(model.value));
const full = computed(() => model.value.length >= props.max);
const byId = computed(() => new Map(props.teammates.map((u) => [u.id, u])));
const chosen = computed(() => model.value.flatMap((userId) => byId.value.get(userId) ?? []));

const matches = computed(() => {
  const terms = query.value.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return props.teammates;
  return props.teammates.filter((u) => {
    const haystack = `${u.name} ${u.email}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
});

function toggle(userId: number, on: boolean): void {
  if (on && !selected.value.has(userId) && !full.value) model.value = [...model.value, userId];
  if (!on) model.value = model.value.filter((v) => v !== userId);
}

function remove(user: UserSummary): void {
  toggle(user.id, false);
  search.value?.focus();
}

function onSearchEnter(): void {
  const only = matches.value.length === 1 ? matches.value[0] : undefined;
  if (only) toggle(only.id, !selected.value.has(only.id));
}

function boxes(): HTMLInputElement[] {
  return [...(list.value?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:not([disabled])') ?? [])];
}

/** Arrow keys move between rows; from the search box, Down enters the list. */
function move(step: number, event: KeyboardEvent): void {
  const items = boxes();
  if (!items.length) return;
  event.preventDefault();
  const index = items.indexOf(document.activeElement as HTMLInputElement);
  if (index === -1) {
    if (step > 0) items[0]?.focus();
    return;
  }
  const next = index + step;
  if (next < 0) search.value?.focus();
  else items[Math.min(next, items.length - 1)]?.focus();
}

defineExpose({ focus: () => search.value?.focus() });

const hintClass = (hint: ColleagueHint) => (hint.status === 'Approved' ? 'text-danger' : 'text-pending-warn');
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="chosen.length" class="flex flex-wrap gap-1.5" :aria-label="`Going with ${chosen.length}`" role="list">
      <span
        v-for="user in chosen"
        :key="user.id"
        role="listitem"
        class="inline-flex items-center gap-1.5 rounded-full border py-[3px] pl-1 pr-1.5 text-[12px] font-medium"
        :class="hints.get(user.id)?.status === 'Approved' ? 'border-danger-border bg-danger-tint' : 'border-line bg-surface-subtle'"
      >
        <UserAvatar :id="user.id" :name="user.name" :size="18" />
        {{ user.name }}
        <button
          type="button"
          class="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-[13px] leading-none text-ink-3 hover:bg-line-divider hover:text-ink"
          :aria-label="`Remove ${user.name}`"
          @click="remove(user)"
        >
          ×
        </button>
      </span>
    </div>

    <input
      :id="`${id}-search`"
      ref="search"
      v-model="query"
      type="search"
      autocomplete="off"
      placeholder="Search teammates…"
      aria-label="Search teammates"
      :aria-controls="`${id}-list`"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedby"
      class="field-input"
      :class="{ 'field-input-error': invalid }"
      @keydown.down="move(1, $event)"
      @keydown.enter.prevent="onSearchEnter"
    />

    <div
      :id="`${id}-list`"
      ref="list"
      role="group"
      aria-label="Teammates"
      class="max-h-[208px] overflow-auto rounded-control border border-line p-1"
      @keydown.down="move(1, $event)"
      @keydown.up="move(-1, $event)"
    >
      <p v-if="!teammates.length" class="px-3 py-2.5 text-[13px] text-muted">No teammates in your office yet.</p>
      <p v-else-if="!matches.length" class="px-3 py-2.5 text-[13px] text-muted">No teammates match “{{ query }}”.</p>
      <div
        v-for="user in matches"
        :key="user.id"
        class="rounded-lg px-2.5 py-[7px] hover:bg-surface-hover"
        v-tooltip="full && !selected.has(user.id) ? `You can go with up to ${max} colleagues` : null"
      >
        <AppCheckbox
          class="w-full"
          :model-value="selected.has(user.id)"
          :disabled="full && !selected.has(user.id)"
          @update:model-value="(on: boolean) => toggle(user.id, on)"
        >
          <span class="flex min-w-0 flex-1 items-center justify-between gap-3">
            <span class="truncate text-ink">{{ user.name }}</span>
            <span
              v-if="hints.get(user.id)"
              class="shrink-0 font-mono text-[11px]"
              :class="hintClass(hints.get(user.id)!)"
            >
              {{ hints.get(user.id)!.status }} {{ hints.get(user.id)!.range }}
            </span>
          </span>
        </AppCheckbox>
      </div>
    </div>
  </div>
</template>
