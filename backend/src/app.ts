// Composition root: wires command handlers and event subscribers to the buses.
import { CommandBus } from "./core/CommandBus";
import { DomainEvent } from "./core/DomainEvent";
import { EventBus } from "./core/EventBus";
import { getDataSource } from "./db/dataSource";
import { ApproveVacationRequestCommand, ApproveVacationRequestHandler } from "./commands/vacation/ApproveVacationRequest";
import { CreateVacationRequestCommand, CreateVacationRequestHandler } from "./commands/vacation/CreateVacationRequest";
import { RejectVacationRequestCommand, RejectVacationRequestHandler } from "./commands/vacation/RejectVacationRequest";
import { UpdateVacationRequestCommand, UpdateVacationRequestHandler } from "./commands/vacation/UpdateVacationRequest";
import { WithdrawVacationRequestCommand, WithdrawVacationRequestHandler } from "./commands/vacation/WithdrawVacationRequest";
import { AuditLogSubscriber, DecisionNotificationSubscriber } from "./events/subscribers";
import { VacationRequestApprovedEvent, VacationRequestRejectedEvent } from "./events/vacationEvents";

export const eventBus = new EventBus();
eventBus.subscribe(DomainEvent, new AuditLogSubscriber());
const decisionNotifications = new DecisionNotificationSubscriber();
eventBus.subscribe(VacationRequestApprovedEvent, decisionNotifications);
eventBus.subscribe(VacationRequestRejectedEvent, decisionNotifications);

export const commandBus = new CommandBus(getDataSource, eventBus);
commandBus.register(CreateVacationRequestCommand, new CreateVacationRequestHandler());
commandBus.register(UpdateVacationRequestCommand, new UpdateVacationRequestHandler());
commandBus.register(WithdrawVacationRequestCommand, new WithdrawVacationRequestHandler());
commandBus.register(ApproveVacationRequestCommand, new ApproveVacationRequestHandler());
commandBus.register(RejectVacationRequestCommand, new RejectVacationRequestHandler());
