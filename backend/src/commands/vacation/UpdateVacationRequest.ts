import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { InvalidStateError } from "../../core/errors";
import { VacationStatus } from "../../domain/enums";
import { User } from "../../domain/User";
import { VacationGroup } from "../../domain/VacationGroup";
import { VacationRequest } from "../../domain/VacationRequest";
import { VacationRequestUpdatedEvent } from "../../events/vacationEvents";
import { SavedVacationRequest } from "./CreateVacationRequest";
import {
	assertIncludesWorkingDay,
	assertNoOverlap,
	assertPending,
	assertStartsAfterToday,
	colleaguesBlockedError,
	findColleagueOverlaps,
	lockGroupRows,
	lockOwnRequest,
	lockUsers,
	periodPayload,
	withOverlapGuard,
} from "./rules";

export class UpdateVacationRequestCommand extends Command<SavedVacationRequest> {
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

export class UpdateVacationRequestHandler implements CommandHandler<UpdateVacationRequestCommand, SavedVacationRequest> {
	async execute(cmd: UpdateVacationRequestCommand, tx: EntityManager): Promise<CommandOutcome<SavedVacationRequest>> {
		const { request, group } = await lockOwnRequest(tx, cmd.requestId, cmd.actor);
		assertPending(request, "modified");
		if (group) return this.updateTrip(cmd, tx, request, group);

		assertStartsAfterToday(cmd.startDate, cmd.actor);
		assertIncludesWorkingDay(cmd.startDate, cmd.endDate, cmd.actor);
		await lockUsers(tx, [cmd.actor.id]);
		await assertNoOverlap(tx, cmd.actor.id, cmd.startDate, cmd.endDate, request.id);

		const previous = periodPayload(request);
		request.startDate = cmd.startDate;
		request.endDate = cmd.endDate;
		request.reason = cmd.reason;
		const saved = await withOverlapGuard(() => tx.save(request));

		return {
			result: { request: saved, warnings: [] },
			events: [new VacationRequestUpdatedEvent(cmd.actor.officeId, cmd.actor.id, saved.id, {
				...periodPayload(saved),
				previous: { startDate: previous.startDate, endDate: previous.endDate },
			})],
		};
	}

	/** Only the organizer changes a trip's dates, only while nobody on it has a decision, and for everyone at once. */
	private async updateTrip(
		cmd: UpdateVacationRequestCommand,
		tx: EntityManager,
		request: VacationRequest,
		group: VacationGroup,
	): Promise<CommandOutcome<SavedVacationRequest>> {
		const { actor, startDate, endDate } = cmd;
		if (group.organizerId !== actor.id) {
			const organizer = group.organizerId ? await tx.findOneBy(User, { id: group.organizerId }) : null;
			throw new InvalidStateError(
				`The trip's dates are set by ${organizer?.name ?? "its organizer"}. Leave the trip to request your own dates.`,
			);
		}

		const rows = await lockGroupRows(tx, group.id);
		if (rows.some((r) => r.status !== VacationStatus.Pending)) {
			throw new InvalidStateError(
				"Someone on this trip already has a decision, so its dates can't change. Cancel it for everyone and submit new dates.",
			);
		}

		assertStartsAfterToday(startDate, actor);
		assertIncludesWorkingDay(startDate, endDate, actor);

		const users = await lockUsers(tx, rows.map((r) => r.userId));
		await assertNoOverlap(tx, actor.id, startDate, endDate, request.id);
		const colleagues = users.filter((u) => u.id !== actor.id);
		const { blocked, warnings } = await findColleagueOverlaps(tx, colleagues, startDate, endDate, group.id);
		if (blocked.length) throw colleaguesBlockedError(blocked, startDate, endDate, actor.timezone);

		const events = rows.map((r) => {
			const previous = { startDate: r.startDate.toISOString(), endDate: r.endDate.toISOString() };
			r.startDate = startDate;
			r.endDate = endDate;
			r.reason = cmd.reason;
			return { row: r, previous };
		});
		const saved = await withOverlapGuard(() => tx.save(rows));

		return {
			result: { request: saved.find((r) => r.id === request.id)!, warnings },
			events: events.map(({ row, previous }) =>
				new VacationRequestUpdatedEvent(actor.officeId, actor.id, row.id, { ...periodPayload(row), previous })),
		};
	}
}
