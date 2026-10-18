import { DateTime } from "luxon";
import { Brackets, EntityManager } from "typeorm";
import { Actor } from "../auth/Actor";
import { VacationStatus } from "../domain/enums";
import { OfficeCalendar, countWorkingDays } from "../domain/officeTime";
import { User } from "../domain/User";
import { VacationRequest } from "../domain/VacationRequest";
import { toUserSummary, toVacationRequest } from "./serializers";

/**
 * Read side. Queries don't change state, so they don't go through the command bus or emit events.
 * Every query is scoped to the caller's office (taken from the Actor, i.e. the database).
 */

export const ANNUAL_ALLOWANCE_DAYS = 25;

interface Page { page: number; pageSize: number }

const requestsQuery = (em: EntityManager) =>
	em.createQueryBuilder(VacationRequest, "r")
		.innerJoinAndSelect("r.user", "u")
		.leftJoinAndSelect("r.decidedBy", "d");

const paginate = async (query: ReturnType<typeof requestsQuery>, { page, pageSize }: Page, calendar: OfficeCalendar) => {
	// offset/limit (not skip/take) is safe here: every join is many-to-one, so rows aren't duplicated.
	const [rows, total] = await query.offset((page - 1) * pageSize).limit(pageSize).getManyAndCount();
	return { items: rows.map((r) => toVacationRequest(r, calendar)), total, page, pageSize };
};

/** Tab counts per status for a query, before its status filter is applied. */
const countByStatus = async (query: ReturnType<typeof requestsQuery>) => {
	const rows: { status: VacationStatus; count: string }[] = await query.clone()
		.select("r.status", "status").addSelect("COUNT(*)", "count")
		.groupBy("r.status").orderBy().getRawMany();
	const counts = { all: 0, Pending: 0, Approved: 0, Rejected: 0 };
	for (const row of rows) {
		counts[row.status] = Number(row.count);
		counts.all += Number(row.count);
	}
	return counts;
};

export const listMyRequests = async (em: EntityManager, actor: Actor, filter: Page & { status?: VacationStatus }) => {
	const query = requestsQuery(em).where("r.user_id = :userId", { userId: actor.id });
	const counts = await countByStatus(query);
	if (filter.status) query.andWhere("r.status = :status", { status: filter.status });
	return { ...(await paginate(query.orderBy("r.start_date", "DESC"), filter, actor)), counts };
};

export const listOfficeRequests = async (
	em: EntityManager,
	actor: Actor,
	filter: Page & { status?: VacationStatus; userId?: number },
) => {
	const query = requestsQuery(em).where("u.office_id = :officeId", { officeId: actor.officeId });
	if (filter.userId) query.andWhere("r.user_id = :userId", { userId: filter.userId });

	// Tab counts respect the employee filter but not the status filter.
	const counts = await countByStatus(query);

	if (filter.status) query.andWhere("r.status = :status", { status: filter.status });
	// Pending first, then newest.
	query.orderBy(`CASE WHEN r.status = '${VacationStatus.Pending}' THEN 0 ELSE 1 END`, "ASC").addOrderBy("r.created_at", "DESC");

	// What the reviewer can act on: Pending requests of the office, excluding their own (rule 6).
	const awaitingMyReview = await em.createQueryBuilder(VacationRequest, "r")
		.innerJoin("r.user", "u")
		.where("u.office_id = :officeId", { officeId: actor.officeId })
		.andWhere("r.status = :pending", { pending: VacationStatus.Pending })
		.andWhere("r.user_id <> :me", { me: actor.id })
		.getCount();

	return { ...(await paginate(query, filter, actor)), counts, awaitingMyReview };
};

/** Pending and Approved requests of the caller's office that overlap [from, to). */
export const getTeamCalendar = async (em: EntityManager, actor: Actor, from: Date, to: Date) => {
	const users = await em.find(User, { where: { officeId: actor.officeId }, order: { name: "ASC" } });
	const requests = await requestsQuery(em)
		.where("u.office_id = :officeId", { officeId: actor.officeId })
		.andWhere("r.status <> :rejected", { rejected: VacationStatus.Rejected })
		.andWhere(new Brackets((q) => q.where("r.start_date < :to", { to }).andWhere("r.end_date > :from", { from })))
		.orderBy("r.start_date", "ASC")
		.getMany();
	return { users: users.map(toUserSummary), requests: requests.map((r) => toVacationRequest(r, actor)) };
};

