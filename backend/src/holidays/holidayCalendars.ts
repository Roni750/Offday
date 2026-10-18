import { IcsEvent, parseIcsEvents } from "./ics";

/**
 * Religious holidays come from Google Calendar's public holiday calendars (the ones Google Calendar
 * offers under "Holidays"). They're maintained by Google, cover several years ahead, and all share one
 * iCalendar format, so every religion is read the same way. Islamic dates depend on moon sightings;
 * the feed marks those as tentative.
 */
export const HOLIDAY_CALENDARS = {
	jewish: { label: "Jewish holidays", googleId: "en.judaism#holiday@group.v.calendar.google.com" },
	christian: { label: "Christian holidays", googleId: "en.christian#holiday@group.v.calendar.google.com" },
	muslim: { label: "Muslim holidays", googleId: "en.islamic#holiday@group.v.calendar.google.com" },
	hindu: { label: "Hindu holidays", googleId: "en.hinduism#holiday@group.v.calendar.google.com" },
} as const;

export type HolidayCalendarId = keyof typeof HOLIDAY_CALENDARS;
export const HOLIDAY_CALENDAR_IDS = Object.keys(HOLIDAY_CALENDARS) as HolidayCalendarId[];

export interface Holiday {
	calendar: HolidayCalendarId;
	name: string;
	startDate: string;   // "2026-10-03", inclusive
	endDate: string;     // inclusive
	tentative: boolean;
}

// Feeds change a few times a year. A warm Lambda container or the dev server reuses them for this long.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

const feedUrl = (id: HolidayCalendarId): string =>
	`https://calendar.google.com/calendar/ical/${encodeURIComponent(HOLIDAY_CALENDARS[id].googleId)}/public/basic.ics`;

const toHoliday = (calendar: HolidayCalendarId, event: IcsEvent): Holiday => ({
	calendar,
	name: event.summary,
	startDate: event.start,
	endDate: event.end,
	tentative: /tentative/i.test(event.description ?? ""),
});

/** Downloads one feed. Swappable in tests, so they don't depend on the network. */
export type FeedFetcher = (url: string) => Promise<string>;

const fetchFeed: FeedFetcher = async (url) => {
	const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	if (!res.ok) throw new Error(`Holiday feed answered ${res.status}`);
	return res.text();
};

export class HolidayCalendarSource {
	// The in-flight promise is cached too, so concurrent requests share one download.
	private readonly cache = new Map<HolidayCalendarId, { loadedAt: number; holidays: Promise<Holiday[]> }>();

	constructor(private readonly fetcher: FeedFetcher = fetchFeed, private readonly now: () => number = Date.now) {}

	private load(id: HolidayCalendarId): Promise<Holiday[]> {
		const cached = this.cache.get(id);
		if (cached && this.now() - cached.loadedAt < CACHE_TTL_MS) return cached.holidays;

		const holidays = this.fetcher(feedUrl(id)).then((text) => parseIcsEvents(text).map((event) => toHoliday(id, event)));
		this.cache.set(id, { loadedAt: this.now(), holidays });
		// A failed download isn't cached; the next request tries again.
		holidays.catch(() => {
			if (this.cache.get(id)?.holidays === holidays) this.cache.delete(id);
		});
		return holidays;
	}

	/**
	 * Holidays of the given calendars touching `[from, to]` (inclusive dates, "2026-10-01"), sorted by date.
	 * A feed that can't be reached doesn't fail the others; it's listed in `unavailable`.
	 */
	async between(calendars: HolidayCalendarId[], from: string, to: string): Promise<{ holidays: Holiday[]; unavailable: HolidayCalendarId[] }> {
		const results = await Promise.allSettled(calendars.map((id) => this.load(id)));
		const holidays: Holiday[] = [];
		const unavailable: HolidayCalendarId[] = [];

		results.forEach((result, i) => {
			if (result.status === "rejected") {
				console.error(`[holidays] ${calendars[i]} feed unavailable`, result.reason);
				unavailable.push(calendars[i]);
				return;
			}
			holidays.push(...result.value.filter((h) => h.startDate <= to && h.endDate >= from));
		});

		holidays.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.calendar.localeCompare(b.calendar) || a.name.localeCompare(b.name));
		return { holidays, unavailable };
	}
}

export const holidayCalendars = new HolidayCalendarSource();
