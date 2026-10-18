import type { DateTime } from 'luxon';
import type { OverlapConflict, ParticipantConflict, Status, TripMember, VacationRequest } from '@/api/types';
import type { TooltipContent } from '@/directives/tooltip';
import { formatDayRange, lastDay, toZone } from './dates';

export const PAGE_SIZE = 6;
export const REASON_MAX = 240;
export const COMMENT_MAX = 500;
/** "Going with": up to 9 colleagues, so 10 people per trip (same limit as the API). */
export const MAX_COLLEAGUES = 9;

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

// ---- Trips (vacation with colleagues) ------------------------------------------

/** "Dana", "Dana and Tom", "Dana, Tom and Aya" */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The other people on the request's trip (everyone but `userId`), organizer first. */
export function tripMates(request: VacationRequest, userId: number | undefined): TripMember[] {
  return request.group?.members.filter((m) => m.userId !== userId) ?? [];
}

/** "With Dana, Tom" or "With Dana, Tom +2" (first names). */
export function withText(mates: readonly TripMember[], shown = 2): string {
  const names = mates.slice(0, shown).map((m) => firstName(m.name));
  const more = mates.length - names.length;
  return `With ${names.join(', ')}${more > 0 ? ` +${more}` : ''}`;
}

const STATUS_SWATCH: Record<Status, string> = {
  Pending: 'bg-pending-dot',
  Approved: 'bg-approved-dot',
  Rejected: 'bg-rejected-dot',
};

/** Tooltip listing everyone on the trip with their own status (each person is decided separately). */
export function tripTooltip(request: VacationRequest): TooltipContent {
  const group = request.group;
  if (!group) return null;
  return {
    title: tripLabel(request),
    rows: group.members.map((m) => ({ label: m.name, value: m.status, swatch: STATUS_SWATCH[m.status] })),
  };
}

/** "Trip of 3 · organized by Lina" */
export function tripLabel(request: VacationRequest): string {
  const group = request.group;
  if (!group) return '';
  const organizer = group.organizer ? ` · organized by ${firstName(group.organizer.name)}` : '';
  return `Trip of ${group.members.length}${organizer}`;
}

export function isTripOrganizer(request: VacationRequest, userId: number | undefined): boolean {
  return !!request.group && request.group.organizer?.id === userId;
}

/** A trip row someone else organized: its dates are set by them, so the member can only leave. */
export function isTripMember(request: VacationRequest, userId: number | undefined): boolean {
  return !!request.group && request.group.organizer?.id !== userId;
}

/** "Tom Becker already has approved time off 12–14 Oct, so they can't join these dates." */
export function describeBlockedColleagues(blocked: readonly ParticipantConflict[], zone: string): string {
  const first = blocked[0];
  if (!first) return '';
  if (blocked.length === 1) {
    return `${first.name} already has approved time off ${formatPeriod(first.conflict, zone)}, so they can’t join these dates.`;
  }
  const who = listNames(blocked.map((b) => `${b.name} (${formatPeriod(b.conflict, zone)})`));
  return `${who} already have approved time off then, so they can’t join these dates.`;
}

/**
 * The heads-up after submitting a trip with colleagues who already have pending plans then. The trip is created;
 * this only tells the requester those colleagues might already have plans.
 */
export function describePendingColleagues(warned: readonly ParticipantConflict[], zone: string): string {
  const first = warned[0];
  if (!first) return '';
  if (warned.length === 1) {
    return `${first.name} already has a pending request for ${formatPeriod(first.conflict, zone)}, so they might already have plans. This may affect their request for vacation with you.`;
  }
  const who = listNames(warned.map((w) => `${w.name} (${formatPeriod(w.conflict, zone)})`));
  return `${who} already have pending requests then, so they might already have plans. This may affect their requests for vacation with you.`;
}
