import { CommonEvent } from "commoneventframework/dist/types/commonEvent";
import { z } from "zod";
import { REVIEWER_ROLES } from "../domain/enums";
import { HOLIDAY_CALENDARS, HOLIDAY_CALENDAR_IDS, HolidayCalendarId, holidayCalendars } from "../holidays/holidayCalendars";
import { authenticate, getQuery, validate } from "../http/parse";
import { Authenticated, withActor } from "../http/withActor";
import { InputParserFn } from "./types";

const MAX_RANGE_DAYS = 400;
const dayNumber = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000;

// GET /holidays?from=2026-10-01&to=2026-10-31&calendars=jewish,muslim
const holidaysQuery = z.object({
	// Holidays are whole days, so the range is dates (inclusive), not moments.
	from: z.iso.date(),
	to: z.iso.date(),
	calendars: z.string().optional()
		.transform((value) => [...new Set((value ?? "").split(",").map((id) => id.trim()).filter(Boolean))])
		.pipe(z.array(z.enum(HOLIDAY_CALENDAR_IDS, { error: `Calendars must be among: ${HOLIDAY_CALENDAR_IDS.join(", ")}` }))),
})
	.refine((q) => typeof q.from !== "string" || typeof q.to !== "string" || q.to >= q.from, { path: ["to"], message: "'to' can't be before 'from'" })
	.refine((q) => typeof q.from !== "string" || typeof q.to !== "string" || dayNumber(q.to) - dayNumber(q.from) <= MAX_RANGE_DAYS,
		{ path: ["to"], message: `The range can't exceed ${MAX_RANGE_DAYS} days` });

export const parseHolidays: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	...validate(holidaysQuery, getQuery(event)),
});

/** Religious holidays to show next to the team calendar (Validator, OfficeAdmin). */
export const listHolidays = withActor<Authenticated & { from: string; to: string; calendars: HolidayCalendarId[] }>(
	async ({ from, to, calendars }) => ({
		calendars: HOLIDAY_CALENDAR_IDS.map((id) => ({ id, label: HOLIDAY_CALENDARS[id].label })),
		...(await holidayCalendars.between(calendars, from, to)),
	}),
	REVIEWER_ROLES,
);
