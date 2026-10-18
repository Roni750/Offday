import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { ForbiddenError, InvalidStateError } from "../../core/errors";
import { VacationStatus } from "../../domain/enums";
import { ColleagueLeftVacationEvent, VacationRequestWithdrawnEvent } from "../../events/vacationEvents";
import { assertPending, deleteGroupIfEmpty, lockGroupRows, lockOwnRequest, periodPayload } from "./rules";

/** `self`: only the caller's row (a colleague leaving a trip). `group`: every Pending row of the trip (organizer only). */
export type WithdrawScope = "self" | "group";

/** Deletes the owner's own Pending request. The audit log keeps the record of it. */
export class WithdrawVacationRequestCommand extends Command<void> {
	constructor(readonly actor: Actor, readonly requestId: number, readonly scope: WithdrawScope = "self") {
		super();
	}
}

export class WithdrawVacationRequestHandler implements CommandHandler<WithdrawVacationRequestCommand, void> {
	async execute(cmd: WithdrawVacationRequestCommand, tx: EntityManager): Promise<CommandOutcome<void>> {
		const { actor } = cmd;
		const { request, group } = await lockOwnRequest(tx, cmd.requestId, actor);

		// A request alone is its own "group": both scopes withdraw just it, as before.
		if (!group) {
			assertPending(request, "withdrawn");
			const payload = periodPayload(request);
			await tx.remove(request);
			return {
				result: undefined,
				events: [new VacationRequestWithdrawnEvent(actor.officeId, actor.id, cmd.requestId, payload)],
			};
		}

		const isOrganizer = group.organizerId === actor.id;

		if (cmd.scope === "self") {
			assertPending(request, "withdrawn");
			const payload = periodPayload(request);
			await tx.remove(request);
			await deleteGroupIfEmpty(tx, group.id);
			return {
				result: undefined,
				events: [isOrganizer
					? new VacationRequestWithdrawnEvent(actor.officeId, actor.id, cmd.requestId, { ...payload, scope: "self" })
					: new ColleagueLeftVacationEvent(actor.officeId, actor.id, cmd.requestId, { ...payload, groupId: group.id })],
			};
		}

		if (!isOrganizer) throw new ForbiddenError("Only the trip's organizer can cancel it for everyone");
		const pending = (await lockGroupRows(tx, group.id)).filter((r) => r.status === VacationStatus.Pending);
		if (!pending.length) throw new InvalidStateError("Nobody on this trip is still pending, so there's nothing to cancel");

		const events = pending.map((r) =>
			new VacationRequestWithdrawnEvent(actor.officeId, actor.id, r.id, { ...periodPayload(r), scope: "group" as const }));
		await tx.remove(pending);
		await deleteGroupIfEmpty(tx, group.id);
		return { result: undefined, events };
	}
}
