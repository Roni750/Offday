import { describe, expect, it, vi } from "vitest";
import { HolidayCalendarSource } from "./holidayCalendars";
import { parseIcsEvents } from "./ics";

const feed = (events: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");

const event = (lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");

const YOM_KIPPUR = event(["DTSTART;VALUE=DATE:20260921", "DTEND;VALUE=DATE:20260922", "SUMMARY:Yom Kippur"]);
const EID = event([
	"DTSTART;VALUE=DATE:20260320", "DTEND;VALUE=DATE:20260321", "SUMMARY:Eid al-Fitr",
	"DESCRIPTION:Date is tentative and may change.",
]);

describe("parseIcsEvents", () => {
	it("reads all-day events with an inclusive end date", () => {
		expect(parseIcsEvents(feed([YOM_KIPPUR]))).toEqual([{ start: "2026-09-21", end: "2026-09-21", summary: "Yom Kippur", description: null }]);
	});

	it("keeps multi-day events and defaults a missing DTEND to one day", () => {
		const events = parseIcsEvents(feed([
			event(["DTSTART;VALUE=DATE:20261003", "DTEND;VALUE=DATE:20261005", "SUMMARY:Two days"]),
			event(["DTSTART;VALUE=DATE:20261010", "SUMMARY:No end"]),
		]));
		expect(events.map((e) => [e.start, e.end])).toEqual([["2026-10-03", "2026-10-04"], ["2026-10-10", "2026-10-10"]]);
	});

	it("unfolds long lines and unescapes text", () => {
		const [parsed] = parseIcsEvents(feed([event(["DTSTART;VALUE=DATE:20261225", "SUMMARY:Christmas\\, the", "  feast", "DESCRIPTION:Line one\\nLine two"])]));
		expect(parsed.summary).toBe("Christmas, the feast");
		expect(parsed.description).toBe("Line one\nLine two");
	});

	it("skips timed events and events without a name", () => {
		expect(parseIcsEvents(feed([
			event(["DTSTART:20261003T090000Z", "SUMMARY:Meeting"]),
			event(["DTSTART;VALUE=DATE:20261003"]),
		]))).toEqual([]);
	});
});

describe("HolidayCalendarSource", () => {
	it("returns holidays in the range, flags tentative dates and caches each feed", async () => {
		const fetcher = vi.fn(async (url: string) => (url.includes("judaism") ? feed([YOM_KIPPUR]) : feed([EID])));
		const source = new HolidayCalendarSource(fetcher);

		const march = await source.between(["jewish", "muslim"], "2026-03-01", "2026-03-31");
		expect(march).toEqual({
			holidays: [{ calendar: "muslim", name: "Eid al-Fitr", startDate: "2026-03-20", endDate: "2026-03-20", tentative: true }],
			unavailable: [],
		});

		await source.between(["jewish"], "2026-09-01", "2026-09-30");
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it("reports a failing feed without failing the others, and retries it next time", async () => {
		const fetcher = vi.fn(async (url: string) => {
			if (url.includes("islamic")) throw new Error("offline");
			return feed([YOM_KIPPUR]);
		});
		const source = new HolidayCalendarSource(fetcher);
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		const result = await source.between(["jewish", "muslim"], "2026-09-01", "2026-09-30");
		expect(result.unavailable).toEqual(["muslim"]);
		expect(result.holidays.map((h) => h.name)).toEqual(["Yom Kippur"]);

		await source.between(["muslim"], "2026-09-01", "2026-09-30");
		expect(fetcher).toHaveBeenCalledTimes(3);
	});

	it("downloads a feed again once the cache expires", async () => {
		let now = 0;
		const fetcher = vi.fn(async () => feed([YOM_KIPPUR]));
		const source = new HolidayCalendarSource(fetcher, () => now);
		await source.between(["jewish"], "2026-01-01", "2026-12-31");
		now = 13 * 60 * 60 * 1000;
		await source.between(["jewish"], "2026-01-01", "2026-12-31");
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
});
