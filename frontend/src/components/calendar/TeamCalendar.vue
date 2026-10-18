<script setup lang="ts">
import { computed } from 'vue';
import type { DateTime } from 'luxon';
import type { Holiday, UserSummary, VacationRequest } from '@/api/types';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { eachDay, formatDays, isWorkDay, todayIn, touchesDay } from '@/utils/dates';
import { HOLIDAY_CALENDARS } from '@/utils/holidays';
import { formatPeriod, zonedPeriod } from '@/utils/requests';

const props = defineProps<{
  /** First day of the month shown, in the office zone. */
  month: DateTime;
  users: UserSummary[];
  /** Pending + Approved requests overlapping the month (rejected ones are ignored). */
  requests: VacationRequest[];
  meId: number | null;
  zone: string;
  /** Office working days (ISO weekdays); other days are shaded. */
  workDays: readonly number[];
  loading?: boolean;
  /** Religious holidays to mark (only the calendars the viewer picked). Omitted: no holiday row. */
  holidays?: Holiday[];
}>();

defineEmits<{ prev: []; next: []; today: [] }>();

interface Cell {
  key: string;
  weekend: boolean;
  today: boolean;
  status: 'Approved' | 'Pending' | null;
  roundStart: boolean;
  roundEnd: boolean;
  tip: string;
}

interface Row {
  user: UserSummary;
  isMe: boolean;
  daysOff: number;
  cells: Cell[];
}

const today = computed(() => todayIn(props.zone));
const days = computed(() => eachDay(props.month.startOf('month'), props.month.endOf('month').startOf('day')));

const header = computed(() =>
  days.value.map((day) => ({
    key: day.toISODate() ?? String(day.day),
    weekday: day.toFormat('ccccc'),
    number: day.day,
    weekend: !isWorkDay(day, props.workDays),
    today: day.hasSame(today.value, 'day'),
  })),
);

interface HolidaySpan {
  calendar: Holiday['calendar'];
  label: string;
  names: string[];
  /** Day indexes in the month, inclusive. */
  start: number;
  end: number;
  lane: number;
  tentative: boolean;
}

/** "Sukkot (Day 3)" and "Sukkot (Day 4)" are the same holiday; consecutive days of it become one bar. */
const baseName = (name: string): string => name.replace(/\s*\(Day \d+\).*$/, '');

/**
 * Holidays as bars across the month, packed into as few lanes as possible (overlapping holidays
 * of different calendars stack). Holiday dates are calendar dates, compared with the office-local day.
 */
const holidayLayout = computed(() => {
  const dates = days.value.map((day) => day.toISODate() ?? '');
  const spans: Omit<HolidaySpan, 'lane'>[] = [];
  const sorted = [...(props.holidays ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate));

  for (const holiday of sorted) {
    const start = dates.findIndex((date) => date >= holiday.startDate);
    // Dates are in order, so the days on or before the end are a prefix of the month.
    const end = dates.filter((date) => date <= holiday.endDate).length - 1;
    if (start === -1 || end < start) continue;
    const label = baseName(holiday.name);
    const previous = spans.find((s) => s.calendar === holiday.calendar && s.label === label && s.end + 1 >= start);
    if (previous) {
      previous.end = Math.max(previous.end, end);
      previous.names.push(holiday.name);
      previous.tentative ||= holiday.tentative;
    } else {
      spans.push({ calendar: holiday.calendar, label, names: [holiday.name], start, end, tentative: holiday.tentative });
    }
  }

  const laneEnds: number[] = [];
  const placed: HolidaySpan[] = spans
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .map((span) => {
      let lane = laneEnds.findIndex((laneEnd) => laneEnd < span.start);
      if (lane === -1) lane = laneEnds.push(span.end) - 1;
      else laneEnds[lane] = span.end;
      return { ...span, lane };
    });

  return {
    spans: placed,
    lanes: Math.max(1, laneEnds.length),
    /** The holiday that tints each day's column (the first one, when several fall on a day). */
    byDay: dates.map((_, i) => placed.find((s) => s.start <= i && s.end >= i) ?? null),
  };
});

