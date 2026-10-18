import { EntityManager } from "typeorm";
import { Actor } from "../../auth/Actor";
import { Command, CommandHandler, CommandOutcome } from "../../core/CommandBus";
import { DomainEvent } from "../../core/DomainEvent";
import { ValidationError } from "../../core/errors";
import { VacationStatus } from "../../domain/enums";
import { User } from "../../domain/User";
import { VacationGroup } from "../../domain/VacationGroup";
import { VacationRequest } from "../../domain/VacationRequest";
import { ColleagueAddedToVacationEvent, VacationGroupCreatedEvent, VacationRequestCreatedEvent } from "../../events/vacationEvents";
import {
	ParticipantConflict,
	assertIncludesWorkingDay,
	assertNoOverlap,
	assertStartsAfterToday,
	colleaguesBlockedError,
	findColleagueOverlaps,
	lockUsers,
	periodPayload,
	withOverlapGuard,
} from "./rules";

export interface SavedVacationRequest {
	/** The caller's own row. */
	request: VacationRequest;
	/** Colleagues whose Pending time off overlaps the trip: they're on it anyway (decisions.md #15). */
	warnings: ParticipantConflict[];
}

/** Same message for an unknown user, another office and another workspace: nothing about other tenants leaks. */
export const COLLEAGUE_NOT_FOUND = "Pick colleagues from your office";

export class CreateVacationRequestCommand extends Command<SavedVacationRequest> {
	constructor(
		readonly actor: Actor,
		readonly startDate: Date,
		readonly endDate: Date,
		readonly reason: string | null,
		/** Validated by the inputParser: distinct positive ids, at most 9, not the caller. Empty = a request alone. */
		readonly colleagueIds: readonly number[] = [],
	) {
		super();
	}
}

/** The colleagues, locked with the requester in ascending id order, in the order the requester listed them. */
export const lockParticipants = async (tx: EntityManager, actor: Actor, colleagueIds: readonly number[]): Promise<User[]> => {
	const locked = await lockUsers(tx, [actor.id, ...colleagueIds]);
	const byId = new Map(locked.map((u) => [u.id, u]));
	const colleagues = colleagueIds.map((id) => byId.get(id));
	if (colleagues.some((u) => !u || u.officeId !== actor.officeId)) {
		throw new ValidationError(COLLEAGUE_NOT_FOUND, { colleagueIds: "Some of these people aren't in your office" });
	}
	return colleagues as User[];
};

export class CreateVacationRequestHandler implements CommandHandler<CreateVacationRequestCommand, SavedVacationRequest> {
	async execute(cmd: CreateVacationRequestCommand, tx: EntityManager): Promise<CommandOutcome<SavedVacationRequest>> {
		const { actor, startDate, endDate, reason } = cmd;
		assertStartsAfterToday(startDate, actor);
		assertIncludesWorkingDay(startDate, endDate, actor);

		// Locks the requester (and colleagues), so this person's submissions run one at a time.
		const colleagues = await lockParticipants(tx, actor, cmd.colleagueIds);
		// The requester's own rule 2 covers trip rows too.
		await assertNoOverlap(tx, actor.id, startDate, endDate);

		if (!colleagues.length) {
			const request = await withOverlapGuard(() =>
				tx.save(tx.create(VacationRequest, { userId: actor.id, startDate, endDate, reason, status: VacationStatus.Pending })),
			);
			return {
				result: { request, warnings: [] },
				events: [new VacationRequestCreatedEvent(actor.officeId, actor.id, request.id, periodPayload(request))],
			};
		}

		const { blocked, warnings } = await findColleagueOverlaps(tx, colleagues, startDate, endDate);
		if (blocked.length) throw colleaguesBlockedError(blocked, startDate, endDate, actor.timezone);

		const group = await tx.save(tx.create(VacationGroup, { officeId: actor.officeId, organizerId: actor.id }));
		const row = (userId: number, addedById: number | null) =>
			tx.create(VacationRequest, { userId, startDate, endDate, reason, status: VacationStatus.Pending, groupId: group.id, addedById });
		const request = await withOverlapGuard(() => tx.save(row(actor.id, null)));
		const added = await tx.save(colleagues.map((c) => row(c.id, actor.id)));

		const events: DomainEvent[] = [
			new VacationGroupCreatedEvent(actor.officeId, actor.id, group.id, {
				organizerId: actor.id,
				memberIds: [actor.id, ...colleagues.map((c) => c.id)],
				startDate: startDate.toISOString(),
				endDate: endDate.toISOString(),
			}),
			new VacationRequestCreatedEvent(actor.officeId, actor.id, request.id, periodPayload(request)),
		];
		for (const r of added) {
			events.push(new VacationRequestCreatedEvent(actor.officeId, actor.id, r.id, { ...periodPayload(r), addedBy: actor.id }));
			events.push(new ColleagueAddedToVacationEvent(actor.officeId, actor.id, r.id, { ...periodPayload(r), groupId: group.id, addedBy: actor.id }));
		}

		return { result: { request, warnings }, events };
	}
}
