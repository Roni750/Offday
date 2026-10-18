<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { usePopover } from '@/composables/usePopover';
import { matchTimeSlot, parseTimeInput, timeSlots } from '@/utils/pickers';

/**
 * Time field: a text combobox you can type into ("1330", "13:30", "9") with a popover listbox of
 * 15-minute slots (WAI-ARIA combobox + listbox, focus stays in the input). The value is an `HH:mm`
 * string, the same format a native `<input type="time">` uses. Extra attributes land on the input.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    /** Accessible name of the field, e.g. "Start time". */
    label: string;
    id?: string;
    /** Slots before this `HH:mm` are dimmed (e.g. an end time on the start's day). Still selectable. */
    min?: string;
    invalid?: boolean;
    placeholder?: string;
  }>(),
  { placeholder: 'HH:MM' },
);

const model = defineModel<string>({ default: '' });
const emit = defineEmits<{ blur: []; change: []; input: [] }>();

const SLOTS = timeSlots();
const LIST_MAX_HEIGHT = 264;

const uid = useId();
const listId = `${uid}-list`;
const optionId = (index: number) => `${uid}-opt-${index}`;

const open = ref(false);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);
/** What the input shows; differs from the model only while the user is typing. */
const text = ref(model.value);
/** Whether `text` was typed (Enter then commits the text) rather than set by arrowing through the list. */
const typed = ref(false);
const activeIndex = ref(-1);

watch(model, (value) => {
  text.value = value;
  typed.value = false;
});

const { style } = usePopover(open, input, list, {
  width: () => Math.max(input.value?.offsetWidth ?? 0, 132),
  maxHeight: LIST_MAX_HEIGHT,
  onOutside: () => (open.value = false),
});

const dimmed = (slot: string) => !!props.min && slot < props.min;

function indexOf(slot: string | null | undefined): number {
  return slot ? SLOTS.indexOf(slot) : -1;
}

