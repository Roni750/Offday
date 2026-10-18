import { DomainEvent } from "../core/DomainEvent";

interface RequestPeriod {
	userId: number;
	startDate: string;
	endDate: string;
	/** Set when the request belongs to a trip (decisions.md #15). */
	groupId?: number;
}

abstract class VacationRequestEvent<P extends object = RequestPeriod> extends DomainEvent<P> {
	readonly entityType = "VacationRequest";
}

export class VacationRequestCreatedEvent extends VacationRequestEvent<RequestPeriod & { addedBy?: number }> {
	readonly type = "VacationRequestCreated";
}

export class VacationRequestUpdatedEvent extends VacationRequestEvent<RequestPeriod & { previous: { startDate: string; endDate: string } }> {
	readonly type = "VacationRequestUpdated";
}

export class VacationRequestWithdrawnEvent extends VacationRequestEvent<RequestPeriod & { scope?: "self" | "group" }> {
	readonly type = "VacationRequestWithdrawn";
}

export class VacationRequestApprovedEvent extends VacationRequestEvent {
	readonly type = "VacationRequestApproved";
}

export class VacationRequestRejectedEvent extends VacationRequestEvent<RequestPeriod & { comment: string }> {
	readonly type = "VacationRequestRejected";
}

// ---- Trips (vacation with colleagues) ----

export class VacationGroupCreatedEvent extends DomainEvent<{ organizerId: number; memberIds: number[]; startDate: string; endDate: string }> {
	readonly type = "VacationGroupCreated";
	readonly entityType = "VacationGroup";
}

/** A colleague was put on a trip by its organizer. They weren't asked, so they should hear about it. */
export class ColleagueAddedToVacationEvent extends VacationRequestEvent<RequestPeriod & { groupId: number; addedBy: number }> {
	readonly type = "ColleagueAddedToVacation";
}

/** A colleague withdrew their own row of a trip; the rest of the trip stays. */
export class ColleagueLeftVacationEvent extends VacationRequestEvent<RequestPeriod & { groupId: number }> {
	readonly type = "ColleagueLeftVacation";
}
