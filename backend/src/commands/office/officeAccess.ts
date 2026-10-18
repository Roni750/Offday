import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { ForbiddenError, NotFoundError } from "../../core/errors";
import { Role } from "../../domain/enums";
import { Office } from "../../domain/Office";

/**
 * Workspace admins administer every office of their workspace; the workspace is the tenant boundary.
 * An office of another workspace is reported as missing, so its existence isn't revealed.
 */
export const assertWorkspaceAdmin = (actor: Actor, action: string): void => {
	if (actor.role !== Role.WorkspaceAdmin) throw new ForbiddenError(`Only workspace admins can ${action}`);
};

/** Locks the office row for the rest of the transaction. */
export const lockManagedOffice = async (tx: EntityManager, actor: Actor, officeId: number): Promise<Office> => {
	const office = await tx.findOne(Office, { where: { id: officeId }, lock: { mode: "pessimistic_write" } });
	if (!office || office.workspaceId !== actor.workspaceId) throw new NotFoundError("Office not found");
	return office;
};
