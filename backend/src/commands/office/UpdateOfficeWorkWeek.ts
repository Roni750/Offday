import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { Office } from "../../domain/Office";
import { OfficeWorkWeekChangedEvent } from "../../events/officeEvents";
import { assertWorkspaceAdmin, lockManagedOffice } from "./officeAccess";

/**
 * Sets the office's working days. Stored requests don't change; their day counts are derived,
 * so they're recalculated with the new week (and so is the leave balance).
 */
export class UpdateOfficeWorkWeekCommand extends Command<Office> {
	constructor(readonly actor: Actor, readonly officeId: number, readonly workDays: number[]) {
		super();
	}
}

export class UpdateOfficeWorkWeekHandler implements CommandHandler<UpdateOfficeWorkWeekCommand, Office> {
	async execute(cmd: UpdateOfficeWorkWeekCommand, tx: EntityManager): Promise<CommandOutcome<Office>> {
		assertWorkspaceAdmin(cmd.actor, "change the work week");
		const office = await lockManagedOffice(tx, cmd.actor, cmd.officeId);

		const from = [...office.workDays].sort((a, b) => a - b);
		const to = [...cmd.workDays].sort((a, b) => a - b);
		if (from.join() === to.join()) return { result: office, events: [] };

		office.workDays = to;
		const saved = await tx.save(office);

		return {
			result: saved,
			events: [new OfficeWorkWeekChangedEvent(office.id, cmd.actor.id, office.id, { from, to })],
		};
	}
}
