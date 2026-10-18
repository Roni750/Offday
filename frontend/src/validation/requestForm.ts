import { z } from 'zod';
import { DateTime } from 'luxon';
import type { VacationRequest } from '@/api/types';
import { estimateWorkingDays, formatDay, officeInputToDateTime, periodsOverlap, toOffsetIso } from '@/utils/dates';
import { MAX_COLLEAGUES, REASON_MAX, describeBlockedColleagues, describeConflict, zonedPeriod } from '@/utils/requests';

/**
 * Client-side rules for the request form. They mirror the API's rules (docs/api-contract.md) so an
 * invalid form never reaches the server; the API still enforces everything, since the client can be bypassed.
 */

/** Same limit as the API: a single request can't span more than a year. */
const MAX_REQUEST_DAYS = 366;

export interface RequestFormValues {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  reason: string;
  /** "Going with": colleagues of the office (a trip). Empty for a request alone. */
  colleagueIds: number[];
}

export type RequestFormField = keyof RequestFormValues;
export type RequestFormErrors = Partial<Record<RequestFormField, string>>;

export interface RequestFormContext {
  /** Office time zone; inputs are interpreted in it. */
  zone: string;
  /** Office working days (ISO weekdays); a request must include at least one. */
  workDays: readonly number[];
  /** Start of today in the office zone. */
  today: DateTime;
  /** The user's own Pending/Approved requests, for the overlap check. */
  ownRequests: readonly VacationRequest[];
  /** The request being edited, excluded from the overlap check. */
  editingId?: number;
  /** Teammates' Pending/Approved requests, for the colleague checks. Omitted: no colleague check. */
  teamRequests?: readonly VacationRequest[];
  /** The trip being edited: its own rows don't count as its members' overlaps. */
  editingGroupId?: number;
}

export interface RequestFormOutput {
  start: DateTime;
  end: DateTime;
  /** API payload: ISO strings with the office offset. */
  payload: { startDate: string; endDate: string; reason: string | null; colleagueIds: number[] };
}

/** A teammate's request that overlaps the period: Approved blocks them from the trip, Pending only warns. */
export interface ColleagueOverlap {
  userId: number;
  name: string;
  request: VacationRequest;
}

/**
 * Each colleague's overlapping time off in `[start, end)`, mirroring the API: the first Approved overlap blocks them;
 * otherwise the first Pending one is a warning. Rejected requests and rows of `excludeGroupId` never count.
 * Results follow the order of `colleagueIds`.
 */
