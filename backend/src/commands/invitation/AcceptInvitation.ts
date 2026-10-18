import { EntityManager } from "typeorm";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { Invitation } from "../../domain/Invitation";
import { User } from "../../domain/User";
import { InvitationAcceptedEvent } from "../../events/invitationEvents";
import { assertCanAccept, withEmailTakenGuard } from "./invitationRules";

/**
 * Creates an account through an invite link. Carries the token's hash, never the token, and a bcrypt hash of
 * the password computed before the transaction (so the row lock isn't held while bcrypt runs).
 */
export class AcceptInvitationCommand extends Command<User> {
	constructor(
		readonly tokenHash: Buffer,
		readonly name: string,
		readonly email: string,
		readonly passwordHash: string,
	) {
		super();
	}
}

export class AcceptInvitationHandler implements CommandHandler<AcceptInvitationCommand, User> {
	async execute(cmd: AcceptInvitationCommand, tx: EntityManager): Promise<CommandOutcome<User>> {
		// Re-checked under the row lock: the link may have been used up, revoked or expired since the pre-check.
		const { invitation } = await assertCanAccept(tx, cmd.tokenHash, cmd.email, { lock: true });

		// Office and role come from the link, never from the request.
		const user = await withEmailTakenGuard(() => tx.save(tx.create(User, {
			officeId: invitation.officeId,
			name: cmd.name,
			email: cmd.email,
			password: cmd.passwordHash,
			role: invitation.role,
		})));

		await tx.createQueryBuilder()
			.update(Invitation)
			.set({ useCount: () => "use_count + 1" })
			.where("id = :id", { id: invitation.id })
			.execute();

		return {
			result: user,
			events: [new InvitationAcceptedEvent(invitation.officeId, user.id, invitation.id, {
				userId: user.id,
				email: user.email,
				role: user.role,
			})],
		};
	}
}
