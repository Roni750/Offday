import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { NotFoundError } from "../../core/errors";
import { Invitation } from "../../domain/Invitation";
import { InvitationRevokedEvent } from "../../events/invitationEvents";
import { assertWorkspaceAdmin, findManagedOffice } from "../office/officeAccess";

export class RevokeInvitationCommand extends Command<void> {
	constructor(readonly actor: Actor, readonly officeId: number, readonly invitationId: number) {
		super();
	}
}

/**
 * Stops a link from working. Idempotent: revoking a revoked link changes nothing and records nothing.
 * The row is locked, so a revoke and an accept of the same link run one after the other.
 */
export class RevokeInvitationHandler implements CommandHandler<RevokeInvitationCommand, void> {
	async execute(cmd: RevokeInvitationCommand, tx: EntityManager): Promise<CommandOutcome<void>> {
		assertWorkspaceAdmin(cmd.actor, "revoke invite links");
		const office = await findManagedOffice(tx, cmd.actor, cmd.officeId);

		const invitation = await tx.findOne(Invitation, {
			where: { id: cmd.invitationId, officeId: office.id },
			lock: { mode: "pessimistic_write" },
		});
		if (!invitation) throw new NotFoundError("Invite link not found");
		if (invitation.revokedAt) return { result: undefined, events: [] };

		await tx.update(Invitation, { id: invitation.id }, { revokedAt: new Date(), revokedById: cmd.actor.id });

		return {
			result: undefined,
			events: [new InvitationRevokedEvent(office.id, cmd.actor.id, invitation.id, {
				useCount: invitation.useCount,
				maxUses: invitation.maxUses,
			})],
		};
	}
}
