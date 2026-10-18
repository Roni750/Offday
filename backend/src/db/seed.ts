// Resets the database content and loads demo data. Usage: npm run seed
// Fixture data is written directly with repositories (not through commands) so it can include past decisions.
import bcrypt from "bcryptjs";
import { DateTime } from "luxon";
import dataSource from "./cli.dataSource";
import { Role, VacationStatus } from "../domain/enums";
import { Workspace } from "../domain/Workspace";
import { Office } from "../domain/Office";
import { User } from "../domain/User";
import { VacationRequest } from "../domain/VacationRequest";

const DEMO_PASSWORD = "demo1234";

// The prototype's data was written relative to this date. Everything is shifted by whole weeks
// so the demo stays current and weekdays stay weekdays.
const PROTOTYPE_TODAY = DateTime.fromISO("2026-10-17");
const weekShift = Math.floor(DateTime.now().diff(PROTOTYPE_TODAY, "weeks").weeks);
const shift = (isoDate: string) => DateTime.fromISO(isoDate).plus({ weeks: weekShift }).toISODate()!;

interface SeedUser { key: string; name: string; email: string; role: Role }
interface SeedRequest {
	user: string;
	start: string; end: string;           // dates (full days 09:00-18:00) or "date Thh:mm" for partial days
	status: VacationStatus;
	reason?: string;
	createdAt: string;
	comment?: string;
	decidedAt?: string;
}

interface SeedOffice { name: string; timezone: string; workDays?: number[]; reviewer: string; users: SeedUser[]; requests: SeedRequest[] }
interface SeedWorkspace { name: string; slug: string; offices: SeedOffice[] }

const P = VacationStatus.Pending, A = VacationStatus.Approved, R = VacationStatus.Rejected;

