import { DateTime, Interval } from 'luxon';

/**
 * Every date in the UI is shown and entered in the **office** time zone
 * (`me.office.timezone`), never the browser's. All helpers here take the zone
 * explicitly so they stay pure and easy to test.
 */

export const DATE_FORMAT = 'yyyy-MM-dd';
export const TIME_FORMAT = 'HH:mm';

/** Parses an API timestamp (UTC) into the office zone. */
export function toZone(iso: string, zone: string): DateTime {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone);
}

export function nowIn(zone: string): DateTime {
  return DateTime.now().setZone(zone);
}

export function todayIn(zone: string): DateTime {
  return nowIn(zone).startOf('day');
}

/**
 * Converts a date + time picked in the form, interpreted in the office zone,
 * into an ISO string with that zone's offset (e.g. `2026-11-03T09:00:00+02:00`).
 */
export function officeInputToDateTime(date: string, time: string, zone: string): DateTime | null {
  if (!date || !time) return null;
  const dt = DateTime.fromISO(`${date}T${time}`, { zone });
  return dt.isValid ? dt : null;
}

export function toOffsetIso(dt: DateTime): string {
  return dt.toISO({ suppressMilliseconds: true }) ?? '';
}

/** UTC ISO string for query parameters (avoids `+` in URLs). */
export function toUtcIso(dt: DateTime): string {
  return dt.toUTC().toISO({ suppressMilliseconds: true }) ?? '';
}

/**
 * The last calendar day a period touches. An end at exactly midnight belongs
 * to the previous day (e.g. `Fri 09:00 → Sat 00:00` ends on Friday).
 */
export function lastDay(start: DateTime, end: DateTime): DateTime {
  const endDay = end.startOf('day');
  return end.equals(endDay) && end > start ? endDay.minus({ days: 1 }) : endDay;
}

/** Monday to Friday, used until the office's own week is known. */
export const DEFAULT_WORK_DAYS: readonly number[] = [1, 2, 3, 4, 5];

/** Whether the office works on this day (`workDays` are ISO weekdays, 1 = Monday ... 7 = Sunday). */
export function isWorkDay(day: DateTime, workDays: readonly number[]): boolean {
  return workDays.includes(day.weekday);
}

/** "18 Oct" */
export function formatDay(dt: DateTime): string {
  return dt.toFormat('d LLL');
}

/** "18 Oct 2026" */
export function formatDayYear(dt: DateTime): string {
  return dt.toFormat('d LLL yyyy');
}

/** "Sunday, 18 October 2026" */
export function formatLongDate(dt: DateTime): string {
  return dt.toFormat('cccc, d LLLL yyyy');
}

/** "20–31 Jul", "18 Oct", "28 Dec – 1 Jan" (calendar days, already in the office zone). */
export function formatDayRange(first: DateTime, last: DateTime): string {
  if (first.hasSame(last, 'day')) return formatDay(first);
  if (first.hasSame(last, 'month')) return `${first.toFormat('d')}–${last.toFormat('d LLL')}`;
  return `${formatDay(first)} – ${formatDay(last)}`;
}

/** "UTC+03:00" */
export function formatOffset(zone: string, at: DateTime = DateTime.now()): string {
  const dt = at.setZone(zone);
  return dt.isValid ? `UTC${dt.toFormat('ZZ')}` : '';
}

export function daysUntil(day: DateTime, today: DateTime): number {
  return Math.round(day.startOf('day').diff(today.startOf('day'), 'days').days);
}

/** Calendar days `[first, last]` as start-of-day DateTimes. */
export function eachDay(first: DateTime, last: DateTime): DateTime[] {
  const days: DateTime[] = [];
  for (let d = first.startOf('day'); d <= last; d = d.plus({ days: 1 })) days.push(d);
  return days;
}

/** Whether `[start, end)` touches the calendar day `day` (start of day, office zone). */
export function touchesDay(start: DateTime, end: DateTime, day: DateTime): boolean {
  return start < day.plus({ days: 1 }) && end > day;
}

/** Strict overlap of two periods; touching ends (13:00 / 13:00) don't overlap. */
export function periodsOverlap(aStart: DateTime, aEnd: DateTime, bStart: DateTime, bEnd: DateTime): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Preview of the server's day count, used only in the form before the request exists:
 * the office's working dates covered; a single working day under 6h counts as 0.5.
 * Saved requests always display the API's `days`.
 */
export function estimateWorkingDays(start: DateTime, end: DateTime, workDays: readonly number[]): number {
  const last = lastDay(start, end);
  const first = start.startOf('day');
  if (first.equals(last)) {
    if (!isWorkDay(first, workDays)) return 0;
    return Interval.fromDateTimes(start, end).length('hours') < 6 ? 0.5 : 1;
  }
  return eachDay(first, last).filter((d) => isWorkDay(d, workDays)).length;
}

/** "1 day", "0.5 days", "3 working days": the count with a correctly pluralized unit. */
export function formatDayCount(days: number, unit = 'day'): string {
  return `${formatDays(days)} ${days === 1 ? unit : `${unit}s`}`;
}

/** "1", "0.5", "12" */
export function formatDays(days: number): string {
  return Number.isInteger(days) ? String(days) : days.toFixed(1).replace(/\.0$/, '');
}
