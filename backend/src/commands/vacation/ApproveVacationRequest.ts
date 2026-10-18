import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { OverlapError } from "../../core/errors";
import { VacationStatus } from "../../domain/enums";
import { VacationRequest } from "../../domain/VacationRequest";
import { VacationRequestApprovedEvent } from "../../events/vacationEvents";
import { approvedOverlapMessage, findApprovedOverlap, lockRequestForReview, periodPayload, toConflict, withOverlapGuard } from "./rules";

export class ApproveVacationRequestCommand extends Command<VacationRequest> {
	constructor(readonly actor: Actor, readonly requestId: number) {
		super();
	}
}

/**
 * Approves one Pending request. Nobody can have two overlapping approved requests (#15): trip rows may overlap a
 * person's other Pending request, so approving can be refused with 409 OVERLAP. The pre-check gives the readable error;
 * the vacation_no_overlap_approved constraint backs it up.
 */
export const approve = async (tx: EntityManager, actor: Actor, request: VacationRequest, ownerName: string) => {
	const conflict = await findApprovedOverlap(tx, request);
	if (conflict) throw new OverlapError(approvedOverlapMessage(ownerName), { conflict: toConflict(conflict) });

	request.status = VacationStatus.Approved;
	request.decidedById = actor.id;
	request.decidedAt = new Date();
	const saved = await withOverlapGuard(() => tx.save(request), approvedOverlapMessage(ownerName));
	return { saved, event: new VacationRequestApprovedEvent(actor.officeId, actor.id, saved.id, periodPayload(saved)) };
};

export class ApproveVacationRequestHandler implements CommandHandler<ApproveVacationRequestCommand, VacationRequest> {
	async execute(cmd: ApproveVacationRequestCommand, tx: EntityManager): Promise<CommandOutcome<VacationRequest>> {
		const { request, owner } = await lockRequestForReview(tx, cmd.requestId, cmd.actor);
		const { saved, event } = await approve(tx, cmd.actor, request, owner.name);
		return { result: saved, events: [event] };
	}
}
