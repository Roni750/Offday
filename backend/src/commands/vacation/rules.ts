import { Brackets, EntityManager, QueryFailedError } from "typeorm";
import { Actor } from "../../auth/Actor";
import { ForbiddenError, InvalidStateError, NotFoundError, OverlapError, ValidationError } from "../../core/errors";
import { REVIEWER_ROLES, VacationStatus } from "../../domain/enums";
import { countWorkingDays, startsAfterOfficeToday } from "../../domain/officeTime";
import { formatDayRange, formatSpan, listNames } from "../../domain/periodText";
import { User } from "../../domain/User";
import { VacationGroup } from "../../domain/VacationGroup";
import { VacationRequest } from "../../domain/VacationRequest";

/** Domain rules shared by the vacation-request command handlers. Everything here may use the database. */

/** At most 9 colleagues, so 10 people per trip (decisions.md #15). */
export const MAX_COLLEAGUES = 9;

/** Rule 4, in office time. The inputParser already rejected starts in the past; "today" needs the office zone. */
export const assertStartsAfterToday = (start: Date, actor: Actor): void => {
	if (!startsAfterOfficeToday(start, actor.timezone)) {
		throw new ValidationError("Requests must start after today", { startDate: "Must be after today (office time)" });
	}
};

/** A request must use at least one of the office's working days (a weekend-only request is pointless). */
export const assertIncludesWorkingDay = (start: Date, end: Date, actor: Actor): void => {
	if (countWorkingDays(start, end, actor) === 0) {
		throw new ValidationError("A request must include at least one working day", {
			endDate: "These dates don't include any working day in your office",
		});
	}
};

const overlapping = (start: Date, end: Date) =>
	new Brackets((q) => q.where("r.start_date < :end", { end }).andWhere("r.end_date > :start", { start }));

/**
 * Rule 2: finds a Pending/Approved request of the same user whose [start, end) range overlaps,
 * trip rows included (the requester's own rule doesn't change for trips).
 */
export const findOverlap = (tx: EntityManager, userId: number, start: Date, end: Date, excludeId?: number) => {
	const query = tx.createQueryBuilder(VacationRequest, "r")
		.where("r.user_id = :userId", { userId })
		.andWhere("r.status <> :rejected", { rejected: VacationStatus.Rejected })
		.andWhere(overlapping(start, end));
	if (excludeId) query.andWhere("r.id <> :excludeId", { excludeId });
	return query.orderBy("r.start_date", "ASC").getOne();
};

export const toConflict = (conflict: VacationRequest) => ({
	id: conflict.id,
	startDate: conflict.startDate.toISOString(),
	endDate: conflict.endDate.toISOString(),
	status: conflict.status,
});

const overlapError = (conflict: VacationRequest) =>
	new OverlapError("This request overlaps another one of yours", { conflict: toConflict(conflict) });

export const assertNoOverlap = async (tx: EntityManager, userId: number, start: Date, end: Date, excludeId?: number) => {
	const conflict = await findOverlap(tx, userId, start, end, excludeId);
	if (conflict) throw overlapError(conflict);
};

const isExclusionViolation = (err: unknown): boolean =>
	err instanceof QueryFailedError && (err.driverError as { code?: string })?.code === "23P01";

/**
 * Runs a write that could hit an overlap exclusion constraint. The constraints catch what the app-level checks
 * can't: two overlapping writes arriving at the same moment. The 23P01 becomes the same 409 a pre-check returns.
 */
export const withOverlapGuard = async <T>(
	write: () => Promise<T>,
	message = "This request overlaps another one of yours (submitted at the same time)",
): Promise<T> => {
	try {
		return await write();
	} catch (err) {
		if (isExclusionViolation(err)) throw new OverlapError(message);
		throw err;
	}
};

/**
 * Row-locks users in ascending id order, in one statement (the rows are sorted before they're locked), so two
 * commands involving the same people can't deadlock. Serializes each person's creates and edits, which is what
 * makes the requester's own overlap check safe for trip rows (no constraint covers those).
 */
