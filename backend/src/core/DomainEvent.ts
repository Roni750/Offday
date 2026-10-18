/**
 * Something that happened in the business, published after a command succeeds.
 * Events are facts in the past tense; subscribers react to them without the command knowing who listens.
 */
export abstract class DomainEvent<TPayload extends object = object> {
	abstract readonly type: string;
	abstract readonly entityType: string;
	readonly occurredAt = new Date();

	constructor(
		readonly officeId: number,
		readonly actorId: number | null,
		readonly entityId: number,
		readonly payload: TPayload,
	) {}
}
