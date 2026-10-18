// End-to-end tests against the running API and a real Postgres (see globalSetup.ts).
// Tests in this file run in order and build on each other's data.
import { DateTime } from "luxon";
import { beforeAll, describe, expect, it } from "vitest";
import { generateInviteToken, hashInviteToken } from "../../src/auth/inviteTokens";
import { TEL_AVIV, api, daysFromNow, login, weeksAhead } from "./client";
import { sql } from "./localDb";

let lina: string, omar: string, noa: string, camille: string, hugo: string, ethan: string;
let linaId: number, noaId: number;

beforeAll(async () => {
	[lina, omar, noa, camille, hugo, ethan] = await Promise.all(
		["lina@acme.io", "omar@acme.io", "noa@acme.io", "camille@acme.io", "hugo@acme.io", "ethan@globex.com"].map(login),
	);
	linaId = (await api("GET", "/me", { token: lina })).body.id;
	noaId = (await api("GET", "/me", { token: noa })).body.id;
});

describe("authentication", () => {
	it("rejects a wrong password with the same error as an unknown email", async () => {
		const wrong = await api("POST", "/auth/login", { body: { email: "lina@acme.io", password: "nope" } });
		const unknown = await api("POST", "/auth/login", { body: { email: "nobody@acme.io", password: "nope" } });
		expect(wrong.status).toBe(401);
		expect(unknown.status).toBe(401);
		expect(wrong.body.error.message).toBe(unknown.body.error.message);
	});

	it("requires a valid token", async () => {
		expect((await api("GET", "/me")).status).toBe(401);
		expect((await api("GET", "/me", { token: "garbage" })).status).toBe(401);
	});

	it("returns the caller with office and workspace", async () => {
		const me = await api("GET", "/me", { token: lina });
		expect(me.status).toBe(200);
		expect(me.body).toMatchObject({ role: "Requester", office: { name: "Tel Aviv", timezone: TEL_AVIV }, workspace: { name: "Acme" } });
	});
});

