import { Brackets, EntityManager, QueryFailedError } from "typeorm";
import { Actor } from "../../auth/Actor";
import { ForbiddenError, InvalidStateError, NotFoundError, OverlapError, ValidationError } from "../../core/errors";
import { REVIEWER_ROLES, VacationStatus } from "../../domain/enums";
import { countWorkingDays, startsAfterOfficeToday } from "../../domain/officeTime";
import { User } from "../../domain/User";
import { VacationRequest } from "../../domain/VacationRequest";

/** Domain rules shared by the vacation-request command handlers. Everything here may use the database. */

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

/** Rule 2: finds a Pending/Approved request of the same user whose [start, end) range overlaps. */
export const findOverlap = (tx: EntityManager, userId: number, start: Date, end: Date, excludeId?: number) => {
	const query = tx.createQueryBuilder(VacationRequest, "r")
		.where("r.user_id = :userId", { userId })
		.andWhere("r.status <> :rejected", { rejected: VacationStatus.Rejected })
		.andWhere(new Brackets((q) => q.where("r.start_date < :end", { end }).andWhere("r.end_date > :start", { start })));
	if (excludeId) query.andWhere("r.id <> :excludeId", { excludeId });
	return query.orderBy("r.start_date", "ASC").getOne();
};

const overlapError = (conflict: VacationRequest) =>
	new OverlapError("This request overlaps another one of yours", {
		conflict: {
			id: conflict.id,
			startDate: conflict.startDate.toISOString(),
			endDate: conflict.endDate.toISOString(),
			status: conflict.status,
		},
	});

export const assertNoOverlap = async (tx: EntityManager, userId: number, start: Date, end: Date, excludeId?: number) => {
	const conflict = await findOverlap(tx, userId, start, end, excludeId);
	if (conflict) throw overlapError(conflict);
};

const isExclusionViolation = (err: unknown): boolean =>
	err instanceof QueryFailedError && (err.driverError as { code?: string })?.code === "23P01";

/**
 * Runs a write that could hit the vacation_no_overlap constraint. The constraint catches what the
 * app-level check can't: two overlapping submissions arriving at the same moment.
 */
export const withOverlapGuard = async <T>(write: () => Promise<T>): Promise<T> => {
	try {
		return await write();
	} catch (err) {
		if (isExclusionViolation(err)) {
			throw new OverlapError("This request overlaps another one of yours (submitted at the same time)");
		}
		throw err;
	}
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

/** Requests of other users are reported as not found, so ids of other people's requests aren't revealed. */
export const lockOwnRequest = async (tx: EntityManager, id: number, actor: Actor): Promise<VacationRequest> => {
	const request = await lockRequest(tx, id);
	if (request.userId !== actor.id) throw new NotFoundError("Request not found");
	return request;
};

/** Rule 3: only Pending requests can be changed by their owner. */
export const assertPending = (request: VacationRequest, action: string): void => {
	if (request.status !== VacationStatus.Pending) {
		throw new InvalidStateError(`${request.status} requests can't be ${action}`);
	}
};

/**
 * Rule 6, checked against the role loaded from the database for this request (not the token):
 * reviewers only, same office only, never their own request.
 */
export const lockRequestForReview = async (tx: EntityManager, id: number, actor: Actor): Promise<VacationRequest> => {
	if (!REVIEWER_ROLES.includes(actor.role)) throw new ForbiddenError("Only validators can approve or reject requests");

	const request = await lockRequest(tx, id);
	const owner = await tx.findOneBy(User, { id: request.userId });
	if (!owner || owner.officeId !== actor.officeId) throw new NotFoundError("Request not found");
	if (owner.id === actor.id) throw new ForbiddenError("You can't decide on your own request");

	assertPending(request, "decided again");
	return request;
};

export const periodPayload = (request: VacationRequest) => ({
	userId: request.userId,
	startDate: request.startDate.toISOString(),
	endDate: request.endDate.toISOString(),
});
