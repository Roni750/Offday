/** One all-day event from an iCalendar (RFC 5545) feed. `end` is inclusive, unlike DTEND. */
export interface IcsEvent {
	start: string;   // "2026-10-03"
	end: string;
	summary: string;
	description: string | null;
}

const toIsoDate = (value: string): string | null => {
	const match = /^(\d{4})(\d{2})(\d{2})/.exec(value);
	return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const minusOneDay = (isoDate: string): string => {
	const date = new Date(`${isoDate}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() - 1);
	return date.toISOString().slice(0, 10);
};

const unescapeText = (value: string): string =>
	value.replace(/\\([\\;,nN])/g, (_, ch: string) => (ch === "n" || ch === "N" ? "\n" : ch));

/**
 * Reads the all-day VEVENTs of a feed. Only what a holiday needs is parsed (date, name, description);
 * timed events are skipped. Long lines are "folded" onto lines starting with a space or tab.
 */
export const parseIcsEvents = (text: string): IcsEvent[] => {
	const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
	const events: IcsEvent[] = [];
	let current: Record<string, string> | null = null;

	for (const line of lines) {
		if (line === "BEGIN:VEVENT") {
			current = {};
			continue;
		}
		if (line === "END:VEVENT") {
			const start = current?.DTSTART ? toIsoDate(current.DTSTART) : null;
			const allDay = current?.DTSTART && !current.DTSTART.includes("T");
			if (current && start && allDay && current.SUMMARY) {
				// DTEND is exclusive for all-day events; without it the event lasts one day.
				const endExclusive = current.DTEND ? toIsoDate(current.DTEND) : null;
				events.push({
					start,
					end: endExclusive && endExclusive > start ? minusOneDay(endExclusive) : start,
					summary: unescapeText(current.SUMMARY).trim(),
					description: current.DESCRIPTION ? unescapeText(current.DESCRIPTION).trim() || null : null,
				});
			}
			current = null;
			continue;
		}
		if (!current) continue;

		// "DTSTART;VALUE=DATE:20261003" → name "DTSTART", value "20261003" (parameters are ignored).
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		const name = line.slice(0, colon).split(";")[0].toUpperCase();
		current[name] ??= line.slice(colon + 1);
	}
	return events;
};