describe("submitting requests (business rules)", () => {
	let halfDayId: number;

	it("rejects malformed JSON", async () => {
		expect((await api("POST", "/requests", { token: lina, raw: "{oops" })).status).toBe(400);
	});

	it("rule 1: end must be after start", async () => {
		const res = await api("POST", "/requests", { token: lina, body: { startDate: daysFromNow(3, "18:00"), endDate: daysFromNow(3, "09:00") } });
		expect(res.status).toBe(400);
		expect(res.body.error.details.fields.endDate).toBeDefined();
	});

	it("rule 4: rejects the past", async () => {
		const res = await api("POST", "/requests", { token: lina, body: { startDate: daysFromNow(-2, "09:00"), endDate: daysFromNow(-1, "18:00") } });
		expect(res.status).toBe(400);
	});

	it("rule 4: rejects later today (office time)", async (ctx) => {
		// The next quarter hour today (times must be on 15-minute steps). After 23:45 there is none.
		const now = DateTime.now().setZone(TEL_AVIV);
		const next = now.startOf("hour").plus({ minutes: (Math.floor(now.minute / 15) + 1) * 15 });
		if (!next.hasSame(now, "day")) ctx.skip();
		const laterToday = next.toISO();
		const res = await api("POST", "/requests", { token: lina, body: { startDate: laterToday, endDate: daysFromNow(1, "18:00") } });
		expect(res.status).toBe(400);
		expect(res.body.error.details.fields.startDate).toMatch(/after today/);
	});

	it("accepts a half day and counts it as 0.5", async () => {
		const res = await api("POST", "/requests", {
			token: lina,
			body: { startDate: weeksAhead(16, 2, "09:00"), endDate: weeksAhead(16, 2, "13:00"), reason: "Half day" },
		});
		expect(res.status).toBe(201);
		expect(res.body).toMatchObject({ status: "Pending", days: 0.5, reason: "Half day" });
		halfDayId = res.body.id;
	});

	it("allows a request that touches another (13:00 end, 13:00 start)", async () => {
		const res = await api("POST", "/requests", { token: lina, body: { startDate: weeksAhead(16, 2, "13:00"), endDate: weeksAhead(16, 2, "18:00") } });
		expect(res.status).toBe(201);
	});

	it("rule 2: rejects an overlap and names the conflicting request", async () => {
		const res = await api("POST", "/requests", { token: lina, body: { startDate: weeksAhead(16, 2, "12:00"), endDate: weeksAhead(16, 3, "18:00") } });
		expect(res.status).toBe(409);
		expect(res.body.error.code).toBe("OVERLAP");
		expect(res.body.error.details.conflict.id).toBeTypeOf("number");
	});

	it("rule 2: two identical submissions at the same moment create exactly one request", async () => {
		const body = { startDate: weeksAhead(18, 1, "09:00"), endDate: weeksAhead(18, 5, "18:00") };
		const results = await Promise.all([api("POST", "/requests", { token: lina, body }), api("POST", "/requests", { token: lina, body })]);
		expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
	});

	it("lets the owner edit a Pending request", async () => {
		const res = await api("PUT", `/requests/${halfDayId}`, {
			token: lina,
			body: { startDate: weeksAhead(16, 2, "09:00"), endDate: weeksAhead(16, 2, "12:00"), reason: "Shorter" },
		});
		expect(res.status).toBe(200);
		expect(res.body.reason).toBe("Shorter");
	});

	it("hides other users' requests from edits (404)", async () => {
		const res = await api("PUT", `/requests/${halfDayId}`, { token: omar, body: { startDate: weeksAhead(16, 2, "09:00"), endDate: weeksAhead(16, 2, "13:00") } });
		expect(res.status).toBe(404);
	});

	it("rule 3: approved requests can't be modified or withdrawn", async () => {
		const approved = (await api("GET", "/requests/mine?status=Approved", { token: lina })).body.items[0];
		const edit = await api("PUT", `/requests/${approved.id}`, { token: lina, body: { startDate: weeksAhead(20, 1, "09:00"), endDate: weeksAhead(20, 1, "18:00") } });
		const withdraw = await api("DELETE", `/requests/${approved.id}`, { token: lina });
		expect(edit.status).toBe(409);
		expect(edit.body.error.code).toBe("INVALID_STATE");
		expect(withdraw.status).toBe(409);
	});

	it("lists own requests with tab counts that ignore the status filter", async () => {
		const res = await api("GET", "/requests/mine?status=Pending", { token: lina });
		expect(res.status).toBe(200);
		expect(res.body.items.every((r: { status: string }) => r.status === "Pending")).toBe(true);
		expect(res.body.counts.all).toBe(res.body.counts.Pending + res.body.counts.Approved + res.body.counts.Rejected);
		expect(res.body.counts.Approved).toBeGreaterThan(0);
	});

	it("requires at least one working day (Tel Aviv works Sun-Thu, so Fri-Sat is rejected)", async () => {
		const res = await api("POST", "/requests", { token: lina, body: { startDate: weeksAhead(30, 5, "09:00"), endDate: weeksAhead(30, 6, "18:00") } });
		expect(res.status).toBe(400);
		expect(res.body.error.details.fields.endDate).toMatch(/working day/);
	});

	it("counts a Sunday as a working day in Tel Aviv", async () => {
		const res = await api("POST", "/requests", { token: lina, body: { startDate: weeksAhead(31, 7, "09:00"), endDate: weeksAhead(31, 7, "18:00") } });
		expect(res.status).toBe(201);
		expect(res.body.days).toBe(1);
		await api("DELETE", `/requests/${res.body.id}`, { token: lina });
	});

	it("requires quarter-hour times", async () => {
		const res = await api("POST", "/requests", { token: lina, body: { startDate: weeksAhead(32, 1, "09:07"), endDate: weeksAhead(32, 1, "18:00") } });
		expect(res.status).toBe(400);
		expect(res.body.error.details.fields.startDate).toMatch(/quarter hour/);
	});

	it("explains validation errors in plain language", async () => {
		const res = await api("POST", "/requests", { token: lina, body: { endDate: "soon", reason: "x".repeat(241) } });
		expect(res.status).toBe(400);
		expect(res.body.error.message).toBe("Some fields are invalid");
		expect(res.body.error.details.fields.reason).toBe("Keep the reason to 240 characters or fewer");
		expect(res.body.error.details.fields.endDate).toMatch(/date and time with a UTC offset/);
	});

	it("withdraws an own Pending request", async () => {
		const pending = await api("POST", "/requests", { token: lina, body: { startDate: weeksAhead(22, 1, "09:00"), endDate: weeksAhead(22, 1, "18:00") } });
		expect((await api("DELETE", `/requests/${pending.body.id}`, { token: lina })).status).toBe(204);
	});
});

