import { CommonEvent } from "commoneventframework/dist/types/commonEvent";
import { Response } from "commoneventframework";
import { z } from "zod";
import { commandBus } from "../app";
import { CreateVacationRequestCommand } from "../commands/vacation/CreateVacationRequest";
import { UpdateVacationRequestCommand } from "../commands/vacation/UpdateVacationRequest";
import { WithdrawVacationRequestCommand } from "../commands/vacation/WithdrawVacationRequest";
import { VacationStatus } from "../domain/enums";
import { isOnTimeStep } from "../domain/officeTime";
import { VacationRequest } from "../domain/VacationRequest";
import { authenticate, bothDates, getQuery, pagination, parseIdParam, parseJsonBody, validate } from "../http/parse";
import { Authenticated, withActor } from "../http/withActor";
import { listMyRequests } from "../queries/vacationQueries";
import { toVacationRequest } from "../queries/serializers";
import { getDataSource } from "../db/dataSource";
import { Actor } from "../auth/Actor";
import { InputParserFn } from "./types";

const MAX_REQUEST_DAYS = 366;

const instant = (label: string) =>
	z.iso.datetime({ offset: true, error: `${label} must be a date and time with a UTC offset, e.g. 2026-11-03T09:00:00+02:00` })
		.transform((value) => new Date(value))
		.refine(isOnTimeStep, `${label} must be on a quarter hour (:00, :15, :30 or :45)`);

/**
 * Front-door checks for a request period: only what the request and the clock can tell.
 * Rule 1 (end after start), 15-minute steps and the coarse part of rule 4 (not in the past).
 * "Not today in office time" and "includes a working day" need the caller's office, so the command handler checks them.
 */
const periodSchema = z.object({
	startDate: instant("Start"),
	endDate: instant("End"),
	reason: z.string({ error: "Reason must be text" }).trim().max(240, "Keep the reason to 240 characters or fewer")
		.nullish().transform((value) => value || null),
})
	// Zod 4 runs object refinements even if a field already failed, so they only judge valid dates.
	.refine((p) => !bothDates(p.startDate, p.endDate) || p.endDate > p.startDate, { path: ["endDate"], message: "End must be after start" })
	.refine((p) => !(p.startDate instanceof Date) || p.startDate > new Date(), { path: ["startDate"], message: "Requests must start after today" })
	.refine((p) => !bothDates(p.startDate, p.endDate) || p.endDate.getTime() - p.startDate.getTime() <= MAX_REQUEST_DAYS * 86_400_000,
		{ path: ["endDate"], message: "A request can't be longer than a year" });

type Period = z.infer<typeof periodSchema>;

/** Reloads the request with its relations for the response. */
const present = async (request: VacationRequest, actor: Actor) => {
	const { manager } = await getDataSource();
	const full = await manager.findOneOrFail(VacationRequest, { where: { id: request.id }, relations: { user: true, decidedBy: true } });
	return toVacationRequest(full, actor);
};

// GET /requests/mine
const listMineQuery = pagination.extend({ status: z.enum(VacationStatus).optional() });

export const parseListMine: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	...validate(listMineQuery, getQuery(event)),
});

export const listMine = withActor<Authenticated & z.infer<typeof listMineQuery>>(async (input, actor, em) =>
	listMyRequests(em, actor, input));

// POST /requests
export const parseCreate: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	...validate(periodSchema, parseJsonBody(event)),
});

export const createRequest = withActor<Authenticated & Period>(async (input, actor) => {
	const request = await commandBus.execute(new CreateVacationRequestCommand(actor, input.startDate, input.endDate, input.reason));
	return new Response(201, await present(request, actor));
});

// PUT /requests/:id
export const parseUpdate: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	id: parseIdParam(event),
	...validate(periodSchema, parseJsonBody(event)),
});

export const updateRequest = withActor<Authenticated & Period & { id: number }>(async (input, actor) => {
	const request = await commandBus.execute(
		new UpdateVacationRequestCommand(actor, input.id, input.startDate, input.endDate, input.reason));
	return present(request, actor);
});

// DELETE /requests/:id
export const parseWithdraw: InputParserFn = (event: CommonEvent) => ({ userId: authenticate(event), id: parseIdParam(event) });

export const withdrawRequest = withActor<Authenticated & { id: number }>(async (input, actor) => {
	await commandBus.execute(new WithdrawVacationRequestCommand(actor, input.id));
	return new Response(204, {});
});
