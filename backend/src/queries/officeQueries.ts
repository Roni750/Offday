import { EntityManager } from "typeorm";
import { Actor } from "../auth/Actor";
import { NotFoundError } from "../core/errors";
import { Role } from "../domain/enums";
import { Office } from "../domain/Office";
import { User } from "../domain/User";
import { toOffice, toUserSummary } from "./serializers";

/** An office of the caller's workspace; offices of other workspaces look missing. */
export const findWorkspaceOffice = async (em: EntityManager, actor: Actor, officeId: number): Promise<Office> => {
	const office = await em.findOneBy(Office, { id: officeId, workspaceId: actor.workspaceId });
	if (!office) throw new NotFoundError("Office not found");
	return office;
};

const workspaceOf = (actor: Actor) => ({ id: actor.workspaceId, name: actor.workspaceName });

export const toWorkspaceOffice = (office: Office, actor: Actor) => toOffice(office, workspaceOf(actor));

/** Every office of the caller's workspace, with its headcount per role. */
export const listWorkspaceOffices = async (em: EntityManager, actor: Actor) => {
	const offices = await em.find(Office, { where: { workspaceId: actor.workspaceId }, order: { name: "ASC" } });
	const counts: { officeId: number; role: Role; count: string }[] = await em
		.createQueryBuilder(User, "u")
		.select("u.office_id", "officeId")
		.addSelect("u.role", "role")
		.addSelect("COUNT(*)", "count")
		.where("u.office_id IN (:...ids)", { ids: offices.length ? offices.map((o) => o.id) : [0] })
		.groupBy("u.office_id")
		.addGroupBy("u.role")
		.getRawMany();

	return offices.map((office) => {
		const people = { total: 0, Requester: 0, Validator: 0, OfficeAdmin: 0 };
		for (const row of counts.filter((c) => c.officeId === office.id)) {
			people[row.role] = Number(row.count);
			people.total += Number(row.count);
		}
		return { ...toWorkspaceOffice(office, actor), people, isMine: office.id === actor.officeId };
	});
};

export const listOfficeUsers = async (em: EntityManager, officeId: number) => {
	const users = await em.find(User, { where: { officeId }, order: { name: "ASC" } });
	return users.map(toUserSummary);
};
