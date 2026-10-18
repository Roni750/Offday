import { DomainEvent } from "../core/DomainEvent";
import { Role } from "../domain/enums";
import type { InvitationKind } from "../domain/Invitation";

/** Payloads never carry the token or its hash: the audit log records who and what, not the credential. */

abstract class InvitationEvent<P extends object> extends DomainEvent<P> {
	readonly entityType = "Invitation";
}

export class InvitationCreatedEvent extends InvitationEvent<{
	kind: InvitationKind;
	role: Role;
	email: string | null;
	maxUses: number;
	expiresAt: string;
	label: string | null;
}> {
	readonly type = "InvitationCreated";
}

export class InvitationRevokedEvent extends InvitationEvent<{ useCount: number; maxUses: number }> {
	readonly type = "InvitationRevoked";
}

/** Raised by the new user (the actor) when they create their account through the link. */
export class InvitationAcceptedEvent extends InvitationEvent<{ userId: number; email: string; role: Role }> {
	readonly type = "InvitationAccepted";
}
