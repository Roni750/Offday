import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { VacationStatus } from "../../domain/enums";
import { VacationRequest } from "../../domain/VacationRequest";
import { VacationRequestApprovedEvent } from "../../events/vacationEvents";
import { lockRequestForReview, periodPayload } from "./rules";

export class ApproveVacationRequestCommand extends Command<VacationRequest> {
	constructor(readonly actor: Actor, readonly requestId: number) {
		super();
	}
}

export class ApproveVacationRequestHandler implements CommandHandler<ApproveVacationRequestCommand, VacationRequest> {
	async execute(cmd: ApproveVacationRequestCommand, tx: EntityManager): Promise<CommandOutcome<VacationRequest>> {
		const request = await lockRequestForReview(tx, cmd.requestId, cmd.actor);

		request.status = VacationStatus.Approved;
		request.decidedById = cmd.actor.id;
		request.decidedAt = new Date();
		const saved = await tx.save(request);

		return {
			result: saved,
			events: [new VacationRequestApprovedEvent(cmd.actor.officeId, cmd.actor.id, saved.id, periodPayload(saved))],
		};
	}
}
