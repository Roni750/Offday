import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { formatDayRange, formatSpan, listNames } from "./periodText";

const ZONE = "Asia/Jerusalem";
const at = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }).toJSDate();

describe("period text", () => {
	it("formats ranges in the office zone", () => {
		expect(formatDayRange(at("2026-10-12T09:00"), at("2026-10-14T18:00"), ZONE)).toBe("12–14 Oct");
		expect(formatDayRange(at("2026-10-12T09:00"), at("2026-10-12T13:00"), ZONE)).toBe("12 Oct");
		expect(formatDayRange(at("2026-12-28T09:00"), at("2027-01-01T18:00"), ZONE)).toBe("28 Dec – 1 Jan");
	});

	it("treats an end at midnight as the day before", () => {
		expect(formatDayRange(at("2026-10-12T09:00"), at("2026-10-15T00:00"), ZONE)).toBe("12–14 Oct");
	});

	it("uses the office zone, not UTC", () => {
		// 01:00 in Tel Aviv on 12 Oct is still 11 Oct in UTC.
		expect(formatDayRange(at("2026-10-12T01:00"), at("2026-10-12T05:00"), ZONE)).toBe("12 Oct");
	});

	it("describes a trip's span", () => {
		expect(formatSpan(at("2026-10-10T09:00"), at("2026-10-20T18:00"), ZONE)).toBe("from 10 Oct to 20 Oct 2026");
		expect(formatSpan(at("2026-12-28T09:00"), at("2027-01-01T18:00"), ZONE)).toBe("from 28 Dec 2026 to 1 Jan 2027");
		expect(formatSpan(at("2026-10-10T09:00"), at("2026-10-10T13:00"), ZONE)).toBe("on 10 Oct 2026");
	});

	it("lists names in plain English", () => {
		expect(listNames(["Dana"])).toBe("Dana");
		expect(listNames(["Dana", "Tom"])).toBe("Dana and Tom");
		expect(listNames(["Dana", "Tom", "Aya"])).toBe("Dana, Tom and Aya");
	});
});
