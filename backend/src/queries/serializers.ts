import { Actor } from "../auth/Actor";
import { OfficeCalendar, countWorkingDays } from "../domain/officeTime";
import { Office } from "../domain/Office";
import { User } from "../domain/User";
import { VacationRequest } from "../domain/VacationRequest";
import { VacationStatus } from "../domain/enums";

/** Response shapes from docs/api-contract.md. Entities are never returned directly. */

export const toMe = (actor: Actor) => ({
	id: actor.id,
	name: actor.name,
	email: actor.email,
	role: actor.role,
	office: { id: actor.officeId, name: actor.officeName, timezone: actor.timezone, workDays: actor.workDays },
	workspace: { id: actor.workspaceId, name: actor.workspaceName },
});

export const toUserSummary = (user: User) => ({ id: user.id, name: user.name, email: user.email, role: user.role });

export const toOffice = (office: Office, workspace: { id: number; name: string }) => ({
	id: office.id,
	name: office.name,
	timezone: office.timezone,
	workDays: office.workDays,
	workspace,
});

/** A trip's people, loaded for a whole page at once (see loadTrips). */
export interface TripSummary {
	id: number;
	organizer: { id: number; name: string } | null;
	members: { userId: number; name: string; requestId: number; status: VacationStatus }[];
}

/**
 * Expects `user`, `decidedBy` and `addedBy` relations to be loaded. `trips` holds the trips of the rows being
 * serialized (one batched query per page); a row whose trip isn't in it is serialized with `group: null`.
 */
export const toVacationRequest = (r: VacationRequest, calendar: OfficeCalendar, trips?: ReadonlyMap<number, TripSummary>) => ({
	id: r.id,
	user: { id: r.user.id, name: r.user.name, email: r.user.email },
	startDate: r.startDate.toISOString(),
	endDate: r.endDate.toISOString(),
	reason: r.reason,
	status: r.status,
	comments: r.comments,
	days: countWorkingDays(r.startDate, r.endDate, calendar),
	decidedBy: r.decidedBy ? { id: r.decidedBy.id, name: r.decidedBy.name } : null,
	decidedAt: r.decidedAt?.toISOString() ?? null,
	addedBy: r.addedBy ? { id: r.addedBy.id, name: r.addedBy.name } : null,
	group: (r.groupId && trips?.get(r.groupId)) || null,
	createdAt: r.createdAt.toISOString(),
	updatedAt: r.updatedAt.toISOString(),
});
