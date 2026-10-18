import { EntityManager } from "typeorm";
import { DomainEvent } from "../core/DomainEvent";
import { EventSubscriber } from "../core/EventBus";
import { AuditLogEntry } from "../domain/AuditLogEntry";
import { ColleagueAddedToVacationEvent, VacationRequestApprovedEvent, VacationRequestRejectedEvent } from "./vacationEvents";

/** Records every domain event in the audit log, in the same transaction as the change itself. */
export class AuditLogSubscriber implements EventSubscriber {
	async handle(event: DomainEvent, tx: EntityManager): Promise<void> {
		await tx.save(tx.create(AuditLogEntry, {
			officeId: event.officeId,
			actorId: event.actorId,
			eventType: event.type,
			entityType: event.entityType,
			entityId: event.entityId,
			payload: { ...event.payload },
			occurredAt: event.occurredAt,
		}));
	}
}

/**
 * Placeholder for notifying the requester about a decision. A real implementation would send email or push,
 * after the transaction commits (e.g. via an outbox table), so a failed send can't undo the decision.
 */
export class DecisionNotificationSubscriber implements EventSubscriber<VacationRequestApprovedEvent | VacationRequestRejectedEvent> {
	async handle(event: VacationRequestApprovedEvent | VacationRequestRejectedEvent): Promise<void> {
		console.log(`[notify] user ${event.payload.userId}: request ${event.entityId} ${event.type}`);
	}
}

/**
 * Placeholder for telling a colleague they were put on a trip (they weren't asked, decisions.md #15). Like the
 * decision notification, a real one would be delivered after commit through an outbox.
 */
export class ColleagueAddedNotificationSubscriber implements EventSubscriber<ColleagueAddedToVacationEvent> {
	async handle(event: ColleagueAddedToVacationEvent): Promise<void> {
		console.log(`[notify] user ${event.payload.userId}: added to trip ${event.payload.groupId} by user ${event.payload.addedBy} (request ${event.entityId})`);
	}
}