describe("reviewing requests", () => {
	let pendingId: number;

	beforeAll(async () => {
		pendingId = (await api("POST", "/requests", { token: lina, body: { startDate: weeksAhead(24, 3, "09:00"), endDate: weeksAhead(24, 3, "18:00") } })).body.id;
	});

	it("rule 6: requesters can't list, approve or reject", async () => {
		expect((await api("GET", "/requests", { token: lina })).status).toBe(403);
		expect((await api("POST", `/requests/${pendingId}/approve`, { token: lina })).status).toBe(403);
	});

	it("lists the office with Pending first, pagination and counts", async () => {
		const res = await api("GET", "/requests?page=1&pageSize=50", { token: omar });
		expect(res.status).toBe(200);
		const statuses: string[] = res.body.items.map((r: { status: string }) => r.status);
		const firstDecided = statuses.findIndex((s) => s !== "Pending");
		expect(statuses.slice(firstDecided).includes("Pending")).toBe(false);
		expect(res.body.counts.all).toBe(res.body.total);

		const page = await api("GET", "/requests?page=2&pageSize=6", { token: omar });
		expect(page.body.items.length).toBeLessThanOrEqual(6);
		expect(page.body.page).toBe(2);
	});

	it("filters by user", async () => {
		const res = await api("GET", `/requests?userId=${linaId}&pageSize=50`, { token: omar });
		expect(res.body.items.every((r: { user: { id: number } }) => r.user.id === linaId)).toBe(true);
	});

	it("rule 5: rejecting needs a non-blank comment", async () => {
		expect((await api("POST", `/requests/${pendingId}/reject`, { token: omar, body: { comment: "   " } })).status).toBe(400);
	});

	it("approves, records who decided, and refuses a second decision", async () => {
		const approved = await api("POST", `/requests/${pendingId}/approve`, { token: omar });
		expect(approved.status).toBe(200);
		expect(approved.body).toMatchObject({ status: "Approved", decidedBy: { name: "Omar Benali" } });
		expect((await api("POST", `/requests/${pendingId}/reject`, { token: omar, body: { comment: "late" } })).status).toBe(409);
	});

	it("rejects with a comment", async () => {
		const id = (await api("POST", "/requests", { token: lina, body: { startDate: weeksAhead(26, 3, "09:00"), endDate: weeksAhead(26, 3, "18:00") } })).body.id;
		const res = await api("POST", `/requests/${id}/reject`, { token: omar, body: { comment: "Team offsite" } });
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({ status: "Rejected", comments: "Team offsite" });
	});

	it("rule 6: validators can't decide their own requests", async () => {
		const own = (await api("POST", "/requests", { token: omar, body: { startDate: weeksAhead(20, 1, "09:00"), endDate: weeksAhead(20, 1, "18:00") } })).body.id;
		expect((await api("POST", `/requests/${own}/approve`, { token: omar })).status).toBe(403);
	});

	it("'awaiting my review' leaves out the reviewer's own pending requests, in the list and the overview", async () => {
		const omarId = (await api("GET", "/me", { token: omar })).body.id;
		const list = await api("GET", "/requests?status=Pending&pageSize=100", { token: omar });
		const own = list.body.items.filter((r: { user: { id: number } }) => r.user.id === omarId).length;
		expect(own).toBeGreaterThan(0);
		expect(list.body.awaitingMyReview).toBe(list.body.counts.Pending - own);
		expect((await api("GET", "/stats/overview", { token: omar })).body.pendingCount).toBe(list.body.awaitingMyReview);
	});
});

describe("tenant isolation", () => {
	it("a validator from another office can't see or decide Tel Aviv requests", async () => {
		const telAvivPending = (await api("GET", "/requests?status=Pending", { token: omar })).body.items[0].id;
		expect((await api("POST", `/requests/${telAvivPending}/approve`, { token: camille })).status).toBe(404);
		const paris = await api("GET", "/requests?pageSize=100", { token: camille });
		expect(paris.body.items.every((r: { user: { email: string } }) => ["louis@acme.io", "chloe@acme.io", "camille@acme.io", "hugo@acme.io"].includes(r.user.email))).toBe(true);
	});

	it("another workspace sees nothing from Acme", async () => {
		const globex = await api("GET", "/requests?pageSize=100", { token: ethan });
		expect(globex.body.items.every((r: { user: { email: string } }) => r.user.email.endsWith("@globex.com"))).toBe(true);
		expect((await api("GET", "/office/users", { token: ethan })).body).toHaveLength(4);
	});
});