export const lockUsers = async (tx: EntityManager, ids: readonly number[]): Promise<User[]> => {
	if (!ids.length) return [];
	return tx.createQueryBuilder(User, "u")
		.where("u.id IN (:...ids)", { ids: [...new Set(ids)] })
		.orderBy("u.id", "ASC")
		// NO KEY UPDATE: serializes these commands without blocking foreign-key checks of unrelated writes.
		.setLock("for_no_key_update")
		.getMany();
};

/** A colleague's overlapping time off: an Approved one blocks them, a Pending one only warns (#15). */
export interface ParticipantConflict {
	userId: number;
	name: string;
	conflict: ReturnType<typeof toConflict>;
}

/**
 * The colleagues' Pending/Approved requests overlapping [start, end), in one query. Rows of `excludeGroupId`
 * (the trip being edited) don't count. Returns the first approved overlap of each blocked colleague, and the first
 * pending overlap of each colleague who isn't blocked.
 */
export const findColleagueOverlaps = async (
	tx: EntityManager,
	colleagues: readonly User[],
	start: Date,
	end: Date,
	excludeGroupId?: number,
): Promise<{ blocked: ParticipantConflict[]; warnings: ParticipantConflict[] }> => {
	if (!colleagues.length) return { blocked: [], warnings: [] };
	const query = tx.createQueryBuilder(VacationRequest, "r")
		.where("r.user_id IN (:...ids)", { ids: colleagues.map((c) => c.id) })
		.andWhere("r.status IN (:...statuses)", { statuses: [VacationStatus.Pending, VacationStatus.Approved] })
		.andWhere(overlapping(start, end));
	if (excludeGroupId) query.andWhere("(r.group_id IS NULL OR r.group_id <> :groupId)", { groupId: excludeGroupId });
	const rows = await query.orderBy("r.start_date", "ASC").addOrderBy("r.id", "ASC").getMany();

	const blocked: ParticipantConflict[] = [];
	const warnings: ParticipantConflict[] = [];
	// In the order the requester picked them, so the messages read the way the form shows them.
	for (const colleague of colleagues) {
		const own = rows.filter((r) => r.userId === colleague.id);
		const approved = own.find((r) => r.status === VacationStatus.Approved);
		const pending = own.find((r) => r.status === VacationStatus.Pending);
		if (approved) blocked.push({ userId: colleague.id, name: colleague.name, conflict: toConflict(approved) });
		else if (pending) warnings.push({ userId: colleague.id, name: colleague.name, conflict: toConflict(pending) });
	}
	return { blocked, warnings };
};

const range = (c: ParticipantConflict, timezone: string) =>
	formatDayRange(new Date(c.conflict.startDate), new Date(c.conflict.endDate), timezone);

/** "Dana Cohen can't join from 10 Oct to 20 Oct 2026: they already have approved time off 12–14 Oct." */
export const colleaguesBlockedError = (blocked: ParticipantConflict[], start: Date, end: Date, timezone: string) => {
	const span = formatSpan(start, end, timezone);
	const message = blocked.length === 1
		? `${blocked[0].name} can't join ${span}: they already have approved time off ${range(blocked[0], timezone)}.`
		: `${listNames(blocked.map((c) => `${c.name} (${range(c, timezone)})`))} can't join ${span}: they already have approved time off.`;
	return new OverlapError(message, { conflicts: blocked });
};

/**
 * Loads and row-locks a request for the rest of the transaction, so concurrent commands on the same
 * request (e.g. approve and reject at once) run one after the other and the second sees the new status.
 */
export const lockRequest = async (tx: EntityManager, id: number): Promise<VacationRequest> => {
	const request = await tx.findOne(VacationRequest, { where: { id }, lock: { mode: "pessimistic_write" } });
	if (!request) throw new NotFoundError("Request not found");
	return request;
};

/** Locks a trip's group row. The group is always locked before its request rows (one lock order, no deadlocks). */
export const lockGroup = async (tx: EntityManager, id: number): Promise<VacationGroup | null> =>
	tx.findOne(VacationGroup, { where: { id }, lock: { mode: "pessimistic_write" } });

