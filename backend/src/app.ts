// Composition root: wires command handlers and event subscribers to the buses.
import { CommandBus } from "./core/CommandBus";
import { DomainEvent } from "./core/DomainEvent";
import { EventBus } from "./core/EventBus";
import { getDataSource } from "./db/dataSource";
import { ApproveVacationRequestCommand, ApproveVacationRequestHandler } from "./commands/vacation/ApproveVacationRequest";
import { CreateVacationRequestCommand, CreateVacationRequestHandler } from "./commands/vacation/CreateVacationRequest";
import {
	ApproveVacationGroupCommand,
	ApproveVacationGroupHandler,
	RejectVacationGroupCommand,
	RejectVacationGroupHandler,
} from "./commands/vacation/DecideVacationGroup";
import { RejectVacationRequestCommand, RejectVacationRequestHandler } from "./commands/vacation/RejectVacationRequest";
import { UpdateVacationRequestCommand, UpdateVacationRequestHandler } from "./commands/vacation/UpdateVacationRequest";
import { WithdrawVacationRequestCommand, WithdrawVacationRequestHandler } from "./commands/vacation/WithdrawVacationRequest";
import { ChangeUserRoleCommand, ChangeUserRoleHandler } from "./commands/office/ChangeUserRole";
import { UpdateOfficeTimezoneCommand, UpdateOfficeTimezoneHandler } from "./commands/office/UpdateOfficeTimezone";
import { UpdateOfficeWorkWeekCommand, UpdateOfficeWorkWeekHandler } from "./commands/office/UpdateOfficeWorkWeek";
import { AcceptInvitationCommand, AcceptInvitationHandler } from "./commands/invitation/AcceptInvitation";
import { CreateInvitationCommand, CreateInvitationHandler } from "./commands/invitation/CreateInvitation";
import { RevokeInvitationCommand, RevokeInvitationHandler } from "./commands/invitation/RevokeInvitation";
import { AuditLogSubscriber, ColleagueAddedNotificationSubscriber, DecisionNotificationSubscriber } from "./events/subscribers";
import { ColleagueAddedToVacationEvent, VacationRequestApprovedEvent, VacationRequestRejectedEvent } from "./events/vacationEvents";

export const eventBus = new EventBus();
eventBus.subscribe(DomainEvent, new AuditLogSubscriber());
const decisionNotifications = new DecisionNotificationSubscriber();
eventBus.subscribe(VacationRequestApprovedEvent, decisionNotifications);
eventBus.subscribe(VacationRequestRejectedEvent, decisionNotifications);
eventBus.subscribe(ColleagueAddedToVacationEvent, new ColleagueAddedNotificationSubscriber());

export const commandBus = new CommandBus(getDataSource, eventBus);
commandBus.register(CreateVacationRequestCommand, new CreateVacationRequestHandler());
commandBus.register(UpdateVacationRequestCommand, new UpdateVacationRequestHandler());
commandBus.register(WithdrawVacationRequestCommand, new WithdrawVacationRequestHandler());
commandBus.register(ApproveVacationRequestCommand, new ApproveVacationRequestHandler());
commandBus.register(RejectVacationRequestCommand, new RejectVacationRequestHandler());
commandBus.register(ApproveVacationGroupCommand, new ApproveVacationGroupHandler());
commandBus.register(RejectVacationGroupCommand, new RejectVacationGroupHandler());
commandBus.register(ChangeUserRoleCommand, new ChangeUserRoleHandler());
commandBus.register(UpdateOfficeTimezoneCommand, new UpdateOfficeTimezoneHandler());
commandBus.register(UpdateOfficeWorkWeekCommand, new UpdateOfficeWorkWeekHandler());
commandBus.register(CreateInvitationCommand, new CreateInvitationHandler());
commandBus.register(RevokeInvitationCommand, new RevokeInvitationHandler());
commandBus.register(AcceptInvitationCommand, new AcceptInvitationHandler());