describe("admin permissions", () => {
	it("only workspace admins change roles, never their own, within their workspace", async () => {
		expect((await api("PUT", `/users/${linaId}/role`, { token: omar, body: { role: "Validator" } })).status).toBe(403);
		expect((await api("PUT", `/users/${noaId}/role`, { token: noa, body: { role: "Requester" } })).status).toBe(403);
		expect((await api("PUT", `/users/${linaId}/role`, { token: ethan, body: { role: "Validator" } })).status).toBe(404);
		// Hugo administers Paris, which is in the same workspace as Tel Aviv.
		expect((await api("PUT", `/users/${linaId}/role`, { token: hugo, body: { role: "Validator" } })).body.role).toBe("Validator");
		expect((await api("PUT", `/users/${linaId}/role`, { token: hugo, body: { role: "Requester" } })).body.role).toBe("Requester");
	});

	it("role changes apply immediately, even to an existing token", async () => {
		expect((await api("PUT", `/users/${linaId}/role`, { token: noa, body: { role: "Validator" } })).status).toBe(200);
		expect((await api("GET", "/requests", { token: lina })).status).toBe(200);
		await api("PUT", `/users/${linaId}/role`, { token: noa, body: { role: "Requester" } });
		expect((await api("GET", "/requests", { token: lina })).status).toBe(403);
	});

	it("stores time zones in canonical spelling", async () => {
		const res = await api("PUT", "/office/timezone", { token: noa, body: { timezone: "europe/paris" } });
		expect(res.body.timezone).toBe("Europe/Paris");
		await api("PUT", "/office/timezone", { token: noa, body: { timezone: TEL_AVIV } });
	});

	it("only workspace admins set the work week, with valid weekdays, and day counts follow it", async () => {
		expect((await api("PUT", "/office/work-week", { token: omar, body: { workDays: [1, 2, 3, 4, 5] } })).status).toBe(403);
		expect((await api("PUT", "/office/work-week", { token: noa, body: { workDays: [] } })).status).toBe(400);
		expect((await api("PUT", "/office/work-week", { token: noa, body: { workDays: [1, 1, 8] } })).status).toBe(400);

		const sunday = { startDate: weeksAhead(33, 7, "09:00"), endDate: weeksAhead(33, 7, "18:00") };
		const created = await api("POST", "/requests", { token: lina, body: sunday });
		expect(created.body.days).toBe(1);

		const changed = await api("PUT", "/office/work-week", { token: noa, body: { workDays: [5, 4, 3, 2, 1] } });
		expect(changed.status).toBe(200);
		expect(changed.body.workDays).toEqual([1, 2, 3, 4, 5]);
		const mine = await api("GET", "/requests/mine?status=Pending&pageSize=100", { token: lina });
		expect(mine.body.items.find((r: { id: number }) => r.id === created.body.id).days).toBe(0);

		await api("DELETE", `/requests/${created.body.id}`, { token: lina });
		await api("PUT", "/office/work-week", { token: noa, body: { workDays: [7, 1, 2, 3, 4] } });
		expect((await api("GET", "/me", { token: lina })).body.office.workDays).toEqual([1, 2, 3, 4, 7]);
	});

	it("only workspace admins change the time zone, and it must be a real IANA zone", async () => {
		expect((await api("PUT", "/office/timezone", { token: lina, body: { timezone: "Europe/Paris" } })).status).toBe(403);
		expect((await api("PUT", "/office/timezone", { token: noa, body: { timezone: "Mars/Olympus" } })).status).toBe(400);
		const changed = await api("PUT", "/office/timezone", { token: noa, body: { timezone: "Europe/Paris" } });
		expect(changed.body.timezone).toBe("Europe/Paris");
		await api("PUT", "/office/timezone", { token: noa, body: { timezone: TEL_AVIV } });
	});
});

describe("workspace administration", () => {
	let parisId: number;

	it("lists the workspace's offices with headcounts, for workspace admins only", async () => {
		const res = await api("GET", "/workspace/offices", { token: noa });
		expect(res.status).toBe(200);
		expect(res.body.map((o: { name: string }) => o.name)).toEqual(["Paris", "Tel Aviv"]);
		const [paris, telAviv] = res.body;
		expect(telAviv).toMatchObject({ isMine: true, timezone: TEL_AVIV, people: { total: 9, Requester: 7, Validator: 1, WorkspaceAdmin: 1 } });
		expect(paris).toMatchObject({ isMine: false, timezone: "Europe/Paris", people: { total: 4 } });
		parisId = paris.id;

		expect((await api("GET", "/workspace/offices", { token: omar })).status).toBe(403);
		expect((await api("GET", "/workspace/offices", { token: ethan })).body.map((o: { name: string }) => o.name)).toEqual(["Montreal"]);
	});

	it("reads another office's details and people", async () => {
		expect((await api("GET", `/offices/${parisId}`, { token: noa })).body).toMatchObject({ name: "Paris", workspace: { name: "Acme" } });
		const users = await api("GET", `/offices/${parisId}/users`, { token: noa });
		expect(users.body.map((u: { email: string }) => u.email)).toContain("hugo@acme.io");
		expect((await api("GET", `/offices/${parisId}/users`, { token: camille })).status).toBe(403);
	});

	it("changes another office's time zone and work week", async () => {
		const zone = await api("PUT", `/offices/${parisId}/timezone`, { token: noa, body: { timezone: "europe/london" } });
		expect(zone.body).toMatchObject({ id: parisId, timezone: "Europe/London" });
		const week = await api("PUT", `/offices/${parisId}/work-week`, { token: noa, body: { workDays: [1, 2, 3, 4] } });
		expect(week.body.workDays).toEqual([1, 2, 3, 4]);
		// Paris sees the change; Tel Aviv is untouched.
		expect((await api("GET", "/office", { token: hugo })).body).toMatchObject({ timezone: "Europe/London", workDays: [1, 2, 3, 4] });
		expect((await api("GET", "/office", { token: noa })).body.timezone).toBe(TEL_AVIV);

		await api("PUT", `/offices/${parisId}/timezone`, { token: noa, body: { timezone: "Europe/Paris" } });
		await api("PUT", `/offices/${parisId}/work-week`, { token: noa, body: { workDays: [1, 2, 3, 4, 5] } });
	});

	it("hides offices of other workspaces", async () => {
		expect((await api("GET", `/offices/${parisId}`, { token: ethan })).status).toBe(404);
		expect((await api("GET", `/offices/${parisId}/users`, { token: ethan })).status).toBe(404);
		expect((await api("PUT", `/offices/${parisId}/timezone`, { token: ethan, body: { timezone: "UTC" } })).status).toBe(404);
		expect((await api("PUT", `/offices/${parisId}/work-week`, { token: ethan, body: { workDays: [1] } })).status).toBe(404);
	});
});

