import { CommonEvent } from "commoneventframework/dist/types/commonEvent";
import { DateTime } from "luxon";
import { z } from "zod";
import { commandBus } from "../app";
import { ApproveVacationRequestCommand } from "../commands/vacation/ApproveVacationRequest";
import { ApproveVacationGroupCommand, RejectVacationGroupCommand } from "../commands/vacation/DecideVacationGroup";
import { RejectVacationRequestCommand } from "../commands/vacation/RejectVacationRequest";
import { REVIEWER_ROLES, VacationStatus } from "../domain/enums";
import { authenticate, getQuery, pagination, parseIdParam, parseJsonBody, validate } from "../http/parse";
import { Authenticated, withActor } from "../http/withActor";
import { getOverview, listOfficeRequests, presentRequestsById } from "../queries/vacationQueries";
import { InputParserFn } from "./types";

// GET /requests (office dashboard)
const listQuery = pagination.extend({
	status: z.enum(VacationStatus).optional(),
	userId: z.coerce.number().int().positive().optional(),
});

export const parseListOffice: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	filter: validate(listQuery, getQuery(event)),
});

export const listOffice = withActor<Authenticated & { filter: z.infer<typeof listQuery> }>(
	async ({ filter }, actor, em) => listOfficeRequests(em, actor, filter),
	REVIEWER_ROLES,
);

// POST /requests/:id/approve, POST /groups/:id/approve
export const parseApprove: InputParserFn = (event: CommonEvent) => ({ userId: authenticate(event), id: parseIdParam(event) });

// The role check lives in the command handler (rule 6), against the role just loaded from the database.
export const approveRequest = withActor<Authenticated & { id: number }>(async ({ id }, actor, em) => {
	const request = await commandBus.execute(new ApproveVacationRequestCommand(actor, id));
	const [full] = await presentRequestsById(em, [request.id], actor);
	return full;
});

// POST /requests/:id/reject, POST /groups/:id/reject
const rejectSchema = z.object({
	comment: z.string({ error: "A comment is required" }).trim().min(1, "A comment is required").max(500),
});

/** Rule 5 at the front door: the comment is in the request itself. */
export const parseReject: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	id: parseIdParam(event),
	...validate(rejectSchema, parseJsonBody(event)),
});

export const rejectRequest = withActor<Authenticated & { id: number; comment: string }>(async ({ id, comment }, actor, em) => {
	const request = await commandBus.execute(new RejectVacationRequestCommand(actor, id, comment));
	const [full] = await presentRequestsById(em, [request.id], actor);
	return full;
});

// Approve all / Reject all for a trip (decisions.md #15). Returns the rows that were decided.
export const approveGroup = withActor<Authenticated & { id: number }>(async ({ id }, actor, em) => {
	const decided = await commandBus.execute(new ApproveVacationGroupCommand(actor, id));
	return presentRequestsById(em, decided.map((r) => r.id), actor);
});

export const rejectGroup = withActor<Authenticated & { id: number; comment: string }>(async ({ id, comment }, actor, em) => {
	const decided = await commandBus.execute(new RejectVacationGroupCommand(actor, id, comment));
	return presentRequestsById(em, decided.map((r) => r.id), actor);
});

// GET /stats/overview
const yearQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });

export const parseOverview: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	...validate(yearQuery, getQuery(event)),
});

export const overview = withActor<Authenticated & { year?: number }>(
	async ({ year }, actor, em) => getOverview(em, actor, year ?? DateTime.now().setZone(actor.timezone).year),
	REVIEWER_ROLES,
);