async function scrollToActive(center = false): Promise<void> {
  await nextTick();
  const el = list.value;
  const item = el?.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`);
  if (!el || !item) return;
  if (center) {
    el.scrollTop = item.offsetTop - el.clientHeight / 2 + item.offsetHeight / 2;
  } else if (item.offsetTop < el.scrollTop) {
    el.scrollTop = item.offsetTop - 4;
  } else if (item.offsetTop + item.offsetHeight > el.scrollTop + el.clientHeight) {
    el.scrollTop = item.offsetTop + item.offsetHeight - el.clientHeight + 4;
  }
}

function show(): void {
  if (open.value) return;
  // Start on the value, else the first slot from `min`, else the working-day default 09:00.
  const fallback = props.min && indexOf(props.min) !== -1 ? props.min : '09:00';
  const current = indexOf(matchTimeSlot(text.value) ?? model.value);
  activeIndex.value = current !== -1 ? current : Math.max(0, indexOf(fallback));
  open.value = true;
  // Twice: once the list is rendered, once the popover has been positioned and sized.
  void scrollToActive(true).then(() => requestAnimationFrame(() => void scrollToActive(true)));
}

function hide(): void {
  open.value = false;
}

/** The clock icon toggles the list without taking focus from the input. */
function toggleFromIcon(): void {
  if (open.value) return hide();
  input.value?.focus();
  show();
}

function commit(value: string): void {
  if (value !== model.value) {
    model.value = value;
    emit('change');
  }
  text.value = value;
  typed.value = false;
}

/** Applies what was typed, or puts the current value back when it isn't a quarter-hour time. */
function commitText(): void {
  const parsed = parseTimeInput(text.value);
  if (parsed) commit(parsed);
  else {
    text.value = model.value;
    typed.value = false;
  }
}

function choose(index: number): void {
  commit(SLOTS[index]);
  hide();
}

function onInput(event: Event): void {
  text.value = (event.target as HTMLInputElement).value;
  typed.value = true;
  const match = indexOf(matchTimeSlot(text.value));
  if (match !== -1) {
    activeIndex.value = match;
    if (open.value) void scrollToActive(true);
  }
}

function move(step: number | 'first' | 'last'): void {
  if (!open.value) return show();
  const last = SLOTS.length - 1;
  if (step === 'first') activeIndex.value = 0;
  else if (step === 'last') activeIndex.value = last;
  else activeIndex.value = Math.min(last, Math.max(0, (activeIndex.value === -1 ? 0 : activeIndex.value) + step));
  text.value = SLOTS[activeIndex.value];
  typed.value = false;
  void scrollToActive();
}

function onKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      if (event.altKey) show();
      else move(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      move(-1);
      break;
    case 'PageDown':
      if (!open.value) return;
      event.preventDefault();
      move(4);
      break;
    case 'PageUp':
      if (!open.value) return;
      event.preventDefault();
      move(-4);
      break;
    case 'Home':
    case 'End':
      // Only while the list is open; otherwise they move the caret in the text as usual.
      if (!open.value) return;
      event.preventDefault();
      move(event.key === 'Home' ? 'first' : 'last');
      break;
    case 'Enter':
      // Inside the drawer's <form>: never submit from here while choosing a time.
      if (!open.value && !typed.value) return;
      event.preventDefault();
      if (typed.value || activeIndex.value === -1) commitText();
      else commit(SLOTS[activeIndex.value]);
      hide();
      break;
    case 'Escape':
      if (!open.value && !typed.value) return; // Let the drawer close.
      // Stop here so the drawer (useDialog listens on document) stays open.
      event.preventDefault();
      event.stopPropagation();
      text.value = model.value;
      typed.value = false;
      hide();
      break;
    case 'Tab':
      if (open.value) hide();
      break;
  }
}

function onBlur(): void {
  if (typed.value) commitText();
  else text.value = model.value;
  hide();
  emit('blur');
}

const activeDescendant = computed(() => (open.value && activeIndex.value !== -1 ? optionId(activeIndex.value) : undefined));

defineExpose({
  focus: () => input.value?.focus(),
  el: input,
});
</script>

<template>
  <div class="relative min-w-0">
    <input
      :id="id"
      ref="input"
      :value="text"
      type="text"
      role="combobox"
      inputmode="numeric"
      autocomplete="off"
      spellcheck="false"
      maxlength="5"
      aria-autocomplete="list"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="activeDescendant"
      :aria-invalid="invalid || undefined"
      :placeholder="placeholder"
      class="field-input pr-9 font-mono placeholder:text-faint"
      :class="{ 'field-input-error': invalid }"
      v-bind="$attrs"
      @input="onInput"
      @keydown="onKeydown"
      @click="show"
      @blur="onBlur"
    />
    <button
      type="button"
      tabindex="-1"
      aria-hidden="true"
      class="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted hover:text-ink"
      @mousedown.prevent="toggleFromIcon"
    >
      <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5.75" stroke="currentColor" stroke-width="1.3" />
        <path d="M8 5v3.25l2 1.25" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <Teleport to="body">
      <ul
        v-show="open"
        :id="listId"
        ref="list"
        role="listbox"
        :aria-label="label"
        class="fixed z-[60] overflow-auto rounded-control border border-line bg-surface p-1 shadow-toast"
        :style="style"
        @mousedown.prevent
      >
        <li
          v-for="(slot, index) in SLOTS"
          :id="optionId(index)"
          :key="slot"
          role="option"
          :data-index="index"
          :aria-selected="slot === model"
          class="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-[7px] font-mono text-[13px]"
          :class="[
            index === activeIndex ? 'bg-canvas' : '',
            slot === model ? 'font-semibold text-ink' : dimmed(slot) ? 'text-faint' : slot.endsWith(':00') ? 'text-ink' : 'text-ink-2',
          ]"
          @click="choose(index)"
          @mousemove="activeIndex = index"
        >
          {{ slot }}
          <svg v-if="slot === model" class="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </li>
      </ul>
    </Teleport>
  </div>
</template>
