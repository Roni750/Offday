import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { generateInviteToken, hashInviteToken } from "../../auth/inviteTokens";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { Role } from "../../domain/enums";
import { Invitation, invitationKind } from "../../domain/Invitation";
import { InvitationCreatedEvent } from "../../events/invitationEvents";
import { assertWorkspaceAdmin, findManagedOffice } from "../office/officeAccess";

/** A normalized link request (the inputParser applied the defaults and the personal/team rules). */
export interface InvitationSpec {
	role: Role;
	/** Personal links only. */
	email: string | null;
	maxUses: number;
	expiresInDays: number;
	label: string | null;
}

export interface CreatedInvitation {
	invitation: Invitation;
	/** The raw token. Returned to the creator once and never stored. */
	token: string;
}

export class CreateInvitationCommand extends Command<CreatedInvitation> {
	constructor(readonly actor: Actor, readonly officeId: number, readonly spec: InvitationSpec) {
		super();
	}
}

const DAY_MS = 86_400_000;

/** Workspace admins create links for any office of their workspace. */
export class CreateInvitationHandler implements CommandHandler<CreateInvitationCommand, CreatedInvitation> {
	async execute(cmd: CreateInvitationCommand, tx: EntityManager): Promise<CommandOutcome<CreatedInvitation>> {
		assertWorkspaceAdmin(cmd.actor, "create invite links");
		const office = await findManagedOffice(tx, cmd.actor, cmd.officeId);

		const token = generateInviteToken();
		// Both timestamps come from one clock reading, so the expiry window checks compare like with like.
		const createdAt = new Date();
		const { spec } = cmd;
		const invitation = await tx.save(tx.create(Invitation, {
			officeId: office.id,
			createdById: cmd.actor.id,
			role: spec.role,
			tokenHash: hashInviteToken(token),
			label: spec.label,
			email: spec.email,
			maxUses: spec.maxUses,
			useCount: 0,
			expiresAt: new Date(createdAt.getTime() + spec.expiresInDays * DAY_MS),
			revokedAt: null,
			revokedById: null,
			createdAt,
		}));

		return {
			result: { invitation, token },
			events: [new InvitationCreatedEvent(office.id, cmd.actor.id, invitation.id, {
				kind: invitationKind(invitation),
				role: invitation.role,
				email: invitation.email,
				maxUses: invitation.maxUses,
				expiresAt: invitation.expiresAt.toISOString(),
				label: invitation.label,
			})],
		};
	}
}