function holidayTip(span: HolidaySpan): string {
  const names = [...new Set(span.names)];
  const first = days.value[span.start];
  const last = days.value[span.end];
  const when = span.start === span.end ? first.toFormat('ccc d LLL') : `${first.toFormat('d')}–${last.toFormat('d LLL')}`;
  return `${names.length > 2 ? span.label : names.join(', ')} · ${when} · ${HOLIDAY_CALENDARS[span.calendar].label}${span.tentative ? ' · date may change' : ''}`;
}

/** Holiday days are tinted down the whole column, over the weekend shading. */
function columnShade(index: number, weekend: boolean, weekendClass: string): string {
  const holiday = holidayLayout.value.byDay[index];
  if (holiday) return HOLIDAY_CALENDARS[holiday.calendar].column;
  return weekend ? weekendClass : '';
}

const rows = computed<Row[]>(() => {
  const ordered = [...props.users].sort((a, b) => Number(b.id === props.meId) - Number(a.id === props.meId));
  return ordered.map((user) => {
    const own = props.requests
      .filter((r) => r.user.id === user.id && r.status !== 'Rejected')
      .map((r) => ({ request: r, ...zonedPeriod(r, props.zone) }));
    const at = (day: DateTime) => own.find((p) => touchesDay(p.start, p.end, day)) ?? null;
    const covering = days.value.map(at);

    let daysOff = 0;
    const cells = days.value.map((day, i): Cell => {
      const hit = covering[i] ?? null;
      const weekend = !isWorkDay(day, props.workDays);
      if (hit && hit.request.status === 'Approved' && !weekend) {
        // A half day keeps its API weight; otherwise each covered weekday counts once.
        daysOff += hit.first.equals(hit.last) ? Math.min(1, hit.request.days) : 1;
      }
      const prev = i > 0 ? covering[i - 1] : hit && hit.first < day ? hit : null;
      const next = i < covering.length - 1 ? covering[i + 1] : hit && hit.last > day ? hit : null;
      return {
        key: day.toISODate() ?? String(i),
        weekend,
        today: day.hasSame(today.value, 'day'),
        status: hit ? (hit.request.status as 'Approved' | 'Pending') : null,
        roundStart: !!hit && prev !== hit,
        roundEnd: !!hit && next !== hit,
        tip: hit ? `${user.name} · ${formatPeriod(hit.request, props.zone)} · ${hit.request.status}` : '',
      };
    });
    return { user, isMe: user.id === props.meId, daysOff, cells };
  });
});

const totalOff = computed(() => rows.value.reduce((sum, row) => sum + row.daysOff, 0));

function barStyle(cell: Cell): Record<string, string> {
  return {
    borderRadius: `${cell.roundStart ? 6 : 0}px ${cell.roundEnd ? 6 : 0}px ${cell.roundEnd ? 6 : 0}px ${cell.roundStart ? 6 : 0}px`,
    margin: `0 ${cell.roundEnd ? 2 : 0}px 0 ${cell.roundStart ? 2 : 0}px`,
  };
}
</script>

