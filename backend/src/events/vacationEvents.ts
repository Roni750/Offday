import { DomainEvent } from "../core/DomainEvent";

interface RequestPeriod {
	userId: number;
	startDate: string;
	endDate: string;
}

abstract class VacationRequestEvent<P extends object = RequestPeriod> extends DomainEvent<P> {
	readonly entityType = "VacationRequest";
}

export class VacationRequestCreatedEvent extends VacationRequestEvent {
	readonly type = "VacationRequestCreated";
}

export class VacationRequestUpdatedEvent extends VacationRequestEvent<RequestPeriod & { previous: { startDate: string; endDate: string } }> {
	readonly type = "VacationRequestUpdated";
}

export class VacationRequestWithdrawnEvent extends VacationRequestEvent {
	readonly type = "VacationRequestWithdrawn";
}

export class VacationRequestApprovedEvent extends VacationRequestEvent {
	readonly type = "VacationRequestApproved";
}

export class VacationRequestRejectedEvent extends VacationRequestEvent<RequestPeriod & { comment: string }> {
	readonly type = "VacationRequestRejected";
}
