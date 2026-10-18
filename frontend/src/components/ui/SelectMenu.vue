<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import { usePopover } from '@/composables/usePopover';
import type { SelectOption } from './types';

/**
 * A dropdown in place of the native `<select>`, following the WAI-ARIA "select-only combobox" pattern:
 * focus stays on the button, arrow keys move the highlight, Enter / Space picks, Escape closes,
 * and typing letters jumps to the matching option.
 *
 * Two uses:
 * - a field: `v-model` holds the value and the button shows the chosen option;
 * - an action menu: pass `triggerLabel` (e.g. "Move to…"); the button always shows it and `select` fires.
 */
const props = withDefaults(
  defineProps<{
    options: SelectOption[];
    /** Accessible name, when no visible `<label for>` points at `id`. */
    label?: string;
    id?: string;
    placeholder?: string;
    /** Fixed button text for action menus; the current value is then not shown. */
    triggerLabel?: string;
    size?: 'sm' | 'md';
    disabled?: boolean;
    busy?: boolean;
    /** Minimum menu width in px (it's at least as wide as the button). */
    menuWidth?: number;
  }>(),
  { size: 'md', disabled: false, busy: false, menuWidth: 0, placeholder: 'Select…' },
);

const model = defineModel<string>();
const emit = defineEmits<{ select: [value: string] }>();

const listId = `select-list-${useId()}`;
const open = ref(false);
const activeIndex = ref(-1);
const button = ref<HTMLButtonElement | null>(null);
const list = ref<HTMLUListElement | null>(null);

const selected = computed(() => props.options.find((o) => o.value === model.value) ?? null);
const buttonText = computed(() => props.triggerLabel ?? selected.value?.label ?? props.placeholder);
const isPlaceholder = computed(() => !props.triggerLabel && !selected.value);

const { style } = usePopover(open, button, list, {
  width: () => Math.max(button.value?.offsetWidth ?? 0, props.menuWidth),
  maxHeight: 280,
  onOutside: () => (open.value = false),
});

const enabledIndexes = computed(() => props.options.flatMap((o, i) => (o.disabled ? [] : [i])));

async function show(at?: 'first' | 'last'): Promise<void> {
  if (props.disabled || props.busy) return;
  const current = props.options.findIndex((o) => o.value === model.value && !o.disabled);
  const enabled = enabledIndexes.value;
  activeIndex.value = at === 'last' ? (enabled.at(-1) ?? -1) : current >= 0 && !at ? current : (enabled[0] ?? -1);
  open.value = true;
  await scrollActive();
}

function close(refocus = true): void {
  open.value = false;
  if (refocus) button.value?.focus();
}

function choose(index: number): void {
  const option = props.options[index];
  if (!option || option.disabled) return;
  close();
  if (!props.triggerLabel) model.value = option.value;
  emit('select', option.value);
}

