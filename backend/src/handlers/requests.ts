import { CommonEvent } from "commoneventframework/dist/types/commonEvent";
import { Response } from "commoneventframework";
import { z } from "zod";
import { commandBus } from "../app";
import { CreateVacationRequestCommand, SavedVacationRequest } from "../commands/vacation/CreateVacationRequest";
import { MAX_COLLEAGUES } from "../commands/vacation/rules";
import { UpdateVacationRequestCommand } from "../commands/vacation/UpdateVacationRequest";
import { WithdrawVacationRequestCommand } from "../commands/vacation/WithdrawVacationRequest";
import { ValidationError } from "../core/errors";
import { VacationStatus } from "../domain/enums";
import { isOnTimeStep } from "../domain/officeTime";
import { authenticate, bothDates, getQuery, pagination, parseIdParam, parseJsonBody, validate } from "../http/parse";
import { Authenticated, withActor } from "../http/withActor";
import { listMyRequests, presentRequestsById } from "../queries/vacationQueries";
import { getDataSource } from "../db/dataSource";
import { Actor } from "../auth/Actor";
import { InputParserFn } from "./types";

const MAX_REQUEST_DAYS = 366;

const instant = (label: string) =>
	z.iso.datetime({ offset: true, error: `${label} must be a date and time with a UTC offset, e.g. 2026-11-03T09:00:00+02:00` })
		.transform((value) => new Date(value))
		.refine(isOnTimeStep, `${label} must be on a quarter hour (:00, :15, :30 or :45)`);

/**
 * "Going with" (decisions.md #15): the shape only. Whether these people exist and are in the caller's office is a
 * database question, so the command handler answers it. Every problem is reported on `colleagueIds`.
 */
const colleagueIds = z.array(z.unknown(), { error: "colleagueIds must be a list of user ids" })
	.refine((ids) => ids.every((id) => Number.isInteger(id) && (id as number) > 0), "Each colleague must be a user id")
	.refine((ids) => ids.length <= MAX_COLLEAGUES, `You can go with up to ${MAX_COLLEAGUES} colleagues`)
	.refine((ids) => new Set(ids).size === ids.length, "Each colleague can only be added once")
	.nullish()
	.transform((ids) => (ids ?? []) as number[]);

/**
 * Front-door checks for a request period: only what the request and the clock can tell.
 * Rule 1 (end after start), 15-minute steps and the coarse part of rule 4 (not in the past).
 * "Not today in office time" and "includes a working day" need the caller's office, so the command handler checks them.
 */
const periodFields = {
	startDate: instant("Start"),
	endDate: instant("End"),
	reason: z.string({ error: "Reason must be text" }).trim().max(240, "Keep the reason to 240 characters or fewer")
		.nullish().transform((value) => value || null),
};

type PeriodShape = { startDate: unknown; endDate: unknown };

// Zod 4 runs object refinements even if a field already failed, so they only judge valid dates.
const periodRules = <S extends z.ZodType<PeriodShape>>(schema: S) => schema
	.refine((p) => !bothDates(p.startDate, p.endDate) || (p.endDate as Date) > (p.startDate as Date), { path: ["endDate"], message: "End must be after start" })
	.refine((p) => !(p.startDate instanceof Date) || p.startDate > new Date(), { path: ["startDate"], message: "Requests must start after today" })
	.refine((p) => !bothDates(p.startDate, p.endDate) || (p.endDate as Date).getTime() - (p.startDate as Date).getTime() <= MAX_REQUEST_DAYS * 86_400_000,
		{ path: ["endDate"], message: "A request can't be longer than a year" });

const periodSchema = periodRules(z.object(periodFields));
const createSchema = periodRules(z.object({ ...periodFields, colleagueIds }));

type Period = z.infer<typeof periodSchema>;
type CreateInput = z.infer<typeof createSchema>;

/** The saved row as every read shows it, plus the colleagues whose pending plans overlap (empty when none). */
const present = async ({ request, warnings }: SavedVacationRequest, actor: Actor) => {
	const { manager } = await getDataSource();
	const [full] = await presentRequestsById(manager, [request.id], actor);
	return { ...full, warnings };
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
export const parseCreate: InputParserFn = (event: CommonEvent) => {
	const userId = authenticate(event);
	const input = validate(createSchema, parseJsonBody(event));
	// The caller is always on their own request: listing them as a colleague is a mistake in the input.
	if (input.colleagueIds.includes(userId)) {
		throw new ValidationError("colleagueIds: You're already on this request, so don't add yourself", {
			colleagueIds: "You're already on this request, so don't add yourself",
		});
	}
	return { userId, ...input };
};

export const createRequest = withActor<Authenticated & CreateInput>(async (input, actor) => {
	const saved = await commandBus.execute(
		new CreateVacationRequestCommand(actor, input.startDate, input.endDate, input.reason, input.colleagueIds));
	return new Response(201, await present(saved, actor));
});

// PUT /requests/:id (a trip's members are fixed at creation, so colleagueIds isn't read here)
export const parseUpdate: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	id: parseIdParam(event),
	...validate(periodSchema, parseJsonBody(event)),
});

export const updateRequest = withActor<Authenticated & Period & { id: number }>(async (input, actor) => {
	const saved = await commandBus.execute(
		new UpdateVacationRequestCommand(actor, input.id, input.startDate, input.endDate, input.reason));
	return present(saved, actor);
});

// DELETE /requests/:id?scope=self|group
const withdrawQuery = z.object({ scope: z.enum(["self", "group"]).default("self") });

export const parseWithdraw: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	id: parseIdParam(event),
	...validate(withdrawQuery, getQuery(event)),
});

export const withdrawRequest = withActor<Authenticated & { id: number } & z.infer<typeof withdrawQuery>>(async (input, actor) => {
	await commandBus.execute(new WithdrawVacationRequestCommand(actor, input.id, input.scope));
	return new Response(204, {});
});
