import { EntityManager } from "typeorm";
import { DomainEvent } from "./DomainEvent";

type EventClass<E extends DomainEvent> = abstract new (...args: never[]) => E;

/**
 * Reacts to an event. Subscribers receive the command's transaction, so their writes (e.g. the audit log)
 * commit or roll back together with the change that produced the event.
 */
export interface EventSubscriber<E extends DomainEvent = DomainEvent> {
	handle(event: E, tx: EntityManager): Promise<void>;
}

/** In-process, synchronous event bus. Subscribing to the DomainEvent base class receives every event. */
export class EventBus {
	private readonly subscriptions: { eventClass: EventClass<DomainEvent>; subscriber: EventSubscriber }[] = [];

	subscribe<E extends DomainEvent>(eventClass: EventClass<E>, subscriber: EventSubscriber<E>): void {
		this.subscriptions.push({ eventClass, subscriber: subscriber as EventSubscriber });
	}

	async publish(events: readonly DomainEvent[], tx: EntityManager): Promise<void> {
		for (const event of events) {
			for (const { eventClass, subscriber } of this.subscriptions) {
				if (event instanceof eventClass) await subscriber.handle(event, tx);
			}
		}
	}
}