async function scrollActive(): Promise<void> {
  await nextTick();
  list.value?.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`)?.scrollIntoView({ block: 'nearest' });
}

function move(step: number): void {
  const enabled = enabledIndexes.value;
  if (!enabled.length) return;
  const at = enabled.indexOf(activeIndex.value);
  activeIndex.value = enabled[at === -1 ? 0 : (at + step + enabled.length) % enabled.length];
  void scrollActive();
}

// Typing letters jumps to the next option starting with them (like a native select).
let typed = '';
let typedTimer: ReturnType<typeof setTimeout> | undefined;
function typeahead(char: string): void {
  clearTimeout(typedTimer);
  typed += char.toLowerCase();
  typedTimer = setTimeout(() => (typed = ''), 600);
  const enabled = enabledIndexes.value;
  const start = Math.max(0, enabled.indexOf(activeIndex.value));
  const ordered = [...enabled.slice(start + (typed.length === 1 ? 1 : 0)), ...enabled.slice(0, start + 1)];
  const hit = ordered.find((i) => props.options[i].label.toLowerCase().startsWith(typed));
  if (hit === undefined) return;
  if (!open.value) {
    if (props.triggerLabel) return;
    model.value = props.options[hit].value;
    emit('select', props.options[hit].value);
    return;
  }
  activeIndex.value = hit;
  void scrollActive();
}

function onKeydown(event: KeyboardEvent): void {
  const { key } = event;
  // Keys handled here mustn't reach the drawer's dialog handler (e.g. Escape closing the whole drawer).
  const handled = () => {
    event.preventDefault();
    event.stopPropagation();
  };
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) {
      handled();
      void show(key === 'ArrowUp' ? 'last' : undefined);
    } else if (key.length === 1 && /\S/.test(key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      typeahead(key);
    }
    return;
  }
  switch (key) {
    case 'ArrowDown':
      handled();
      return move(1);
    case 'ArrowUp':
      handled();
      return move(-1);
    case 'Home':
      handled();
      activeIndex.value = enabledIndexes.value[0] ?? -1;
      return void scrollActive();
    case 'End':
      handled();
      activeIndex.value = enabledIndexes.value.at(-1) ?? -1;
      return void scrollActive();
    case 'Enter':
    case ' ':
      handled();
      return choose(activeIndex.value);
    case 'Escape':
      handled();
      return close();
    case 'Tab':
      return close(false);
    default:
      if (key.length === 1 && /\S/.test(key)) {
        handled();
        typeahead(key);
      }
  }
}

const sizeClass = computed(() => (props.size === 'sm' ? 'h-8 rounded-lg px-2.5 text-[13px]' : 'h-9 rounded-control px-3 text-[13px]'));

defineExpose({ focus: () => button.value?.focus() });
</script>

<template>
  <button
    :id="id"
    ref="button"
    type="button"
    role="combobox"
    aria-haspopup="listbox"
    :aria-expanded="open"
    :aria-controls="listId"
    :aria-activedescendant="open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined"
    :aria-label="label"
    :aria-busy="busy || undefined"
    :disabled="disabled"
    class="group inline-flex min-w-0 cursor-pointer items-center justify-between gap-2 border bg-surface text-left outline-none transition-colors focus-visible:border-ink disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-muted"
    :class="[sizeClass, open ? 'border-ink' : 'border-line-input hover:border-ink-3']"
    @click="open ? close() : show()"
    @keydown="onKeydown"
  >
    <span class="truncate" :class="isPlaceholder ? 'text-muted' : triggerLabel ? 'text-ink-2' : 'text-ink'">{{ buttonText }}</span>
    <span
      v-if="busy"
      class="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-muted border-r-transparent"
      aria-hidden="true"
    />
    <svg
      v-else
      class="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-disabled:opacity-50"
      :class="open ? 'rotate-180' : ''"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>

  <Teleport to="body">
    <ul
      v-show="open"
      :id="listId"
      ref="list"
      role="listbox"
      :aria-label="label"
      tabindex="-1"
      class="fixed z-[65] overflow-auto rounded-control border border-line bg-surface p-1 shadow-toast"
      :style="style"
    >
      <li
        v-for="(option, i) in options"
        :id="`${listId}-${i}`"
        :key="option.value"
        role="option"
        :data-index="i"
        :aria-selected="!triggerLabel && option.value === model"
        :aria-disabled="option.disabled || undefined"
        class="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-[7px] text-[13px]"
        :class="[
          option.disabled ? 'cursor-not-allowed text-faint' : 'text-ink',
          i === activeIndex && !option.disabled ? 'bg-canvas' : '',
        ]"
        @pointermove="!option.disabled && (activeIndex = i)"
        @pointerdown.prevent
        @click="choose(i)"
      >
        <svg
          class="h-3.5 w-3.5 shrink-0"
          :class="!triggerLabel && option.value === model ? 'text-ink' : 'invisible'"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
        <span v-if="option.hint" class="shrink-0 text-[12px] text-muted">{{ option.hint }}</span>
      </li>
    </ul>
  </Teleport>
</template>