describe("holidays", () => {
	it("are open to every role, with validated ranges and calendar names", async () => {
		expect((await api("GET", "/holidays?from=2026-10-01&to=2026-10-31", { token: lina })).status).toBe(200);
		expect((await api("GET", "/holidays?from=2026-10-31&to=2026-10-01", { token: omar })).status).toBe(400);
		expect((await api("GET", "/holidays?from=2026-10-01&to=2026-10-31&calendars=pastafarian", { token: omar })).status).toBe(400);
	});

	it("list the available calendars (no calendars picked means no download)", async () => {
		const res = await api("GET", "/holidays?from=2026-10-01&to=2026-10-31", { token: omar });
		expect(res.status).toBe(200);
		expect(res.body.calendars.map((c: { id: string }) => c.id)).toEqual(["jewish", "christian", "muslim", "hindu"]);
		expect(res.body).toMatchObject({ holidays: [], unavailable: [] });
	});
});

describe("read models", () => {
	it("leave balance", async () => {
		const res = await api("GET", "/me/balance", { token: lina });
		expect(res.status).toBe(200);
		expect(res.body.allowance).toBe(25);
		expect(res.body.remainingDays).toBe(25 - res.body.usedDays);
		expect(res.body.pendingRequests).toBeTypeOf("number");
	});

	it("overview for reviewers only", async () => {
		const res = await api("GET", "/stats/overview", { token: omar });
		expect(res.status).toBe(200);
		expect(res.body.monthly).toHaveLength(6);
		// 3 months back, current, 2 ahead.
		expect(res.body.monthly[3].month).toBe(DateTime.now().setZone(TEL_AVIV).toFormat("yyyy-MM"));
		expect(res.body.teamSize).toBe(9);
		expect((await api("GET", "/stats/overview", { token: lina })).status).toBe(403);
	});

	it("team calendar shows the office without rejected requests", async () => {
		const from = DateTime.now().setZone(TEL_AVIV).startOf("month");
		const query = `from=${encodeURIComponent(from.toISO()!)}&to=${encodeURIComponent(from.plus({ months: 1 }).toISO()!)}`;
		const res = await api("GET", `/team/calendar?${query}`, { token: lina });
		expect(res.status).toBe(200);
		expect(res.body.users).toHaveLength(9);
		expect(res.body.requests.every((r: { status: string }) => r.status !== "Rejected")).toBe(true);
	});

	it("errors use the contract format", async () => {
		const res = await api("GET", "/nope");
		expect(res.status).toBe(404);
		expect(res.body.error.code).toBe("NOT_FOUND");
		expect((await api("GET", "/requests/mine?status=Weird", { token: lina })).status).toBe(400);
	});
});

