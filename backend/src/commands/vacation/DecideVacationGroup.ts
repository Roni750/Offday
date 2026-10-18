import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { ForbiddenError, InvalidStateError, NotFoundError, OverlapError } from "../../core/errors";
import { VacationStatus } from "../../domain/enums";
import { User } from "../../domain/User";
import { VacationRequest } from "../../domain/VacationRequest";
import { approve } from "./ApproveVacationRequest";
import { reject } from "./RejectVacationRequest";
import { ON_TRIP_MESSAGE, ParticipantConflict, assertReviewer, findApprovedOverlap, lockGroup, lockGroupRows, toConflict } from "./rules";
import { listNames } from "../../domain/periodText";

/**
 * Approve all / Reject all for a trip (decisions.md #15): decides every Pending row of the group in one transaction.
 * Per-person decisions stay the source of truth; this is a shortcut over them, with the same events per row.
 */
export class ApproveVacationGroupCommand extends Command<VacationRequest[]> {
	constructor(readonly actor: Actor, readonly groupId: number) {
		super();
	}
}

/** Rule 5: the comment is required (inputParser), and copied to every rejected row. */
export class RejectVacationGroupCommand extends Command<VacationRequest[]> {
	constructor(readonly actor: Actor, readonly groupId: number, readonly comment: string) {
		super();
	}
}

/** Group row first, then its rows in id order: the same lock order as every other command. */
const lockPendingForReview = async (tx: EntityManager, groupId: number, actor: Actor) => {
	assertReviewer(actor);
	const group = await lockGroup(tx, groupId);
	if (!group || group.officeId !== actor.officeId) throw new NotFoundError("Trip not found");

	const rows = await lockGroupRows(tx, group.id);
	if (rows.some((r) => r.userId === actor.id)) throw new ForbiddenError(ON_TRIP_MESSAGE);

	const pending = rows.filter((r) => r.status === VacationStatus.Pending);
	if (!pending.length) throw new InvalidStateError("Nobody on this trip is waiting for a decision");
	const owners = await tx.findBy(User, pending.map((r) => ({ id: r.userId })));
	const names = new Map(owners.map((u) => [u.id, u.name]));
	return { pending, nameOf: (r: VacationRequest) => names.get(r.userId) ?? "Someone" };
};

export class ApproveVacationGroupHandler implements CommandHandler<ApproveVacationGroupCommand, VacationRequest[]> {
	async execute(cmd: ApproveVacationGroupCommand, tx: EntityManager): Promise<CommandOutcome<VacationRequest[]>> {
		const { pending, nameOf } = await lockPendingForReview(tx, cmd.groupId, cmd.actor);

		// All or nothing: report every person who already has approved time off then, before approving anyone.
		const conflicts: ParticipantConflict[] = [];
		for (const row of pending) {
			const conflict = await findApprovedOverlap(tx, row);
			if (conflict) conflicts.push({ userId: row.userId, name: nameOf(row), conflict: toConflict(conflict) });
		}
		if (conflicts.length) {
			const who = listNames(conflicts.map((c) => c.name));
			throw new OverlapError(`${who} already ${conflicts.length === 1 ? "has" : "have"} approved time off that overlaps this trip`, { conflicts });
		}

		const decided = [];
		for (const row of pending) decided.push(await approve(tx, cmd.actor, row, nameOf(row)));
		return { result: decided.map((d) => d.saved), events: decided.map((d) => d.event) };
	}
}

export class RejectVacationGroupHandler implements CommandHandler<RejectVacationGroupCommand, VacationRequest[]> {
	async execute(cmd: RejectVacationGroupCommand, tx: EntityManager): Promise<CommandOutcome<VacationRequest[]>> {
		const { pending } = await lockPendingForReview(tx, cmd.groupId, cmd.actor);
		const decided = [];
		for (const row of pending) decided.push(await reject(tx, cmd.actor, row, cmd.comment));
		return { result: decided.map((d) => d.saved), events: decided.map((d) => d.event) };
	}
}
