import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { Office } from "../../domain/Office";
import { OfficeTimezoneChangedEvent } from "../../events/officeEvents";
import { assertWorkspaceAdmin, lockManagedOffice } from "./officeAccess";

/**
 * Stored requests are exact moments, so they don't move; only how they're displayed, and what
 * "today" means for new requests, changes with the zone.
 */
export class UpdateOfficeTimezoneCommand extends Command<Office> {
	constructor(readonly actor: Actor, readonly officeId: number, readonly timezone: string) {
		super();
	}
}

export class UpdateOfficeTimezoneHandler implements CommandHandler<UpdateOfficeTimezoneCommand, Office> {
	async execute(cmd: UpdateOfficeTimezoneCommand, tx: EntityManager): Promise<CommandOutcome<Office>> {
		assertWorkspaceAdmin(cmd.actor, "change the time zone");
		const office = await lockManagedOffice(tx, cmd.actor, cmd.officeId);

		const from = office.timezone;
		if (from === cmd.timezone) return { result: office, events: [] };

		office.timezone = cmd.timezone;
		const saved = await tx.save(office);

		return {
			result: saved,
			events: [new OfficeTimezoneChangedEvent(office.id, cmd.actor.id, office.id, { from, to: cmd.timezone })],
		};
	}
}
