import { DateTime } from "luxon";

export const BASE_URL = `http://localhost:${process.env.E2E_PORT ?? 8898}`;
export const TEL_AVIV = "Asia/Jerusalem";
export const DEMO_PASSWORD = "demo1234";

export interface ApiResponse<T = any> {
	status: number;
	body: T;
	/** The body exactly as sent, for byte-for-byte comparisons. */
	text: string;
	headers: Headers;
}

export const api = async <T = any>(
	method: string,
	path: string,
	options: { token?: string; body?: unknown; raw?: string } = {},
): Promise<ApiResponse<T>> => {
	const res = await fetch(BASE_URL + path, {
		method,
		headers: {
			"content-type": "application/json",
			...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
		},
		body: options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
	});
	const text = await res.text();
	let body: unknown = null;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = text;
	}
	return { status: res.status, body: body as T, text, headers: res.headers };
};

export const login = async (email: string): Promise<string> => {
	const res = await api<{ token: string }>("POST", "/auth/login", { body: { email, password: DEMO_PASSWORD } });
	if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status}`);
	return res.body.token;
};

/** An office-local moment N days from today at "HH:mm", as ISO with offset. */
export const daysFromNow = (days: number, time: string, zone = TEL_AVIV): string => {
	const [hour, minute] = time.split(":").map(Number);
	return DateTime.now().setZone(zone).plus({ days }).set({ hour, minute, second: 0, millisecond: 0 }).toISO()!;
};

/**
 * An office-local ISO weekday (1 = Monday ... 7 = Sunday) about N weeks ahead at "HH:mm". Far enough ahead to stay clear of the
 * seeded requests (which end within ~11 weeks of the seed date).
 */
export const weeksAhead = (weeks: number, weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7, time: string, zone = TEL_AVIV): string => {
	const [hour, minute] = time.split(":").map(Number);
	return DateTime.now().setZone(zone).plus({ weeks }).set({ weekday, hour, minute, second: 0, millisecond: 0 }).toISO()!;
};