// Runs last: accepting invites adds people to Tel Aviv and Paris, which the headcounts above don't expect.
describe("invitations", () => {
	const INVALID_INVITE = {
		error: { code: "NOT_FOUND", message: "This invite link is invalid or has expired. Ask your admin for a new one." },
	};
	const PASSWORD = "correct horse battery";
	let telAvivId: number, parisId: number;
	let emailSeq = 0;
	const freshEmail = () => `invitee-${Date.now()}-${++emailSeq}@example.com`;

	const create = (token: string, officeId: number, body: Record<string, unknown>) =>
		api("POST", `/offices/${officeId}/invitations`, { token, body });
	const preview = (token: unknown) => api("POST", "/invitations/preview", { body: { token } });
	const accept = (token: unknown, fields: Record<string, unknown> = {}, auth?: string) =>
		api("POST", "/invitations/accept", { token: auth, body: { token, name: "New Person", email: freshEmail(), password: PASSWORD, ...fields } });
	const useCount = async (id: number) => (await sql<{ use_count: number }>("SELECT use_count FROM invitations WHERE id = $1", [id]))[0].use_count;
	const teamLink = async (body: Record<string, unknown> = {}, officeId = telAvivId) => {
		const res = await create(noa, officeId, { kind: "team", ...body });
		expect(res.status).toBe(201);
		return res.body as { invitation: { id: number }; token: string };
	};

	beforeAll(async () => {
		const offices = (await api("GET", "/workspace/offices", { token: noa })).body as { id: number; name: string }[];
		telAvivId = offices.find((o) => o.name === "Tel Aviv")!.id;
		parisId = offices.find((o) => o.name === "Paris")!.id;
	});

	describe("creating and listing links", () => {
		it("creates a team link for the admin's own office, with defaults, and returns the token once", async () => {
			const res = await create(noa, telAvivId, { kind: "team", label: "  Autumn hires  " });
			expect(res.status).toBe(201);
			expect(res.headers.get("cache-control")).toBe("no-store");
			expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
			expect(res.body.invitation).toMatchObject({
				kind: "team", label: "Autumn hires", role: "Requester", email: null, maxUses: 25, useCount: 0,
				revokedAt: null, createdBy: { id: noaId, name: "Noa Levi" }, status: "Active",
			});
			const days = (Date.parse(res.body.invitation.expiresAt) - Date.parse(res.body.invitation.createdAt)) / 86_400_000;
			expect(days).toBeCloseTo(7, 5);

			const list = await api("GET", `/offices/${telAvivId}/invitations`, { token: noa });
			expect(list.status).toBe(200);
			expect(list.body[0].id).toBe(res.body.invitation.id);
			expect(list.text).not.toContain(res.body.token);
			expect(Object.keys(list.body[0]).sort()).toEqual(
				["createdAt", "createdBy", "email", "expiresAt", "id", "kind", "label", "maxUses", "revokedAt", "role", "status", "useCount"],
			);
		});

		it("creates a personal link for another office of the same workspace", async () => {
			const res = await create(noa, parisId, { kind: "personal", email: "New.Hire@Example.com", role: "Validator", expiresInDays: 14 });
			expect(res.status).toBe(201);
			expect(res.body.invitation).toMatchObject({ kind: "personal", email: "new.hire@example.com", role: "Validator", maxUses: 1 });
			const ids = (await api("GET", `/offices/${parisId}/invitations`, { token: noa })).body.map((i: { id: number }) => i.id);
			expect(ids).toContain(res.body.invitation.id);
			expect((await api("GET", `/offices/${telAvivId}/invitations`, { token: noa })).body.map((i: { id: number }) => i.id))
				.not.toContain(res.body.invitation.id);
		});

		it("lists newest first", async () => {
			const list = (await api("GET", `/offices/${telAvivId}/invitations`, { token: noa })).body as { createdAt: string }[];
			const times = list.map((i) => Date.parse(i.createdAt));
			expect(times).toEqual([...times].sort((a, b) => b - a));
		});

		it("is for workspace admins only", async () => {
			expect((await create(lina, telAvivId, { kind: "team" })).status).toBe(403);
			expect((await create(omar, telAvivId, { kind: "team" })).status).toBe(403);
			expect((await api("GET", `/offices/${telAvivId}/invitations`, { token: omar })).status).toBe(403);
			expect((await api("POST", `/offices/${telAvivId}/invitations`, { body: { kind: "team" } })).status).toBe(401);
		});

		it("hides offices of other workspaces (404 on create, list and revoke)", async () => {
			const { invitation } = await teamLink();
			expect((await create(ethan, telAvivId, { kind: "team" })).status).toBe(404);
			expect((await api("GET", `/offices/${telAvivId}/invitations`, { token: ethan })).status).toBe(404);
			expect((await api("DELETE", `/offices/${telAvivId}/invitations/${invitation.id}`, { token: ethan })).status).toBe(404);
			// The right workspace but the wrong office is also a 404.
			expect((await api("DELETE", `/offices/${parisId}/invitations/${invitation.id}`, { token: noa })).status).toBe(404);
		});

		it("validates the link settings", async () => {
			const fields = async (body: Record<string, unknown>) => {
				const res = await create(noa, telAvivId, body);
				expect(res.status).toBe(400);
				return res.body.error.details.fields as Record<string, string>;
			};
			expect((await fields({ kind: "personal", role: "WorkspaceAdmin" })).email).toBeDefined();
			expect((await fields({ kind: "team", role: "WorkspaceAdmin", maxUses: 5 })).role).toMatch(/personal/);
			expect((await fields({ kind: "personal", role: "WorkspaceAdmin", email: "boss@example.com", maxUses: 2 })).maxUses).toBeDefined();
			expect((await fields({ kind: "personal", role: "WorkspaceAdmin", email: "boss@example.com", expiresInDays: 4 })).expiresInDays).toMatch(/72 hours/);
			expect((await fields({ kind: "team", maxUses: 0 })).maxUses).toBeDefined();
			expect((await fields({ kind: "team", maxUses: 201 })).maxUses).toBeDefined();
			expect((await fields({ kind: "team", expiresInDays: 31 })).expiresInDays).toBeDefined();
			expect((await fields({ kind: "team", email: "someone@example.com" })).email).toBeDefined();
			expect((await fields({ kind: "personal", email: "not-an-email" })).email).toBeDefined();
			expect((await fields({ kind: "team", label: "x".repeat(81) })).label).toBeDefined();
			expect((await fields({ kind: "everyone" })).kind).toBeDefined();
		});

		it("allows a workspace admin link only as a personal link that expires within 72 hours", async () => {
			const res = await create(noa, telAvivId, { kind: "personal", role: "WorkspaceAdmin", email: "boss@example.com" });
			expect(res.status).toBe(201);
			const hours = (Date.parse(res.body.invitation.expiresAt) - Date.parse(res.body.invitation.createdAt)) / 3_600_000;
			expect(hours).toBeCloseTo(72, 5);
		});

		it("the database refuses a looser admin link even if the API didn't", async () => {
			const insert = sql(
				`INSERT INTO invitations (office_id, role, token_hash, max_uses, expires_at) VALUES ($1, 'WorkspaceAdmin', $2, 5, now() + interval '1 day')`,
				[telAvivId, hashInviteToken(generateInviteToken())],
			);
			await expect(insert).rejects.toThrow(/invitations_admin_guard/);
		});
	});

	describe("previewing and refusing links", () => {
		it("shows names only (no ids) for a usable link", async () => {
			const { token } = await teamLink({ role: "Validator" });
			const res = await preview(token);
			expect(res.status).toBe(200);
			expect(res.headers.get("cache-control")).toBe("no-store");
			expect(res.body).toEqual({
				workspace: { name: "Acme" }, office: { name: "Tel Aviv" }, role: "Validator", email: null, expiresAt: expect.any(String),
			});
		});

		it("answers every unusable link with the same 404 body, byte for byte", async () => {
			const revoked = await teamLink();
			expect((await api("DELETE", `/offices/${telAvivId}/invitations/${revoked.invitation.id}`, { token: noa })).status).toBe(204);

			const expired = await teamLink();
			await sql(`UPDATE invitations SET created_at = now() - interval '10 days', expires_at = now() - interval '1 minute' WHERE id = $1`,
				[expired.invitation.id]);

			const usedUp = await teamLink({ maxUses: 1 });
			expect((await accept(usedUp.token)).status).toBe(201);

			const unusable: unknown[] = [
				generateInviteToken(), // unknown
				"not-a-token", // malformed
				`${generateInviteToken().slice(0, 42)}=`,
				12345,
				undefined,
				revoked.token,
				expired.token,
				usedUp.token,
			];
			const expected = JSON.stringify(INVALID_INVITE);
			for (const token of unusable) {
				const p = await preview(token);
				expect(p.status).toBe(404);
				expect(p.text).toBe(expected);
				const a = await accept(token);
				expect(a.status).toBe(404);
				expect(a.text).toBe(expected);
			}

			const list = (await api("GET", `/offices/${telAvivId}/invitations`, { token: noa })).body as { id: number; status: string }[];
			const statusOf = (id: number) => list.find((i) => i.id === id)!.status;
			expect([statusOf(revoked.invitation.id), statusOf(expired.invitation.id), statusOf(usedUp.invitation.id)]).toEqual(["Revoked", "Expired", "UsedUp"]);
		});

		it("revoking is idempotent", async () => {
			const { invitation } = await teamLink();
			expect((await api("DELETE", `/offices/${telAvivId}/invitations/${invitation.id}`, { token: noa })).status).toBe(204);
			expect((await api("DELETE", `/offices/${telAvivId}/invitations/${invitation.id}`, { token: noa })).status).toBe(204);
			const events = await sql("SELECT 1 FROM audit_log WHERE event_type = 'InvitationRevoked' AND entity_id = $1", [invitation.id]);
			expect(events).toHaveLength(1);
		});

		it("stops working when its creator is no longer a workspace admin", async () => {
			const hugoId = (await api("GET", "/me", { token: hugo })).body.id;
			const res = await create(hugo, parisId, { kind: "team" });
			expect(res.status).toBe(201);
			expect((await preview(res.body.token)).status).toBe(200);

			await api("PUT", `/users/${hugoId}/role`, { token: noa, body: { role: "Validator" } });
			try {
				const p = await preview(res.body.token);
				expect(p.status).toBe(404);
				expect(p.text).toBe(JSON.stringify(INVALID_INVITE));
				expect((await accept(res.body.token)).status).toBe(404);
			} finally {
				await api("PUT", `/users/${hugoId}/role`, { token: noa, body: { role: "WorkspaceAdmin" } });
			}
		});
	});

	describe("accepting links", () => {
		it("creates the account in the link's office with the link's role, and signs it in", async () => {
			const { invitation, token } = await teamLink({ role: "Validator", maxUses: 5 }, parisId);
			const email = freshEmail();
			// A signed-in caller's Authorization header is ignored: the account is created from the link.
			const res = await accept(token, { name: "  Zoé Martin  ", email: email.toUpperCase() }, lina);
			expect(res.status).toBe(201);
			expect(res.headers.get("cache-control")).toBe("no-store");
			expect(res.body.user).toMatchObject({ name: "Zoé Martin", email, role: "Validator", office: { id: parisId, name: "Paris" }, workspace: { name: "Acme" } });

			const me = await api("GET", "/me", { token: res.body.token });
			expect(me.body).toMatchObject({ email, role: "Validator", office: { name: "Paris" } });
			const signIn = await api("POST", "/auth/login", { body: { email, password: PASSWORD } });
			expect(signIn.status).toBe(200);
			expect(await useCount(invitation.id)).toBe(1);

			const audit = await sql<{ event_type: string; payload: string }>(
				"SELECT event_type, payload::text AS payload FROM audit_log WHERE entity_type = 'Invitation' AND entity_id = $1 ORDER BY id",
				[invitation.id],
			);
			expect(audit.map((a) => a.event_type)).toEqual(["InvitationCreated", "InvitationAccepted"]);
			expect(JSON.parse(audit[1].payload)).toEqual({ userId: res.body.user.id, email, role: "Validator" });
			const hash = hashInviteToken(token);
			const everything = (await sql<{ payload: string }>("SELECT payload::text AS payload FROM audit_log")).map((a) => a.payload).join("\n");
			for (const secret of [token, hash.toString("hex"), hash.toString("base64"), hash.toString("base64url")]) {
				expect(everything).not.toContain(secret);
			}
		});

		it("a personal link works once", async () => {
			const email = freshEmail();
			const { token } = (await create(noa, telAvivId, { kind: "personal", email })).body;
			expect((await accept(token, { email })).status).toBe(201);
			const again = await accept(token, { email: freshEmail() });
			expect(again.status).toBe(404);
			expect(again.text).toBe(JSON.stringify(INVALID_INVITE));
		});

		it("never goes past its number of uses, even under concurrent accepts", async () => {
			const { invitation, token } = await teamLink({ maxUses: 3 });
			const results = await Promise.all(Array.from({ length: 8 }, () => accept(token)));
			const statuses = results.map((r) => r.status).sort();
			expect(statuses).toEqual([201, 201, 201, 404, 404, 404, 404, 404]);
			expect(await useCount(invitation.id)).toBe(3);
		});

		it("refuses an email that already has an account, without using up the link", async () => {
			const { invitation, token } = await teamLink();
			const res = await accept(token, { email: "Lina@acme.io" });
			expect(res.status).toBe(409);
			expect(res.body.error).toMatchObject({
				code: "EMAIL_TAKEN",
				message: "An account already exists for this email. Sign in instead.",
				details: { fields: { email: expect.any(String) } },
			});
			expect(await useCount(invitation.id)).toBe(0);
		});

		it("a personal link only accepts its own email, in any letter case", async () => {
			const email = freshEmail();
			const { invitation, token } = (await create(noa, telAvivId, { kind: "personal", email })).body;
			const wrong = await accept(token, { email: freshEmail() });
			expect(wrong.status).toBe(403);
			expect(wrong.body.error.message).toBe("This invite is for a different email address.");
			expect(await useCount(invitation.id)).toBe(0);

			expect((await preview(token)).body.email).toBe(email);
			expect((await accept(token, { email: email.toUpperCase() })).status).toBe(201);
		});

		it("enforces the name and password policy", async () => {
			const { invitation, token } = await teamLink();
			const email = freshEmail();
			const field = async (fields: Record<string, unknown>, name: string) => {
				const res = await accept(token, fields);
				expect(res.status).toBe(400);
				expect(res.body.error.details.fields[name]).toBeDefined();
			};
			await field({ password: "short-pw1" }, "password"); // 9 characters
			await field({ password: "é".repeat(37) }, "password"); // 37 characters, 74 bytes
			await field({ email, password: email.toUpperCase() }, "password");
			await field({ name: "   " }, "name");
			await field({ name: "x".repeat(121) }, "name");
			await field({ email: "nope" }, "email");
			await field({ password: undefined }, "password");
			expect(await useCount(invitation.id)).toBe(0);

			// Exactly 72 bytes is fine.
			expect((await accept(token, { password: "é".repeat(36) })).status).toBe(201);
		});
	});
});
