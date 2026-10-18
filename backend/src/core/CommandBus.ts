import { DataSource, EntityManager } from "typeorm";
import { DomainEvent } from "./DomainEvent";
import { EventBus } from "./EventBus";

/** An intent to change state, e.g. ApproveVacationRequestCommand. Commands are plain data. */
export abstract class Command<TResult> {
	// Phantom field so TypeScript can infer a command's result type.
	declare readonly __result?: TResult;
}

/** What a command handler produces: the result for the caller and the events that describe what happened. */
export interface CommandOutcome<TResult> {
	result: TResult;
	events: DomainEvent[];
}

export interface CommandHandler<C extends Command<R>, R> {
	execute(command: C, tx: EntityManager): Promise<CommandOutcome<R>>;
}

type CommandClass = abstract new (...args: never[]) => Command<unknown>;

/**
 * Routes each command to its single handler and runs it in a database transaction.
 * Events are published inside the same transaction, so a failing subscriber rolls the command back.
 */
export class CommandBus {
	private readonly handlers = new Map<CommandClass, CommandHandler<Command<unknown>, unknown>>();

	constructor(
		private readonly getDataSource: () => Promise<DataSource>,
		private readonly eventBus: EventBus,
	) {}

	register<C extends Command<R>, R>(commandClass: abstract new (...args: never[]) => C, handler: CommandHandler<C, R>): void {
		if (this.handlers.has(commandClass)) throw new Error(`Handler already registered for ${commandClass.name}`);
		this.handlers.set(commandClass, handler as CommandHandler<Command<unknown>, unknown>);
	}

	async execute<R>(command: Command<R>): Promise<R> {
		const handler = this.handlers.get(command.constructor as CommandClass);
		if (!handler) throw new Error(`No handler registered for ${command.constructor.name}`);

		const dataSource = await this.getDataSource();
		return dataSource.transaction(async (tx) => {
			const { result, events } = await handler.execute(command, tx);
			await this.eventBus.publish(events, tx);
			return result as R;
		});
	}
}
