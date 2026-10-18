import { DateTime } from 'luxon';
import { DATE_FORMAT } from '@/utils/dates';

/**
 * Pure logic behind the DatePicker and TimePicker components, kept free of the DOM so it is unit-tested.
 * Calendar dates are handled as `yyyy-MM-dd` strings and, for arithmetic, as UTC DateTimes: a calendar
 * grid has no time of day, and UTC has no DST gaps to trip over. "Today" comes from the office zone.
 */

// ---- Dates ------------------------------------------------------------------

/** Parses a `yyyy-MM-dd` value into a UTC start-of-day DateTime, or null when empty/invalid. */
export function parseDateValue(value: string | null | undefined): DateTime | null {
  if (!value) return null;
  const dt = DateTime.fromFormat(value, DATE_FORMAT, { zone: 'utc' });
  return dt.isValid ? dt : null;
}

export function toDateValue(day: DateTime): string {
  return day.toFormat(DATE_FORMAT);
}

/** "Tue 3 Nov 2026" */
export function formatPickerDate(value: string | null | undefined): string {
  return parseDateValue(value)?.toFormat('ccc d LLL yyyy') ?? '';
}

/**
 * First column of the calendar: the first day of the office's working run (Sunday for a Sun–Thu week,
 * Monday for Mon–Fri), so the working days sit together. Falls back to Monday.
 */
export function weekStartFor(workDays: readonly number[]): number {
  if (!workDays.length || workDays.length === 7) return 1;
  for (let day = 1; day <= 7; day++) {
    const previous = day === 1 ? 7 : day - 1;
    if (workDays.includes(day) && !workDays.includes(previous)) return day;
  }
  return 1;
}

/** The first column's day of the week containing `day`. */
export function startOfWeek(day: DateTime, weekStart: number): DateTime {
  const offset = (day.weekday - weekStart + 7) % 7;
  return day.minus({ days: offset }).startOf('day');
}

/** ISO weekdays in column order, e.g. [7, 1, 2, 3, 4, 5, 6] for a Sunday start. */
export function weekdayOrder(weekStart: number): number[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStart - 1 + i) % 7) + 1);
}

/** Six full weeks covering `month` (always six rows, so the popover keeps its height between months). */
export function monthGrid(month: DateTime, weekStart: number): DateTime[][] {
  const first = startOfWeek(month.startOf('month'), weekStart);
  return Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, d) => first.plus({ days: week * 7 + d })));
}

/** The date a grid key moves focus to (WAI-ARIA date picker dialog), or null for other keys. */
export function moveFocusDate(day: DateTime, key: string, weekStart: number, shiftKey = false): DateTime | null {
  switch (key) {
    case 'ArrowLeft':
      return day.minus({ days: 1 });
    case 'ArrowRight':
      return day.plus({ days: 1 });
    case 'ArrowUp':
      return day.minus({ weeks: 1 });
    case 'ArrowDown':
      return day.plus({ weeks: 1 });
    case 'PageUp':
      return shiftKey ? day.minus({ years: 1 }) : day.minus({ months: 1 });
    case 'PageDown':
      return shiftKey ? day.plus({ years: 1 }) : day.plus({ months: 1 });
    case 'Home':
      return startOfWeek(day, weekStart);
    case 'End':
      return startOfWeek(day, weekStart).plus({ days: 6 });
    default:
      return null;
  }
}

/** Where a range sits relative to `day`; `from`/`to` may be in either order or missing. */
export function rangePosition(
  day: string,
  from: string | null | undefined,
  to: string | null | undefined,
): 'start' | 'end' | 'single' | 'inside' | null {
  if (!from || !to) return null;
  const [a, b] = from <= to ? [from, to] : [to, from];
  if (day === a && day === b) return 'single';
  if (day === a) return 'start';
  if (day === b) return 'end';
  return day > a && day < b ? 'inside' : null;
}

// ---- Times ------------------------------------------------------------------

export const TIME_STEP_MINUTES = 15;

/** "00:00", "00:15", … "23:45". */
export function timeSlots(step = TIME_STEP_MINUTES): string[] {
  return Array.from({ length: (24 * 60) / step }, (_, i) => formatMinutes(i * step));
}

function formatMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Typed time → `HH:mm` on a quarter hour, or null when it isn't one.
 * Accepts "13:30", "1330", "930", "9:30", "13.30", "13h30", "9" (→ 09:00).
 */
export function parseTimeInput(text: string, step = TIME_STEP_MINUTES): string | null {
  const raw = text.trim().replace(/\s+/g, '');
  let hours: number;
  let minutes: number;
  const separated = /^(\d{1,2})[:.h](\d{2})$/i.exec(raw);
  if (separated) {
    hours = Number(separated[1]);
    minutes = Number(separated[2]);
  } else if (/^\d{1,4}$/.test(raw)) {
    if (raw.length <= 2) {
      hours = Number(raw);
      minutes = 0;
    } else {
      hours = Number(raw.slice(0, -2));
      minutes = Number(raw.slice(-2));
    }
  } else {
    return null;
  }
  if (hours > 23 || minutes > 59 || minutes % step !== 0) return null;
  return formatMinutes(hours * 60 + minutes);
}

/**
 * The slot to highlight while the user is still typing: an exact match, or the top of the hour
 * typed so far ("13" or "13:" → 13:00). Null when nothing fits.
 */
export function matchTimeSlot(text: string, step = TIME_STEP_MINUTES): string | null {
  const exact = parseTimeInput(text, step);
  if (exact) return exact;
  const hour = /^(\d{1,2})[:.h]?\d?$/i.exec(text.trim());
  if (!hour) return null;
  const h = Number(hour[1]);
  return h <= 23 ? formatMinutes(h * 60) : null;
}

// ---- Popover placement ------------------------------------------------------

export interface Rect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface Placement {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  side: 'below' | 'above';
}

/**
 * Places a fixed-position popover next to its trigger inside the viewport: below by default,
 * above when it only fits there, never wider than the viewport minus `margin` on each side.
 */
export function placePopover(
  trigger: Rect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 6,
  margin = 8,
): Placement {
  const width = Math.max(0, Math.min(size.width, viewport.width - margin * 2));
  const left = Math.min(Math.max(trigger.left, margin), Math.max(margin, viewport.width - margin - width));
  const spaceBelow = viewport.height - trigger.bottom - gap - margin;
  const spaceAbove = trigger.top - gap - margin;
  const above = size.height > spaceBelow && spaceAbove > spaceBelow;
  const maxHeight = Math.max(0, above ? spaceAbove : spaceBelow);
  const height = Math.min(size.height, maxHeight);
  return {
    top: above ? trigger.top - gap - height : trigger.bottom + gap,
    left,
    width,
    maxHeight,
    side: above ? 'above' : 'below',
  };
}
