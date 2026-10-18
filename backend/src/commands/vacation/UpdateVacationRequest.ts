import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { VacationRequest } from "../../domain/VacationRequest";
import { VacationRequestUpdatedEvent } from "../../events/vacationEvents";
import { assertIncludesWorkingDay, assertNoOverlap, assertPending, assertStartsAfterToday, lockOwnRequest, periodPayload, withOverlapGuard } from "./rules";

export class UpdateVacationRequestCommand extends Command<VacationRequest> {
	constructor(
		readonly actor: Actor,
		readonly requestId: number,
		readonly startDate: Date,
		readonly endDate: Date,
		readonly reason: string | null,
	) {
		super();
	}
}

export class UpdateVacationRequestHandler implements CommandHandler<UpdateVacationRequestCommand, VacationRequest> {
	async execute(cmd: UpdateVacationRequestCommand, tx: EntityManager): Promise<CommandOutcome<VacationRequest>> {
		const request = await lockOwnRequest(tx, cmd.requestId, cmd.actor);
		assertPending(request, "modified");
		assertStartsAfterToday(cmd.startDate, cmd.actor);
		assertIncludesWorkingDay(cmd.startDate, cmd.endDate, cmd.actor);
		await assertNoOverlap(tx, cmd.actor.id, cmd.startDate, cmd.endDate, request.id);

		const previous = periodPayload(request);
		request.startDate = cmd.startDate;
		request.endDate = cmd.endDate;
		request.reason = cmd.reason;
		const saved = await withOverlapGuard(() => tx.save(request));

		return {
			result: saved,
			events: [new VacationRequestUpdatedEvent(cmd.actor.officeId, cmd.actor.id, saved.id, {
				...periodPayload(saved),
				previous: { startDate: previous.startDate, endDate: previous.endDate },
			})],
		};
	}
}