<template>
  <section class="card overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line-divider px-5 py-3.5">
      <div class="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous month"
          class="h-8 w-8 cursor-pointer rounded-lg border border-line-input bg-surface text-ink hover:border-ink"
          @click="$emit('prev')"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Next month"
          class="h-8 w-8 cursor-pointer rounded-lg border border-line-input bg-surface text-ink hover:border-ink"
          @click="$emit('next')"
        >
          ›
        </button>
        <h2 class="ml-1.5 text-[16px] font-semibold tracking-[-0.01em]" aria-live="polite">
          {{ month.toFormat('LLLL yyyy') }}
        </h2>
        <button
          type="button"
          class="ml-1 h-7 cursor-pointer rounded-lg bg-canvas px-2.5 text-[12px] font-medium text-ink hover:bg-line-divider"
          @click="$emit('today')"
        >
          Today
        </button>
        <span v-if="loading" class="ml-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted border-r-transparent" />
      </div>
      <div class="flex flex-wrap items-center gap-4 text-[12px] text-ink-2">
        <span class="flex items-center gap-1.5"><span class="h-2 w-3.5 rounded-[3px] bg-ink" />Approved</span>
        <span class="flex items-center gap-1.5"><span class="h-2 w-3.5 rounded-[3px] bg-hatch-pending" />Pending</span>
        <span class="font-mono text-muted">{{ formatDays(totalOff) }} approved days this month</span>
      </div>
    </div>

    <div class="overflow-x-auto">
      <div class="min-w-[880px]" :class="{ 'opacity-60 transition-opacity': loading }">
        <div class="flex border-b border-line-divider bg-surface-subtle">
          <div class="eyebrow w-[200px] shrink-0 px-5 py-2.5 tracking-[0.05em]">Team · {{ users.length }}</div>
          <div class="flex flex-1">
            <div
              v-for="(day, i) in header"
              :key="day.key"
              class="flex flex-1 flex-col items-center gap-0.5 py-1.5"
              :class="columnShade(i, day.weekend, 'bg-weekend-head')"
            >
              <span class="text-[10px] text-muted">{{ day.weekday }}</span>
              <span
                class="flex h-[22px] w-[22px] items-center justify-center rounded-md font-mono text-[12px]"
                :class="day.today ? 'bg-ink text-white' : day.weekend ? 'text-faint' : 'text-ink'"
              >
                {{ day.number }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="holidays" class="flex border-b border-line-divider">
          <div class="eyebrow flex w-[200px] shrink-0 items-center px-5 tracking-[0.05em]">Holidays</div>
          <div class="relative flex-1">
            <div class="absolute inset-0 flex" aria-hidden="true">
              <div v-for="(day, i) in header" :key="day.key" class="flex-1" :class="columnShade(i, day.weekend, 'bg-weekend-cell')" />
            </div>
            <ul
              class="relative grid gap-y-1 py-1.5"
              :style="{
                gridTemplateColumns: `repeat(${header.length}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${holidayLayout.lanes}, 20px)`,
              }"
            >
              <li
                v-for="span in holidayLayout.spans"
                :key="`${span.calendar}-${span.start}-${span.label}`"
                class="mx-[2px] truncate rounded-[5px] px-1.5 text-[11px] font-medium leading-[20px]"
                :class="[HOLIDAY_CALENDARS[span.calendar].chip, span.tentative ? 'italic' : '']"
                :style="{ gridColumn: `${span.start + 1} / ${span.end + 2}`, gridRow: span.lane + 1 }"
                v-tooltip="holidayTip(span)"
              >
                <span class="sr-only">{{ holidayTip(span) }}</span>
                <span aria-hidden="true">{{ span.label }}</span>
              </li>
              <li
                v-if="!holidayLayout.spans.length"
                class="col-span-full self-center text-center text-[12px] text-muted"
              >
                No holidays this month
              </li>
            </ul>
          </div>
        </div>

        <div v-if="!loading && rows.length === 0" class="px-5 py-10 text-center text-muted">No teammates in this office yet.</div>

        <div
          v-for="row in rows"
          :key="row.user.id"
          class="flex border-b border-line-divider"
          :class="row.isMe ? 'bg-accent-row' : ''"
        >
          <div class="flex w-[200px] shrink-0 items-center gap-2.5 px-5 py-2.5">
            <UserAvatar :id="row.user.id" :name="row.user.name" :size="28" />
            <div class="flex min-w-0 flex-col">
              <span class="truncate text-[13px] font-medium">{{ row.user.name }}{{ row.isMe ? ' (you)' : '' }}</span>
              <span class="font-mono text-[11px] text-muted">{{ row.daysOff ? `${formatDays(row.daysOff)} days off` : '—' }}</span>
            </div>
          </div>
          <div class="flex flex-1">
            <div
              v-for="(cell, j) in row.cells"
              :key="cell.key"
              class="flex flex-1 items-center"
              :class="[columnShade(j, cell.weekend, 'bg-weekend-cell'), cell.today ? 'border-l-[1.5px] border-ink' : '']"
            >
              <div
                v-if="cell.status"
                v-tooltip="cell.tip"
                class="h-[22px] w-full"
                :class="cell.status === 'Approved' ? 'bg-ink' : 'bg-hatch-pending'"
                :style="barStyle(cell)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
