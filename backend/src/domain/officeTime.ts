import { DateTime, IANAZone, Interval } from "luxon";

/** How an office keeps time: its zone and the ISO weekdays it works (1 = Monday ... 7 = Sunday). */
export interface OfficeCalendar {
	timezone: string;
	workDays: readonly number[];
}

export const DEFAULT_WORK_DAYS: readonly number[] = [1, 2, 3, 4, 5];

/** Requests start and end on a quarter hour (matches the 15-minute step of the form's time inputs). */
export const TIME_STEP_MINUTES = 15;

/** Rule 4: the start must fall on an office-local date after today (today itself is not allowed). */
export const startsAfterOfficeToday = (start: Date, timezone: string, now = new Date()): boolean => {
	const startDay = DateTime.fromJSDate(start, { zone: timezone }).startOf("day");
	const today = DateTime.fromJSDate(now, { zone: timezone }).startOf("day");
	return startDay > today;
};

/**
 * On a 15-minute step. Checked on the UTC instant: every real UTC offset is a multiple of 15 minutes,
 * so a quarter hour in UTC is a quarter hour in every office zone.
 */
export const isOnTimeStep = (date: Date): boolean =>
	date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0 && date.getUTCMinutes() % TIME_STEP_MINUTES === 0;

export const isValidTimezone = (zone: string): boolean => IANAZone.isValidZone(zone);

/** The canonical spelling of a zone ("europe/paris" → "Europe/Paris"), as the runtime reports it. */
export const canonicalTimezone = (zone: string): string =>
	new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;

const HALF_DAY_MAX_HOURS = 6;

/**
 * Working days a request uses, in office time: the office's working dates it covers.
 * A request within a single working day that lasts under 6 hours counts as half a day.
 */
export const countWorkingDays = (start: Date, end: Date, calendar: OfficeCalendar): number => {
	const from = DateTime.fromJSDate(start, { zone: calendar.timezone });
	// The range is half-open, so a request ending exactly at midnight doesn't use the next day.
	const to = DateTime.fromJSDate(end, { zone: calendar.timezone }).minus({ milliseconds: 1 });
	const isWorkDay = (day: DateTime) => calendar.workDays.includes(day.weekday);

	if (from.hasSame(to, "day")) {
		if (!isWorkDay(from)) return 0;
		return Interval.fromDateTimes(from, to).length("hours") < HALF_DAY_MAX_HOURS ? 0.5 : 1;
	}

	let days = 0;
	for (let day = from.startOf("day"); day <= to; day = day.plus({ days: 1 })) {
		if (isWorkDay(day)) days++;
	}
	return days;
};