/** Locks every request row of a trip, in id order. Call after {@link lockGroup}. */
export const lockGroupRows = (tx: EntityManager, groupId: number): Promise<VacationRequest[]> =>
	tx.createQueryBuilder(VacationRequest, "r")
		.where("r.group_id = :groupId", { groupId })
		.orderBy("r.id", "ASC")
		.setLock("pessimistic_write")
		.getMany();

export interface LockedRequest {
	request: VacationRequest;
	/** Set when the request is part of a trip; the group row is locked. */
	group: VacationGroup | null;
}

/**
 * Locks a request in the global lock order: a first unlocked read finds its trip, then the trip's group row is
 * locked, then the request row. A row's group never changes, so the first read can't be stale on that point.
 */
export const lockRequestInOrder = async (tx: EntityManager, id: number): Promise<LockedRequest> => {
	const peek = await tx.findOneBy(VacationRequest, { id });
	if (!peek) throw new NotFoundError("Request not found");
	const group = peek.groupId ? await lockGroup(tx, peek.groupId) : null;
	return { request: await lockRequest(tx, id), group };
};

/** Requests of other users are reported as not found, so ids of other people's requests aren't revealed. */
export const lockOwnRequest = async (tx: EntityManager, id: number, actor: Actor): Promise<LockedRequest> => {
	const locked = await lockRequestInOrder(tx, id);
	if (locked.request.userId !== actor.id) throw new NotFoundError("Request not found");
	return locked;
};

/** Rule 3: only Pending requests can be changed by their owner. */
export const assertPending = (request: VacationRequest, action: string): void => {
	if (request.status !== VacationStatus.Pending) {
		throw new InvalidStateError(`${request.status} requests can't be ${action}`);
	}
};

/** Deletes a trip's group row once none of its requests is left. */
export const deleteGroupIfEmpty = async (tx: EntityManager, groupId: number): Promise<void> => {
	const remaining = await tx.countBy(VacationRequest, { groupId });
	if (remaining === 0) await tx.delete(VacationGroup, { id: groupId });
};

export const assertReviewer = (actor: Actor): void => {
	if (!REVIEWER_ROLES.includes(actor.role)) throw new ForbiddenError("Only validators can approve or reject requests");
};

/** Product decision 4 (#15): a reviewer who is on a trip decides none of it. */
export const ON_TRIP_MESSAGE = "You're on this trip, so another validator has to decide it";

/**
 * Rule 6, checked against the role loaded from the database for this request (not the token):
 * reviewers only, same office only, never their own request, never a trip they're on.
 */
export const lockRequestForReview = async (
	tx: EntityManager,
	id: number,
	actor: Actor,
): Promise<LockedRequest & { owner: User }> => {
	assertReviewer(actor);

	const locked = await lockRequestInOrder(tx, id);
	const { request } = locked;
	const owner = await tx.findOneBy(User, { id: request.userId });
	if (!owner || owner.officeId !== actor.officeId) throw new NotFoundError("Request not found");
	if (owner.id === actor.id) throw new ForbiddenError("You can't decide on your own request");
	if (request.groupId) {
		const onTrip = await tx.existsBy(VacationRequest, { groupId: request.groupId, userId: actor.id });
		if (onTrip) throw new ForbiddenError(ON_TRIP_MESSAGE);
	}

	assertPending(request, "decided again");
	return { ...locked, owner };
};

/** Nobody has two overlapping approved requests (#15): finds the approved request that approving this one would overlap. */
export const findApprovedOverlap = (tx: EntityManager, request: VacationRequest) =>
	tx.createQueryBuilder(VacationRequest, "r")
		.where("r.user_id = :userId", { userId: request.userId })
		.andWhere("r.status = :approved", { approved: VacationStatus.Approved })
		.andWhere("r.id <> :id", { id: request.id })
		.andWhere(overlapping(request.startDate, request.endDate))
		.orderBy("r.start_date", "ASC")
		.getOne();

export const approvedOverlapMessage = (name: string) => `${name} already has approved time off that overlaps this request`;

export const periodPayload = (request: VacationRequest) => ({
	userId: request.userId,
	startDate: request.startDate.toISOString(),
	endDate: request.endDate.toISOString(),
	...(request.groupId ? { groupId: request.groupId } : {}),
});
