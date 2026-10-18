import type { DateTime } from 'luxon';
import type { OverlapConflict, Status, VacationRequest } from '@/api/types';
import { formatDayRange, lastDay, toZone } from './dates';

export const PAGE_SIZE = 6;
export const REASON_MAX = 240;
export const COMMENT_MAX = 500;

export const STATUS_TABS = ['All', 'Pending', 'Approved', 'Rejected'] as const;
export type StatusTab = (typeof STATUS_TABS)[number];

export function tabToStatus(tab: StatusTab): Status | undefined {
  return tab === 'All' ? undefined : tab;
}

interface Period {
  startDate: string;
  endDate: string;
}

/** A request's period in the office zone, plus the last calendar day it touches. */
export interface ZonedPeriod {
  start: DateTime;
  end: DateTime;
  first: DateTime;
  last: DateTime;
}

export function zonedPeriod(period: Period, zone: string): ZonedPeriod {
  const start = toZone(period.startDate, zone);
  const end = toZone(period.endDate, zone);
  return { start, end, first: start.startOf('day'), last: lastDay(start, end) };
}

/** "20–31 Jul" */
export function formatPeriod(period: Period, zone: string): string {
  const { first, last } = zonedPeriod(period, zone);
  return formatDayRange(first, last);
}

/** "Mon 09:00 → Fri 18:00 · 2026" */
export function formatPeriodTimes(period: Period, zone: string): string {
  const { start, end } = zonedPeriod(period, zone);
  return `${start.toFormat('ccc HH:mm')} → ${end.toFormat('ccc HH:mm')} · ${end.toFormat('yyyy')}`;
}

export function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}

/** "Omar B." */
export function shortName(name: string): string {
  const [first, ...rest] = name.split(' ');
  const lastInitial = rest.length ? ` ${rest[rest.length - 1]?.charAt(0)}.` : '';
  return `${first ?? name}${lastInitial}`;
}

/** Inline copy for an overlap, from the client check or the API's `details.conflict`. */
export function describeConflict(conflict: OverlapConflict | VacationRequest, zone: string): string {
  return `These dates overlap your ${conflict.status.toLowerCase()} request for ${formatPeriod(conflict, zone)}. Pick different dates.`;
}

export function reasonText(request: VacationRequest): string {
  return request.reason?.trim() || 'No reason given';
}
