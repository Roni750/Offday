import bcrypt from "bcryptjs";
import { Response } from "commoneventframework";
import { CommonEvent } from "commoneventframework/dist/types/commonEvent";
import { z } from "zod";
import { commandBus } from "../app";
import { hashInviteToken, isWellFormedInviteToken } from "../auth/inviteTokens";
import { loadActor } from "../auth/loadActor";
import { signToken } from "../auth/tokens";
import { AcceptInvitationCommand } from "../commands/invitation/AcceptInvitation";
import { CreateInvitationCommand, InvitationSpec } from "../commands/invitation/CreateInvitation";
import { RevokeInvitationCommand } from "../commands/invitation/RevokeInvitation";
import { assertCanAccept, findUsableInvitation, invalidInvite } from "../commands/invitation/invitationRules";
import { getDataSource } from "../db/dataSource";
import { ADMIN_ROLES, Role } from "../domain/enums";
import { INVITE_LIMITS } from "../domain/Invitation";
import { authenticate, parseIdParam, parseJsonBody, validate } from "../http/parse";
import { Authenticated, withActor } from "../http/withActor";
import { listOfficeInvitations, toInvitationPreview, toInvitationSummary } from "../queries/invitationQueries";
import { toMe } from "../queries/serializers";
import { HandlerFn, InputParserFn } from "./types";

/**
 * Invite links. The raw token only exists in two places on the server: the create response (shown once) and
 * the inputParsers below, which hash it immediately. Handlers, commands, events and logs only see the hash.
 */

const emailField = z.string({ error: "Enter an email address" }).trim().toLowerCase().email().max(254);

// ---- POST /offices/:id/invitations ------------------------------------------

const createSchema = z.object({
	kind: z.enum(["personal", "team"], { error: "Choose a personal or a team link" }),
	role: z.enum(Role).default(Role.Requester),
	email: emailField.nullish(),
	maxUses: z.number({ error: "Must be a whole number" }).int("Must be a whole number").min(1).max(INVITE_LIMITS.maxUses).nullish(),
	expiresInDays: z.number({ error: "Must be a whole number of days" }).int("Must be a whole number of days")
		.min(1, "Must be at least 1 day").max(INVITE_LIMITS.maxDays, `Links expire within ${INVITE_LIMITS.maxDays} days`).nullish(),
	label: z.string({ error: "Must be text" }).trim().max(80, "Keep the label to 80 characters or fewer").nullish(),
})
	// Zod 4 runs object refinements even if a field already failed, so these only judge what they need.
	.superRefine((value, ctx) => {
		const personal = value.kind === "personal";
		if (personal && !value.email) ctx.addIssue({ code: "custom", path: ["email"], message: "Enter the email this link is for" });
		if (personal && value.maxUses != null && value.maxUses !== 1) {
			ctx.addIssue({ code: "custom", path: ["maxUses"], message: "A personal link can be used once" });
		}
		if (value.kind === "team" && value.email) {
			ctx.addIssue({ code: "custom", path: ["email"], message: "Team links aren't tied to an email. Use a personal link instead" });
		}
		if (value.role === Role.WorkspaceAdmin) {
			if (value.kind === "team") {
				ctx.addIssue({ code: "custom", path: ["role"], message: "Workspace admin links must be personal: one email, used once" });
			}
			if (value.expiresInDays != null && value.expiresInDays > INVITE_LIMITS.adminMaxDays) {
				ctx.addIssue({ code: "custom", path: ["expiresInDays"], message: "Workspace admin links expire within 72 hours (3 days)" });
			}
		}
	})
	.transform((value): InvitationSpec => {
		const personal = value.kind === "personal";
		const admin = value.role === Role.WorkspaceAdmin;
		return {
			role: value.role,
			email: personal ? value.email ?? null : null,
			maxUses: personal ? 1 : value.maxUses ?? INVITE_LIMITS.defaultTeamUses,
			expiresInDays: value.expiresInDays ?? (admin ? INVITE_LIMITS.adminMaxDays : INVITE_LIMITS.defaultDays),
			label: value.label || null,
		};
	});

