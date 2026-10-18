import { DateTime } from "luxon";

/**
 * Human-readable periods for API messages, in the office zone, matching the web app's wording
 * ("12–14 Oct", "28 Dec – 1 Jan"). Ranges are half-open: an end at exactly midnight belongs to the day before.
 */

const lastDay = (start: DateTime, end: DateTime): DateTime => {
	const endDay = end.startOf("day");
	return end.equals(endDay) && end > start ? endDay.minus({ days: 1 }) : endDay;
};

const days = (start: Date, end: Date, timezone: string) => {
	const s = DateTime.fromJSDate(start, { zone: timezone });
	const e = DateTime.fromJSDate(end, { zone: timezone });
	return { first: s.startOf("day"), last: lastDay(s, e) };
};

/** "12–14 Oct", "12 Oct", "28 Dec – 1 Jan" */
export const formatDayRange = (start: Date, end: Date, timezone: string): string => {
	const { first, last } = days(start, end, timezone);
	if (first.hasSame(last, "day")) return first.toFormat("d LLL");
	if (first.hasSame(last, "month")) return `${first.toFormat("d")}–${last.toFormat("d LLL")}`;
	return `${first.toFormat("d LLL")} – ${last.toFormat("d LLL")}`;
};

/** "from 10 Oct to 20 Oct 2026", or "on 10 Oct 2026" for a single day. */
export const formatSpan = (start: Date, end: Date, timezone: string): string => {
	const { first, last } = days(start, end, timezone);
	if (first.hasSame(last, "day")) return `on ${first.toFormat("d LLL yyyy")}`;
	const from = first.hasSame(last, "year") ? first.toFormat("d LLL") : first.toFormat("d LLL yyyy");
	return `from ${from} to ${last.toFormat("d LLL yyyy")}`;
};

/** "Dana", "Dana and Tom", "Dana, Tom and Aya" */
export const listNames = (names: readonly string[]): string =>
	names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