const WORKSPACES: SeedWorkspace[] = [
	{
		name: "Acme", slug: "acme",
		offices: [
			{
				// Israel's work week is Sunday to Thursday.
				name: "Tel Aviv", timezone: "Asia/Jerusalem", workDays: [7, 1, 2, 3, 4], reviewer: "omar",
				users: [
					{ key: "lina", name: "Lina Haddad", email: "lina@acme.io", role: Role.Requester },
					{ key: "omar", name: "Omar Benali", email: "omar@acme.io", role: Role.Validator },
					{ key: "noa", name: "Noa Levi", email: "noa@acme.io", role: Role.OfficeAdmin },
					{ key: "sara", name: "Sara Kim", email: "sara@acme.io", role: Role.Requester },
					{ key: "mehdi", name: "Mehdi Alaoui", email: "mehdi@acme.io", role: Role.Requester },
					{ key: "julia", name: "Julia Novak", email: "julia@acme.io", role: Role.Requester },
					{ key: "tom", name: "Tom Becker", email: "tom@acme.io", role: Role.Requester },
					{ key: "aya", name: "Aya Tanaka", email: "aya@acme.io", role: Role.Requester },
					{ key: "diego", name: "Diego Ruiz", email: "diego@acme.io", role: Role.Requester },
				],
				requests: [
					{ user: "lina", start: "2026-07-20", end: "2026-07-31", status: A, reason: "Summer trip", createdAt: "2026-06-02", decidedAt: "2026-06-03" },
					{ user: "lina", start: "2026-09-14", end: "2026-09-15", status: R, reason: "Long weekend", createdAt: "2026-08-28", decidedAt: "2026-08-29",
						comment: "Release week for v3.2 — could you take the following Monday and Tuesday instead?" },
					{ user: "lina", start: "2026-11-02", end: "2026-11-06", status: A, reason: "Family visit", createdAt: "2026-09-30", decidedAt: "2026-10-01" },
					{ user: "lina", start: "2026-12-21", end: "2026-12-31", status: P, reason: "End-of-year holidays", createdAt: "2026-10-12" },
					{ user: "sara", start: "2026-08-03", end: "2026-08-14", status: A, createdAt: "2026-06-20", decidedAt: "2026-06-21" },
					{ user: "sara", start: "2026-10-19", end: "2026-10-23", status: A, reason: "Wedding", createdAt: "2026-09-02", decidedAt: "2026-09-02" },
					{ user: "sara", start: "2026-11-16", end: "2026-11-20", status: P, reason: "Conference, then a few days off", createdAt: "2026-10-14" },
					{ user: "sara", start: "2026-11-30T09:00", end: "2026-11-30T13:00", status: A, reason: "Dentist (half day)", createdAt: "2026-10-10", decidedAt: "2026-10-11" },
					{ user: "mehdi", start: "2026-09-07", end: "2026-09-11", status: A, createdAt: "2026-08-10", decidedAt: "2026-08-11" },
					{ user: "mehdi", start: "2026-10-26", end: "2026-10-30", status: P, reason: "Moving apartments", createdAt: "2026-10-09" },
					{ user: "mehdi", start: "2026-12-28", end: "2027-01-01", status: P, createdAt: "2026-10-16" },
					{ user: "julia", start: "2026-07-06", end: "2026-07-10", status: R, createdAt: "2026-06-15", decidedAt: "2026-06-16",
						comment: "Two new hires start that week and need onboarding coverage." },
					{ user: "julia", start: "2026-10-12", end: "2026-10-16", status: A, reason: "Hiking trip", createdAt: "2026-09-01", decidedAt: "2026-09-02" },
					{ user: "julia", start: "2026-11-03", end: "2026-11-05", status: P, reason: "Medical follow-up and recovery", createdAt: "2026-10-15" },
					{ user: "tom", start: "2026-08-17", end: "2026-08-28", status: A, reason: "Summer break", createdAt: "2026-07-01", decidedAt: "2026-07-02" },
					{ user: "tom", start: "2026-10-20", end: "2026-10-21", status: P, reason: "Personal errands", createdAt: "2026-10-13" },
					{ user: "tom", start: "2026-11-23", end: "2026-11-27", status: A, createdAt: "2026-09-20", decidedAt: "2026-09-21" },
					{ user: "aya", start: "2026-09-21", end: "2026-09-25", status: R, reason: "Visiting family", createdAt: "2026-09-05", decidedAt: "2026-09-06",
						comment: "Quarter close — we need the full team that week. Happy to approve the week after." },
					{ user: "aya", start: "2026-10-14", end: "2026-10-20", status: A, reason: "Trip to Kyoto", createdAt: "2026-08-30", decidedAt: "2026-08-31" },
					{ user: "aya", start: "2026-12-07", end: "2026-12-11", status: P, createdAt: "2026-10-17" },
					{ user: "diego", start: "2026-06-22", end: "2026-07-03", status: A, reason: "Summer holidays", createdAt: "2026-05-12", decidedAt: "2026-05-13" },
					{ user: "diego", start: "2026-10-05", end: "2026-10-09", status: A, createdAt: "2026-09-10", decidedAt: "2026-09-10" },
					{ user: "diego", start: "2026-11-09", end: "2026-11-13", status: P, reason: "Ski trip", createdAt: "2026-10-11" },
				],
			},
			{
				name: "Paris", timezone: "Europe/Paris", reviewer: "camille",
				users: [
					{ key: "camille", name: "Camille Martin", email: "camille@acme.io", role: Role.Validator },
					{ key: "hugo", name: "Hugo Petit", email: "hugo@acme.io", role: Role.OfficeAdmin },
					{ key: "louis", name: "Louis Bernard", email: "louis@acme.io", role: Role.Requester },
					{ key: "chloe", name: "Chloé Dubois", email: "chloe@acme.io", role: Role.Requester },
				],
				requests: [
					{ user: "louis", start: "2026-11-09", end: "2026-11-13", status: P, reason: "Toussaint catch-up", createdAt: "2026-10-12" },
					{ user: "chloe", start: "2026-10-26", end: "2026-10-30", status: A, createdAt: "2026-09-28", decidedAt: "2026-09-29" },
				],
			},
		],
	},
	{
		name: "Globex", slug: "globex",
		offices: [
			{
				name: "Montreal", timezone: "America/Toronto", reviewer: "marie",
				users: [
					{ key: "ethan", name: "Ethan Roy", email: "ethan@globex.com", role: Role.OfficeAdmin },
					{ key: "marie", name: "Marie Tremblay", email: "marie@globex.com", role: Role.Validator },
					{ key: "liam", name: "Liam Gagnon", email: "liam@globex.com", role: Role.Requester },
					{ key: "zoe", name: "Zoé Côté", email: "zoe@globex.com", role: Role.Requester },
				],
				requests: [
					{ user: "liam", start: "2026-11-16", end: "2026-11-20", status: P, reason: "Family trip", createdAt: "2026-10-14" },
					{ user: "zoe", start: "2026-12-21", end: "2026-12-24", status: A, reason: "Holidays", createdAt: "2026-10-01", decidedAt: "2026-10-02" },
				],
			},
		],
	},
];