export function findColleagueOverlaps(
  teamRequests: readonly VacationRequest[],
  colleagueIds: readonly number[],
  start: DateTime,
  end: DateTime,
  zone: string,
  excludeGroupId?: number,
): { blocked: ColleagueOverlap[]; warned: ColleagueOverlap[] } {
  const blocked: ColleagueOverlap[] = [];
  const warned: ColleagueOverlap[] = [];
  for (const userId of colleagueIds) {
    const overlapping = teamRequests
      .filter((r) => {
        if (r.user.id !== userId || r.status === 'Rejected') return false;
        if (excludeGroupId !== undefined && r.group?.id === excludeGroupId) return false;
        const p = zonedPeriod(r, zone);
        return periodsOverlap(start, end, p.start, p.end);
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    const approved = overlapping.find((r) => r.status === 'Approved');
    const pending = overlapping.find((r) => r.status === 'Pending');
    if (approved) blocked.push({ userId, name: approved.user.name, request: approved });
    else if (pending) warned.push({ userId, name: pending.user.name, request: pending });
  }
  return { blocked, warned };
}

/** Required "yyyy-MM-dd" that is a real calendar date (e.g. not 31 Nov). Later checks don't run if this fails. */
const requiredDate = (message: string, invalid: string) =>
  z
    .string()
    .trim()
    .min(1, { message, abort: true })
    .refine((value) => DateTime.fromFormat(value, 'yyyy-MM-dd').isValid, { message: invalid, abort: true });
/** Required "HH:mm" on a quarter hour, matching the 15-minute step the API enforces. */
const requiredTime = (message: string) =>
  z
    .string()
    .trim()
    .min(1, { message, abort: true })
    .regex(/^\d{2}:\d{2}$/, { message: 'Enter a valid time', abort: true })
    .refine((value) => Number(value.slice(3)) % 15 === 0, 'Use a quarter hour (:00, :15, :30 or :45)');

export function buildRequestFormSchema(ctx: RequestFormContext) {
  const earliestStart = ctx.today.plus({ days: 1 });

  return z
    .object({
      // Rule 4: the start must be on a date after today, in office time. Checked per field so the
      // message shows as soon as the date is picked, before the end is filled in.
      startDate: requiredDate('Pick a start date', 'Enter a valid start date').refine(
        (date) => DateTime.fromISO(date, { zone: ctx.zone }).startOf('day') >= earliestStart,
        `Requests must start after today. The earliest start is ${formatDay(earliestStart)}.`,
      ),
      startTime: requiredTime('Pick a start time'),
      endDate: requiredDate('Pick an end date', 'Enter a valid end date'),
      endTime: requiredTime('Pick an end time'),
      reason: z.string().trim().max(REASON_MAX, `Keep the reason to ${REASON_MAX} characters or fewer`),
      // Same limits as the API: at most 9 colleagues (10 people), each once.
      colleagueIds: z
        .array(z.number())
        .max(MAX_COLLEAGUES, `You can go with up to ${MAX_COLLEAGUES} colleagues`)
        .refine((ids) => new Set(ids).size === ids.length, 'Each colleague can only be added once')
        .default([]),
    })
    .transform((values, refine) => {
      const start = officeInputToDateTime(values.startDate, values.startTime, ctx.zone);
      const end = officeInputToDateTime(values.endDate, values.endTime, ctx.zone);
      if (!start) refine.addIssue({ code: 'custom', path: ['startDate'], message: 'Enter a valid start date' });
      if (!end) refine.addIssue({ code: 'custom', path: ['endDate'], message: 'Enter a valid end date' });
      if (!start || !end) return z.NEVER;

      // Rule 1: end after start, including the time (same-day partial requests are fine).
      if (end <= start) {
        const sameDay = start.hasSame(end, 'day');
        refine.addIssue({
          code: 'custom',
          path: [sameDay ? 'endTime' : 'endDate'],
          message: sameDay ? 'End time must be after the start time' : 'End date must be on or after the start date',
        });
        return z.NEVER;
      }

      if (end.diff(start, 'days').days > MAX_REQUEST_DAYS) {
        refine.addIssue({ code: 'custom', path: ['endDate'], message: 'A request can’t be longer than a year' });
      }

      // A request must use at least one of the office's working days.
      if (estimateWorkingDays(start, end, ctx.workDays) === 0) {
        refine.addIssue({ code: 'custom', path: ['endDate'], message: 'These dates don’t include any working day in your office' });
      }

      // Rule 2: no overlap with the user's own Pending/Approved requests (trip rows included). Touching ends are allowed.
      // Reported on the end date, the field that usually completes the period.
      const clash = ctx.ownRequests.find((r) => {
        if (r.id === ctx.editingId || r.status === 'Rejected') return false;
        const p = zonedPeriod(r, ctx.zone);
        return periodsOverlap(start, end, p.start, p.end);
      });
      if (clash) refine.addIssue({ code: 'custom', path: ['endDate'], message: describeConflict(clash, ctx.zone) });

      // Trips: a colleague's Approved time off blocks them; Pending only warns (shown by the form, not an error).
      if (ctx.teamRequests && values.colleagueIds.length) {
        const { blocked } = findColleagueOverlaps(ctx.teamRequests, values.colleagueIds, start, end, ctx.zone, ctx.editingGroupId);
        if (blocked.length) {
          refine.addIssue({
            code: 'custom',
            path: ['colleagueIds'],
            message: describeBlockedColleagues(
              blocked.map((b) => ({ userId: b.userId, name: b.name, conflict: b.request })),
              ctx.zone,
            ),
          });
        }
      }

      return {
        start,
        end,
        payload: {
          startDate: toOffsetIso(start),
          endDate: toOffsetIso(end),
          reason: values.reason || null,
          colleagueIds: values.colleagueIds,
        },
      } satisfies RequestFormOutput;
    });
}

/** First message per field, in schema order. */
export function toFieldErrors(error: z.ZodError): RequestFormErrors {
  const errors: RequestFormErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as RequestFormField | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
