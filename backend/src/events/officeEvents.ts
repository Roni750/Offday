import { DomainEvent } from "../core/DomainEvent";
import { Role } from "../domain/enums";

export class UserRoleChangedEvent extends DomainEvent<{ from: Role; to: Role }> {
	readonly type = "UserRoleChanged";
	readonly entityType = "User";
}

export class OfficeTimezoneChangedEvent extends DomainEvent<{ from: string; to: string }> {
	readonly type = "OfficeTimezoneChanged";
	readonly entityType = "Office";
}

export class OfficeWorkWeekChangedEvent extends DomainEvent<{ from: number[]; to: number[] }> {
	readonly type = "OfficeWorkWeekChanged";
	readonly entityType = "Office";
}
