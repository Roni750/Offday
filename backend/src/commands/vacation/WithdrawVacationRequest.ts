import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { VacationRequestWithdrawnEvent } from "../../events/vacationEvents";
import { assertPending, lockOwnRequest, periodPayload } from "./rules";

/** Deletes the owner's own Pending request. The audit log keeps the record of it. */
export class WithdrawVacationRequestCommand extends Command<void> {
	constructor(readonly actor: Actor, readonly requestId: number) {
		super();
	}
}

export class WithdrawVacationRequestHandler implements CommandHandler<WithdrawVacationRequestCommand, void> {
	async execute(cmd: WithdrawVacationRequestCommand, tx: EntityManager): Promise<CommandOutcome<void>> {
		const request = await lockOwnRequest(tx, cmd.requestId, cmd.actor);
		assertPending(request, "withdrawn");

		const payload = periodPayload(request);
		await tx.remove(request);

		return {
			result: undefined,
			events: [new VacationRequestWithdrawnEvent(cmd.actor.officeId, cmd.actor.id, cmd.requestId, payload)],
		};
	}
}
