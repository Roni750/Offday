import { CommonEvent } from "commoneventframework/dist/types/commonEvent";
import { z } from "zod";
import { commandBus } from "../app";
import { ChangeUserRoleCommand } from "../commands/office/ChangeUserRole";
import { UpdateOfficeTimezoneCommand } from "../commands/office/UpdateOfficeTimezone";
import { UpdateOfficeWorkWeekCommand } from "../commands/office/UpdateOfficeWorkWeek";
import { ADMIN_ROLES, REVIEWER_ROLES, Role } from "../domain/enums";
import { canonicalTimezone, isValidTimezone } from "../domain/officeTime";
import { Office } from "../domain/Office";
import { authenticate, bothDates, getQuery, parseIdParam, parseJsonBody, validate } from "../http/parse";
import { Authenticated, withActor } from "../http/withActor";
import { findWorkspaceOffice, listOfficeUsers, listWorkspaceOffices, toWorkspaceOffice } from "../queries/officeQueries";
import { getTeamCalendar } from "../queries/vacationQueries";
import { toUserSummary } from "../queries/serializers";
import { InputParserFn } from "./types";

// Wide enough for the request form's 12-month look-ahead (overlaps, "next time off", teammates off).
const MAX_CALENDAR_DAYS = 400;

// GET /team/calendar?from&to
const calendarQuery = z.object({
	from: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
	to: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
})
	// Zod 4 runs object refinements even if a field already failed, so they only judge valid dates.
	.refine((q) => !bothDates(q.from, q.to) || q.to > q.from, { path: ["to"], message: "'to' must be after 'from'" })
	.refine((q) => !bothDates(q.from, q.to) || q.to.getTime() - q.from.getTime() <= MAX_CALENDAR_DAYS * 86_400_000,
		{ path: ["to"], message: `The range can't exceed ${MAX_CALENDAR_DAYS} days` });

export const parseCalendar: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	...validate(calendarQuery, getQuery(event)),
});

export const teamCalendar = withActor<Authenticated & z.infer<typeof calendarQuery>>(async ({ from, to }, actor, em) =>
	getTeamCalendar(em, actor, from, to));

// GET /office/users
export const officeUsers = withActor(async (_input, actor, em) => listOfficeUsers(em, actor.officeId), REVIEWER_ROLES);

// PUT /users/:id/role
const roleSchema = z.object({ role: z.enum(Role) });

export const parseChangeRole: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	targetUserId: parseIdParam(event),
	...validate(roleSchema, parseJsonBody(event)),
});

export const changeRole = withActor<Authenticated & { targetUserId: number; role: Role }>(async ({ targetUserId, role }, actor) =>
	toUserSummary(await commandBus.execute(new ChangeUserRoleCommand(actor, targetUserId, role))));

// GET /office
export const getOffice = withActor(async (_input, actor, em) =>
	toWorkspaceOffice(await em.findOneByOrFail(Office, { id: actor.officeId }), actor));

// PUT /office/timezone, PUT /offices/:id/timezone
const timezoneSchema = z.object({
	// Stored in canonical spelling ("europe/paris" → "Europe/Paris") so every office uses the same names.
	timezone: z.string().refine(isValidTimezone, "Must be a valid IANA time zone, e.g. Asia/Jerusalem").transform(canonicalTimezone),
});

export const parseTimezone: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	...validate(timezoneSchema, parseJsonBody(event)),
});

export const updateTimezone = withActor<Authenticated & { timezone: string; officeId?: number }>(async ({ timezone, officeId }, actor) =>
	toWorkspaceOffice(await commandBus.execute(new UpdateOfficeTimezoneCommand(actor, officeId ?? actor.officeId, timezone)), actor));

// PUT /office/work-week, PUT /offices/:id/work-week
const workWeekSchema = z.object({
	workDays: z.array(z.number().int().min(1).max(7), { error: "workDays must be a list of ISO weekdays (1 = Monday ... 7 = Sunday)" })
		.min(1, "Pick at least one working day")
		.refine((days) => new Set(days).size === days.length, "Each weekday can appear only once"),
});

export const parseWorkWeek: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	...validate(workWeekSchema, parseJsonBody(event)),
});

export const updateWorkWeek = withActor<Authenticated & { workDays: number[]; officeId?: number }>(async ({ workDays, officeId }, actor) =>
	toWorkspaceOffice(await commandBus.execute(new UpdateOfficeWorkWeekCommand(actor, officeId ?? actor.officeId, workDays)), actor));

// ---- Workspace administration: any office of the caller's workspace (OfficeAdmin) ----

// GET /workspace/offices
export const workspaceOffices = withActor(async (_input, actor, em) => listWorkspaceOffices(em, actor), ADMIN_ROLES);

export const parseOfficeId: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	officeId: parseIdParam(event),
});

type OfficeInput = Authenticated & { officeId: number };

// GET /offices/:id
export const getWorkspaceOffice = withActor<OfficeInput>(async ({ officeId }, actor, em) =>
	toWorkspaceOffice(await findWorkspaceOffice(em, actor, officeId), actor), ADMIN_ROLES);

// GET /offices/:id/users
export const workspaceOfficeUsers = withActor<OfficeInput>(async ({ officeId }, actor, em) => {
	const office = await findWorkspaceOffice(em, actor, officeId);
	return listOfficeUsers(em, office.id);
}, ADMIN_ROLES);

export const parseOfficeTimezone: InputParserFn = (event: CommonEvent) => ({
	...parseTimezone(event),
	officeId: parseIdParam(event),
});

export const parseOfficeWorkWeek: InputParserFn = (event: CommonEvent) => ({
	...parseWorkWeek(event),
	officeId: parseIdParam(event),
});