export const parseCreateInvitation: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	officeId: parseIdParam(event),
	spec: validate(createSchema, parseJsonBody(event)),
});

export const createInvitation = withActor<Authenticated & { officeId: number; spec: InvitationSpec }>(async ({ officeId, spec }, actor) => {
	const { invitation, token } = await commandBus.execute(new CreateInvitationCommand(actor, officeId, spec));
	return new Response(201, { invitation: toInvitationSummary(invitation, { id: actor.id, name: actor.name }), token });
}, ADMIN_ROLES);

// ---- GET /offices/:id/invitations -------------------------------------------

export const parseListInvitations: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	officeId: parseIdParam(event),
});

export const listInvitations = withActor<Authenticated & { officeId: number }>(async ({ officeId }, actor, em) =>
	listOfficeInvitations(em, actor, officeId), ADMIN_ROLES);

// ---- DELETE /offices/:officeId/invitations/:invitationId ---------------------

export const parseRevokeInvitation: InputParserFn = (event: CommonEvent) => ({
	userId: authenticate(event),
	officeId: parseIdParam(event, "officeId"),
	invitationId: parseIdParam(event, "invitationId"),
});

export const revokeInvitation = withActor<Authenticated & { officeId: number; invitationId: number }>(async ({ officeId, invitationId }, actor) => {
	await commandBus.execute(new RevokeInvitationCommand(actor, officeId, invitationId));
	return new Response(204, {});
}, ADMIN_ROLES);

// ---- Public: POST /invitations/preview, POST /invitations/accept --------------

/** A malformed token gets the same 404 as an unknown one, before any database work. */
const readTokenHash = (body: unknown): Buffer => {
	const token = typeof body === "object" && body !== null ? (body as { token?: unknown }).token : undefined;
	if (!isWellFormedInviteToken(token)) throw invalidInvite();
	return hashInviteToken(token);
};

type TokenInput = { tokenHash: Buffer };

export const parsePreviewInvitation: InputParserFn = (event: CommonEvent): TokenInput => ({
	tokenHash: readTokenHash(parseJsonBody(event)),
});

export const previewInvitation: HandlerFn = async ({ tokenHash }: TokenInput) => {
	const { manager } = await getDataSource();
	return toInvitationPreview(await findUsableInvitation(manager, tokenHash));
};

const acceptSchema = z.object({
	name: z.string({ error: "Enter your name" }).trim().min(1, "Enter your name").max(120, "Keep your name to 120 characters or fewer"),
	email: emailField,
	password: z.string({ error: "Choose a password" })
		.min(INVITE_LIMITS.passwordMinChars, `Use at least ${INVITE_LIMITS.passwordMinChars} characters`)
		.refine((p) => Buffer.byteLength(p, "utf8") <= INVITE_LIMITS.passwordMaxBytes,
			"Too long: keep it to 72 characters (fewer with accents or emoji)"),
})
	.refine((v) => typeof v.password !== "string" || typeof v.email !== "string" || v.password.trim().toLowerCase() !== v.email,
		{ path: ["password"], message: "Your password can't be your email address" });

type AcceptInput = TokenInput & z.infer<typeof acceptSchema>;

/** Public: any Authorization header is ignored. The schema drops unknown keys, so the raw token goes no further. */
export const parseAcceptInvitation: InputParserFn = (event: CommonEvent): AcceptInput => {
	const body = parseJsonBody(event);
	const tokenHash = readTokenHash(body);
	return { tokenHash, ...validate(acceptSchema, body) };
};

const BCRYPT_ROUNDS = 10;

export const acceptInvitation: HandlerFn = async ({ tokenHash, name, email, password }: AcceptInput) => {
	const { manager } = await getDataSource();
	// Cheap checks first, so bcrypt only runs for a request that should succeed.
	await assertCanAccept(manager, tokenHash, email);
	// Hashed outside the transaction, so the invitation row isn't locked while bcrypt runs.
	const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

	const user = await commandBus.execute(new AcceptInvitationCommand(tokenHash, name, email, passwordHash));
	const actor = await loadActor(manager, user.id);
	// Same shape as POST /auth/login: the new user is signed in.
	return new Response(201, { token: signToken(user.id), user: toMe(actor) });
};