const yearRange = (year: number, timezone: string) => {
	const start = DateTime.fromObject({ year, month: 1, day: 1 }, { zone: timezone });
	return { start: start.toJSDate(), end: start.plus({ years: 1 }).toJSDate() };
};

/** Days are attributed to the year the request starts in (office time). */
export const getBalance = async (em: EntityManager, actor: Actor, year: number) => {
	const { start, end } = yearRange(year, actor.timezone);
	const requests = await em.createQueryBuilder(VacationRequest, "r")
		.where("r.user_id = :userId", { userId: actor.id })
		.andWhere("r.status <> :rejected", { rejected: VacationStatus.Rejected })
		.andWhere("r.start_date >= :start AND r.start_date < :end", { start, end })
		.getMany();

	const sum = (status: VacationStatus) => requests
		.filter((r) => r.status === status)
		.reduce((total, r) => total + countWorkingDays(r.startDate, r.endDate, actor), 0);
	const usedDays = sum(VacationStatus.Approved);
	const pendingDays = sum(VacationStatus.Pending);

	const pendingRequests = requests.filter((r) => r.status === VacationStatus.Pending).length;

	return { year, allowance: ANNUAL_ALLOWANCE_DAYS, usedDays, pendingDays, pendingRequests, remainingDays: ANNUAL_ALLOWANCE_DAYS - usedDays };
};

/**
 * Validator dashboard. Aggregated in memory over one office's requests for the period, which is fine at
 * office scale; a large tenant would move this to SQL aggregates or a read model updated by events.
 */
export const getOverview = async (em: EntityManager, actor: Actor, year: number) => {
	const tz = actor.timezone;
	const now = DateTime.now().setZone(tz);
	// Chart window: 3 months back, the current month and 2 ahead, so upcoming requests are visible.
	const firstMonth = now.startOf("month").minus({ months: 3 });
	const { start: yearStart, end: yearEnd } = yearRange(year, tz);
	const from = new Date(Math.min(yearStart.getTime(), firstMonth.toMillis()));

	const requests = await em.createQueryBuilder(VacationRequest, "r")
		.innerJoin("r.user", "u")
		.where("u.office_id = :officeId", { officeId: actor.officeId })
		.andWhere(new Brackets((q) => q.where("r.start_date >= :from", { from }).orWhere("r.status = :pending", { pending: VacationStatus.Pending })))
		.getMany();
	const teamSize = await em.count(User, { where: { officeId: actor.officeId } });

	const days = (r: VacationRequest) => countWorkingDays(r.startDate, r.endDate, actor);
	const inYear = requests.filter((r) => r.startDate >= yearStart && r.startDate < yearEnd);
	const pending = requests.filter((r) => r.status === VacationStatus.Pending);
	// "Awaiting review" counts what the viewer can decide: not their own requests (rule 6).
	const awaitingReview = pending.filter((r) => r.userId !== actor.id);
	const approvedInYear = inYear.filter((r) => r.status === VacationStatus.Approved);
	const decidedInYear = inYear.filter((r) => r.status !== VacationStatus.Pending);

	const windowEnd = now.plus({ days: 14 }).toJSDate();
	const outSoon = new Set(requests
		.filter((r) => r.status === VacationStatus.Approved && r.startDate < windowEnd && r.endDate > now.toJSDate())
		.map((r) => r.userId));

	const monthly = Array.from({ length: 6 }, (_, i) => {
		const month = firstMonth.plus({ months: i });
		const inMonth = requests.filter((r) => DateTime.fromJSDate(r.startDate, { zone: tz }).hasSame(month, "month"));
		const total = (status: VacationStatus) => inMonth.filter((r) => r.status === status).reduce((sum, r) => sum + days(r), 0);
		return {
			month: month.toFormat("yyyy-MM"),
			approved: total(VacationStatus.Approved),
			pending: total(VacationStatus.Pending),
			rejected: total(VacationStatus.Rejected),
		};
	});

	const oldestPending = awaitingReview.reduce<Date | null>((oldest, r) => (!oldest || r.createdAt < oldest ? r.createdAt : oldest), null);

	return {
		pendingCount: awaitingReview.length,
		oldestPendingCreatedAt: oldestPending?.toISOString() ?? null,
		approvalRate: decidedInYear.length ? approvedInYear.length / decidedInYear.length : null,
		approvedDays: approvedInYear.reduce((sum, r) => sum + days(r), 0),
		approvedPeople: new Set(approvedInYear.map((r) => r.userId)).size,
		outNext14Days: outSoon.size,
		teamSize,
		monthly,
	};
};
