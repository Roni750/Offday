import { EntityManager } from "typeorm";
import { Actor } from "../auth/Actor";
import { loadActor } from "../auth/loadActor";
import { ForbiddenError } from "../core/errors";
import { getDataSource } from "../db/dataSource";
import { Role } from "../domain/enums";
import { HandlerFn } from "../handlers/types";

/** What every authenticated inputParser returns: the verified caller id plus the parsed input. */
export interface Authenticated {
	userId: number;
}

/**
 * Wraps a CEF handler: loads the caller from the database (current role and office) and optionally
 * gates the route by role. Commands still check their own domain permissions on the Actor.
 */
export const withActor = <I extends Authenticated>(
	fn: (input: I, actor: Actor, em: EntityManager) => Promise<object>,
	allowedRoles?: readonly Role[],
): HandlerFn =>
	async (input: I) => {
		const { manager } = await getDataSource();
		const actor = await loadActor(manager, input.userId);
		if (allowedRoles && !allowedRoles.includes(actor.role)) throw new ForbiddenError("Your role can't access this resource");
		return fn(input, actor, manager);
	};
