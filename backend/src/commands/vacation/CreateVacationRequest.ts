import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { VacationStatus } from "../../domain/enums";
import { VacationRequest } from "../../domain/VacationRequest";
import { VacationRequestCreatedEvent } from "../../events/vacationEvents";
import { assertIncludesWorkingDay, assertNoOverlap, assertStartsAfterToday, periodPayload, withOverlapGuard } from "./rules";

export class CreateVacationRequestCommand extends Command<VacationRequest> {
	constructor(
		readonly actor: Actor,
		readonly startDate: Date,
		readonly endDate: Date,
		readonly reason: string | null,
	) {
		super();
	}
}

export class CreateVacationRequestHandler implements CommandHandler<CreateVacationRequestCommand, VacationRequest> {
	async execute(cmd: CreateVacationRequestCommand, tx: EntityManager): Promise<CommandOutcome<VacationRequest>> {
		assertStartsAfterToday(cmd.startDate, cmd.actor);
		assertIncludesWorkingDay(cmd.startDate, cmd.endDate, cmd.actor);
		await assertNoOverlap(tx, cmd.actor.id, cmd.startDate, cmd.endDate);

		const request = await withOverlapGuard(() =>
			tx.save(tx.create(VacationRequest, {
				userId: cmd.actor.id,
				startDate: cmd.startDate,
				endDate: cmd.endDate,
				reason: cmd.reason,
				status: VacationStatus.Pending,
			})),
		);

		return {
			result: request,
			events: [new VacationRequestCreatedEvent(cmd.actor.officeId, cmd.actor.id, request.id, periodPayload(request))],
		};
	}
}