/** "2026-11-30" → the given hour that day; "2026-11-30T13:00" → that time. Interpreted in the office zone. */
const toInstant = (value: string, defaultTime: string, zone: string): Date => {
	const [date, time] = value.split("T");
	return DateTime.fromISO(`${shift(date)}T${time ?? defaultTime}`, { zone }).toJSDate();
};

const run = async () => {
	await dataSource.initialize();
	const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

	await dataSource.transaction(async (tx) => {
		await tx.query(`TRUNCATE audit_log, vacation_requests, users, offices, workspaces RESTART IDENTITY CASCADE`);

		for (const ws of WORKSPACES) {
			const workspace = await tx.save(tx.create(Workspace, { name: ws.name, slug: ws.slug }));

			for (const officeSeed of ws.offices) {
				const office = await tx.save(tx.create(Office, {
					workspaceId: workspace.id,
					name: officeSeed.name,
					timezone: officeSeed.timezone,
					...(officeSeed.workDays ? { workDays: officeSeed.workDays } : {}),
				}));

				const users = new Map<string, User>();
				for (const u of officeSeed.users) {
					const user = await tx.save(tx.create(User, { officeId: office.id, name: u.name, email: u.email, role: u.role, password: passwordHash }));
					users.set(u.key, user);
				}

				for (const r of officeSeed.requests) {
					const decided = r.status !== VacationStatus.Pending;
					await tx.save(tx.create(VacationRequest, {
						userId: users.get(r.user)!.id,
						startDate: toInstant(r.start, "09:00", officeSeed.timezone),
						endDate: toInstant(r.end, "18:00", officeSeed.timezone),
						reason: r.reason ?? null,
						status: r.status,
						comments: r.comment ?? null,
						decidedById: decided ? users.get(officeSeed.reviewer)!.id : null,
						decidedAt: decided ? toInstant(r.decidedAt!, "10:00", officeSeed.timezone) : null,
						createdAt: toInstant(r.createdAt, "09:30", officeSeed.timezone),
					}));
				}
			}
		}
	});

	const counts = await dataSource.query(
		`SELECT (SELECT count(*) FROM workspaces) AS workspaces, (SELECT count(*) FROM offices) AS offices,
		        (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM vacation_requests) AS requests`);
	console.log(`[seed] Done (dates shifted by ${weekShift} week(s)):`, counts[0]);
	console.log(`[seed] Demo password for every user: ${DEMO_PASSWORD}`);
	await dataSource.destroy();
};

run().catch(async (err) => {
	console.error("[seed] Failed:", err);
	if (dataSource.isInitialized) await dataSource.destroy();
	process.exit(1);
});
