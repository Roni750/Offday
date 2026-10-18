import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { VacationStatus } from "../../domain/enums";
import { VacationRequest } from "../../domain/VacationRequest";
import { VacationRequestRejectedEvent } from "../../events/vacationEvents";
import { lockRequestForReview, periodPayload } from "./rules";

/** Rule 5: the comment is required. The inputParser enforces it, and so does a DB check constraint. */
export class RejectVacationRequestCommand extends Command<VacationRequest> {
	constructor(readonly actor: Actor, readonly requestId: number, readonly comment: string) {
		super();
	}
}

export class RejectVacationRequestHandler implements CommandHandler<RejectVacationRequestCommand, VacationRequest> {
	async execute(cmd: RejectVacationRequestCommand, tx: EntityManager): Promise<CommandOutcome<VacationRequest>> {
		const request = await lockRequestForReview(tx, cmd.requestId, cmd.actor);

		request.status = VacationStatus.Rejected;
		request.comments = cmd.comment;
		request.decidedById = cmd.actor.id;
		request.decidedAt = new Date();
		const saved = await tx.save(request);

		return {
			result: saved,
			events: [new VacationRequestRejectedEvent(cmd.actor.officeId, cmd.actor.id, saved.id, {
				...periodPayload(saved),
				comment: cmd.comment,
			})],
		};
	}
}
