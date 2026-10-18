<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import type { DateTime } from 'luxon';
import { usePopover } from '@/composables/usePopover';
import { DEFAULT_WORK_DAYS, todayIn } from '@/utils/dates';
import {
  formatPickerDate,
  monthGrid,
  moveFocusDate,
  parseDateValue,
  rangePosition,
  toDateValue,
  weekStartFor,
  weekdayOrder,
} from '@/utils/pickers';
import { WEEKDAYS } from '@/utils/workWeek';

/**
 * Date field with a popover calendar, following the WAI-ARIA "date picker dialog" pattern.
 * The value is a `yyyy-MM-dd` string, the same format a native `<input type="date">` uses.
 * Extra attributes (aria-describedby, …) land on the trigger button.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    /** Accessible name of the field, e.g. "Start date". */
    label: string;
    id?: string;
    /** Earliest selectable date (`yyyy-MM-dd`); earlier days are disabled. */
    min?: string;
    /** Office working days (ISO weekdays); the others are shown muted but stay selectable. */
    workDays?: readonly number[];
    /** IANA zone that decides which day is "today". */
    zone?: string;
    /** Ends of a period to highlight, e.g. the request's start and end dates. */
    rangeStart?: string;
    rangeEnd?: string;
    invalid?: boolean;
    placeholder?: string;
  }>(),
  { workDays: () => DEFAULT_WORK_DAYS, zone: 'UTC', placeholder: 'Select a date' },
);

const model = defineModel<string>({ default: '' });
const emit = defineEmits<{ blur: []; change: []; input: [] }>();

const uid = useId();
const dialogId = `${uid}-dialog`;
const headingId = `${uid}-heading`;

const open = ref(false);
const trigger = ref<HTMLButtonElement | null>(null);
const popover = ref<HTMLElement | null>(null);
const grid = ref<HTMLElement | null>(null);

const today = computed(() => toDateValue(todayIn(props.zone)));
const weekStart = computed(() => weekStartFor(props.workDays));
const columns = computed(() => weekdayOrder(weekStart.value).map((d) => WEEKDAYS[d - 1]));
const display = computed(() => formatPickerDate(model.value));

/** The day that holds the roving tab stop; its month is the one shown. */
const focusDate = ref<DateTime>(parseDateValue(today.value)!);
const month = computed(() => focusDate.value.startOf('month'));
const weeks = computed(() => monthGrid(month.value, weekStart.value));
const minMonth = computed(() => parseDateValue(props.min)?.startOf('month') ?? null);
const canGoBack = computed(() => !minMonth.value || month.value > minMonth.value);

const { style } = usePopover(open, trigger, popover, { width: () => 304, onOutside: closeFromOutside });

/** A press outside closes the calendar without moving focus; if focus was in it, the field has blurred. */
function closeFromOutside(): void {
  const hadFocus = !!popover.value?.contains(document.activeElement);
  open.value = false;
  if (hadFocus) emit('blur');
}

interface Cell {
  value: string;
  day: number;
  outside: boolean;
  disabled: boolean;
  offDay: boolean;
  today: boolean;
  selected: boolean;
  range: ReturnType<typeof rangePosition>;
  label: string;
}

const cells = computed<Cell[][]>(() =>
  weeks.value.map((week) =>
    week.map((d) => {
      const value = toDateValue(d);
      const offDay = !props.workDays.includes(d.weekday);
      const disabled = !!props.min && value < props.min;
      const isToday = value === today.value;
      const notes = [isToday && 'today', offDay && 'non-working day', disabled && 'unavailable'].filter(Boolean);
      return {
        value,
        day: d.day,
        outside: d.month !== month.value.month,
        disabled,
        offDay,
        today: isToday,
        selected: value === model.value,
        range: rangePosition(value, props.rangeStart, props.rangeEnd),
        label: [d.toFormat('cccc d LLLL yyyy'), ...notes].join(', '),
      };
    }),
  ),
);

function initialFocusDate(): DateTime {
  const selected = parseDateValue(model.value);
  if (selected) return selected;
  const min = parseDateValue(props.min);
  const now = parseDateValue(today.value)!;
  return min && min > now ? min : now;
}

async function focusActiveDay(): Promise<void> {
  await nextTick();
  grid.value?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
}

function show(): void {
  focusDate.value = initialFocusDate();
  open.value = true;
  void focusActiveDay();
}

/** Closes the calendar; focus goes back to the trigger first, so the field never "blurs" on the way. */
function hide(returnFocus = true): void {
  if (returnFocus) trigger.value?.focus();
  open.value = false;
}

function toggle(): void {
  if (open.value) hide();
  else show();
}

function select(cell: Cell): void {
  if (cell.disabled) return;
  model.value = cell.value;
  emit('change');
  hide();
}

function shiftMonth(step: number): void {
  if (step < 0 && !canGoBack.value) return;
  focusDate.value = focusDate.value.plus({ months: step });
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || (event.altKey && event.key === 'ArrowDown')) {
    event.preventDefault();
    show();
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    event.stopPropagation();
    hide();
  }
}

function onPopoverKeydown(event: KeyboardEvent): void {
  // Handled here and stopped, so the drawer's own Escape / Tab handling (useDialog) never sees it.
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    hide();
    return;
  }
  if (event.key === 'Tab') {
    // Keep Tab inside the calendar (modal dialog): previous month, next month, the active day.
    event.preventDefault();
    event.stopPropagation();
    const items = [...(popover.value?.querySelectorAll<HTMLElement>('button:not([tabindex="-1"])') ?? [])];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
    items[next].focus();
    return;
  }
  const target = event.target as HTMLElement;
  if (!target.dataset.date) return;
  const next = moveFocusDate(focusDate.value, event.key, weekStart.value, event.shiftKey);
  if (!next) return;
  event.preventDefault();
  event.stopPropagation();
  focusDate.value = next;
  void focusActiveDay();
}

