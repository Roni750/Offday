import { EntityManager } from "typeorm";
import { User } from "../domain/User";
import { UnauthenticatedError } from "../core/errors";
import { Actor } from "./Actor";

export const loadActor = async (em: EntityManager, userId: number): Promise<Actor> => {
	const user = await em.findOne(User, { where: { id: userId }, relations: { office: { workspace: true } } });
	// A valid token for a deleted user is treated like an invalid token.
	if (!user) throw new UnauthenticatedError("User no longer exists");

	return {
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
		officeId: user.officeId,
		officeName: user.office.name,
		timezone: user.office.timezone,
		workDays: user.office.workDays,
		workspaceId: user.office.workspaceId,
		workspaceName: user.office.workspace.name,
	};
};
