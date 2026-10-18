import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORK_DAYS, canonicalTimezone, countWorkingDays, isOnTimeStep, isValidTimezone, startsAfterOfficeToday } from "./officeTime";

const at = (iso: string, zone: string) => DateTime.fromISO(iso, { zone }).toJSDate();
const TLV = "Asia/Jerusalem";
const monFri = { timezone: TLV, workDays: DEFAULT_WORK_DAYS };
const sunThu = { timezone: TLV, workDays: [7, 1, 2, 3, 4] };

describe("startsAfterOfficeToday (rule 4)", () => {
	const now = at("2026-10-18T10:00", TLV);

	it("rejects today and accepts tomorrow, in office time", () => {
		expect(startsAfterOfficeToday(at("2026-10-18T15:00", TLV), TLV, now)).toBe(false);
		expect(startsAfterOfficeToday(at("2026-10-19T00:00", TLV), TLV, now)).toBe(true);
	});

	it("uses the office's date, not the server's (UTC) date", () => {
		// 01:30 on the 19th in Tel Aviv is still the 18th in UTC.
		const earlyMorning = at("2026-10-19T01:30", TLV);
		expect(startsAfterOfficeToday(at("2026-10-19T09:00", TLV), TLV, earlyMorning)).toBe(false);
		expect(startsAfterOfficeToday(at("2026-10-20T09:00", TLV), TLV, earlyMorning)).toBe(true);
	});
});

describe("countWorkingDays", () => {
	it("counts the office's working dates covered", () => {
		expect(countWorkingDays(at("2026-11-02T09:00", TLV), at("2026-11-06T18:00", TLV), monFri)).toBe(5);
	});

	it("skips non-working days", () => {
		// Thu → next Tue: Thu, Fri, Mon, Tue.
		expect(countWorkingDays(at("2026-11-05T09:00", TLV), at("2026-11-10T18:00", TLV), monFri)).toBe(4);
	});

	it("follows the office's own week (Sun–Thu)", () => {
		// Sun 1 Nov → Sat 7 Nov: Sun–Thu work, Fri–Sat off.
		expect(countWorkingDays(at("2026-11-01T09:00", TLV), at("2026-11-07T18:00", TLV), sunThu)).toBe(5);
		expect(countWorkingDays(at("2026-11-06T09:00", TLV), at("2026-11-06T18:00", TLV), sunThu)).toBe(0); // Friday
		expect(countWorkingDays(at("2026-11-01T09:00", TLV), at("2026-11-01T18:00", TLV), sunThu)).toBe(1); // Sunday
	});

	it("counts a short single-day request as half a day", () => {
		expect(countWorkingDays(at("2026-11-02T09:00", TLV), at("2026-11-02T13:00", TLV), monFri)).toBe(0.5);
	});

	it("counts a long single-day request as a full day", () => {
		expect(countWorkingDays(at("2026-11-02T09:00", TLV), at("2026-11-02T18:00", TLV), monFri)).toBe(1);
	});

	it("doesn't count a request ending exactly at midnight against the next day", () => {
		expect(countWorkingDays(at("2026-11-02T09:00", TLV), at("2026-11-04T00:00", TLV), monFri)).toBe(2);
	});

	it("counts zero for a request on non-working days only", () => {
		expect(countWorkingDays(at("2026-11-07T09:00", TLV), at("2026-11-08T18:00", TLV), monFri)).toBe(0);
	});

	it("depends on the office zone", () => {
		// 23:00-23:30 UTC on Friday is already Saturday in Tokyo.
		const start = at("2026-11-06T23:00", "UTC"), end = at("2026-11-06T23:30", "UTC");
		expect(countWorkingDays(start, end, { timezone: "UTC", workDays: DEFAULT_WORK_DAYS })).toBe(0.5);
		expect(countWorkingDays(start, end, { timezone: "Asia/Tokyo", workDays: DEFAULT_WORK_DAYS })).toBe(0);
	});
});

describe("isOnTimeStep", () => {
	it("accepts quarter hours and rejects anything else", () => {
		expect(isOnTimeStep(at("2026-11-02T09:45", TLV))).toBe(true);
		expect(isOnTimeStep(at("2026-11-02T09:07", TLV))).toBe(false);
		expect(isOnTimeStep(new Date("2026-11-02T07:00:30Z"))).toBe(false);
	});

	it("works for zones with 45-minute offsets", () => {
		expect(isOnTimeStep(at("2026-11-02T09:15", "Asia/Kathmandu"))).toBe(true);
	});
});

describe("time zones", () => {
	it("validates IANA zones", () => {
		expect(isValidTimezone("Europe/Paris")).toBe(true);
		expect(isValidTimezone("Mars/Olympus")).toBe(false);
	});

	it("canonicalizes spelling", () => {
		expect(canonicalTimezone("europe/paris")).toBe("Europe/Paris");
		expect(canonicalTimezone("Asia/Jerusalem")).toBe("Asia/Jerusalem");
	});
});