/** Reports a blur only once focus leaves both the trigger and the calendar. */
function onFocusOut(event: FocusEvent): void {
  const to = event.relatedTarget as Node | null;
  if (to && (trigger.value?.contains(to) || popover.value?.contains(to))) return;
  if (open.value && to) open.value = false;
  emit('blur');
}

function cellClasses(cell: Cell): string[] {
  const classes: string[] = [];
  if (cell.selected) classes.push('bg-ink text-white font-semibold');
  else if (cell.range === 'start' || cell.range === 'end' || cell.range === 'single') classes.push('bg-accent text-ink font-semibold');
  else if (cell.disabled) classes.push('cursor-not-allowed text-faint/70');
  else if (cell.outside) classes.push('text-faint hover:bg-canvas');
  else if (cell.offDay) classes.push(cell.range === 'inside' ? 'text-muted hover:bg-canvas' : 'bg-weekend-cell text-muted hover:bg-canvas');
  else classes.push('text-ink hover:bg-canvas');
  if (cell.today && !cell.selected) classes.push('ring-1 ring-inset ring-ink/40');
  return classes;
}

const monthLabel = computed(() => month.value.toFormat('LLLL yyyy'));

defineExpose({
  focus: () => trigger.value?.focus(),
  el: trigger,
});
</script>

<template>
  <div class="min-w-0">
    <button
      :id="id"
      ref="trigger"
      type="button"
      class="field-input flex cursor-pointer items-center justify-between gap-2 text-left"
      :class="{ 'field-input-error': invalid, 'border-ink bg-surface': open && !invalid }"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="open ? dialogId : undefined"
      :aria-label="`${label}, ${display || 'not set'}`"
      :aria-invalid="invalid || undefined"
      v-bind="$attrs"
      @click="toggle"
      @keydown="onTriggerKeydown"
      @focusout="onFocusOut"
    >
      <span class="truncate" :class="display ? 'text-ink' : 'text-faint'">{{ display || placeholder }}</span>
      <svg class="h-4 w-4 shrink-0 text-muted" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2" stroke="currentColor" stroke-width="1.3" />
        <path d="M2.5 6.5h11M5.5 1.75v3M10.5 1.75v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
      </svg>
    </button>

    <Teleport to="body">
      <Transition
        enter-from-class="opacity-0 -translate-y-1"
        enter-active-class="transition duration-100 ease-out"
        leave-active-class="transition duration-75 ease-in"
        leave-to-class="opacity-0"
      >
        <div
          v-if="open"
          :id="dialogId"
          ref="popover"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="headingId"
          class="fixed z-[60] overflow-auto rounded-[14px] border border-line bg-surface p-3 shadow-toast"
          :style="style"
          @keydown="onPopoverKeydown"
          @focusout="onFocusOut"
        >
          <div class="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-canvas aria-disabled:cursor-not-allowed aria-disabled:text-faint aria-disabled:hover:bg-transparent"
              aria-label="Previous month"
              :aria-disabled="!canGoBack || undefined"
              @click="shiftMonth(-1)"
            >
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <h2 :id="headingId" class="text-[14px] font-semibold tracking-[-0.01em]" aria-live="polite">{{ monthLabel }}</h2>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-canvas"
              aria-label="Next month"
              @click="shiftMonth(1)"
            >
              <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>

          <table ref="grid" role="grid" :aria-labelledby="headingId" class="w-full table-fixed border-collapse">
            <thead>
              <tr>
                <th
                  v-for="col in columns"
                  :key="col.day"
                  scope="col"
                  :abbr="col.long"
                  class="pb-1.5 font-mono text-[10px] font-normal uppercase tracking-[0.05em]"
                  :class="workDays.includes(col.day) ? 'text-muted' : 'text-faint'"
                >
                  {{ col.short.slice(0, 2) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(week, w) in cells" :key="w">
                <td
                  v-for="cell in week"
                  :key="cell.value"
                  :aria-selected="cell.selected"
                  class="p-0"
                  :class="{
                    'bg-accent-tint': cell.range === 'inside',
                    'bg-gradient-to-r from-transparent from-50% to-accent-tint to-50%': cell.range === 'start',
                    'bg-gradient-to-l from-transparent from-50% to-accent-tint to-50%': cell.range === 'end',
                  }"
                >
                  <button
                    type="button"
                    :data-date="cell.value"
                    :tabindex="cell.value === toDateValue(focusDate) ? 0 : -1"
                    :aria-label="cell.label"
                    :aria-disabled="cell.disabled || undefined"
                    :aria-current="cell.today ? 'date' : undefined"
                    class="mx-auto flex aspect-square w-full max-w-[38px] items-center justify-center rounded-lg font-mono text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1"
                    :class="cellClasses(cell)"
                    @click="select(cell)"
                  >
                    {{ cell.day }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="mt-2 flex items-center gap-3 border-t border-line-divider pt-2 text-[11px] text-muted">
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-[3px] ring-1 ring-inset ring-ink/40" />Today</span>
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-[3px] bg-weekend-cell ring-1 ring-inset ring-line" />Non-working</span>
            <span v-if="rangeStart && rangeEnd" class="flex items-center gap-1.5">
              <span class="h-2.5 w-2.5 rounded-[3px] bg-accent-tint" />Period
            </span>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
