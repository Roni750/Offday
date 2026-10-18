import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { ForbiddenError, NotFoundError } from "../../core/errors";
import { Office } from "../../domain/Office";
import { Role } from "../../domain/enums";
import { User } from "../../domain/User";
import { UserRoleChangedEvent } from "../../events/officeEvents";
import { assertWorkspaceAdmin } from "./officeAccess";

export class ChangeUserRoleCommand extends Command<User> {
	constructor(readonly actor: Actor, readonly userId: number, readonly role: Role) {
		super();
	}
}

/**
 * Workspace admins manage roles in every office of their workspace. Changing their own role is blocked,
 * so an office can't lose its last admin by accident.
 */
export class ChangeUserRoleHandler implements CommandHandler<ChangeUserRoleCommand, User> {
	async execute(cmd: ChangeUserRoleCommand, tx: EntityManager): Promise<CommandOutcome<User>> {
		assertWorkspaceAdmin(cmd.actor, "change roles");
		if (cmd.userId === cmd.actor.id) throw new ForbiddenError("You can't change your own role");

		const user = await tx.findOne(User, { where: { id: cmd.userId }, lock: { mode: "pessimistic_write" } });
		// Users of another workspace look like missing users.
		const office = user ? await tx.findOneBy(Office, { id: user.officeId }) : null;
		if (!user || office?.workspaceId !== cmd.actor.workspaceId) throw new NotFoundError("User not found");

		const from = user.role;
		if (from === cmd.role) return { result: user, events: [] };

		user.role = cmd.role;
		const saved = await tx.save(user);

		return {
			result: saved,
			events: [new UserRoleChangedEvent(user.officeId, cmd.actor.id, saved.id, { from, to: cmd.role })],
		};
	}
}
