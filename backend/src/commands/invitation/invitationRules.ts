import { EntityManager, QueryFailedError } from "typeorm";
import { EmailTakenError, ForbiddenError, NotFoundError } from "../../core/errors";
import { Invitation, creatorCanVouch, invitationStatus } from "../../domain/Invitation";
import { Office } from "../../domain/Office";
import { User } from "../../domain/User";

/** Rules shared by the invitation preview and accept paths. Everything here may use the database. */

/**
 * The one answer for every link that can't be used: unknown, malformed, revoked, expired, used up, or created by
 * someone who is no longer an admin of that workspace. The body is byte-identical in every case, so a response
 * never tells a token-guesser which of these it hit.
 */
export const INVALID_INVITE_MESSAGE = "This invite link is invalid or has expired. Ask your admin for a new one.";
export const invalidInvite = (): NotFoundError => new NotFoundError(INVALID_INVITE_MESSAGE);

export const EMAIL_TAKEN_MESSAGE = "An account already exists for this email. Sign in instead.";
const emailTaken = () => new EmailTakenError(EMAIL_TAKEN_MESSAGE, { fields: { email: EMAIL_TAKEN_MESSAGE } });

export interface UsableInvitation {
	invitation: Invitation;
	/** With its workspace loaded. */
	office: Office;
}

/**
 * Finds an invitation by token hash and checks it can still be used right now. With `lock`, the row is locked
 * (`SELECT … FOR UPDATE`) for the rest of the transaction, so concurrent accepts of the same link run one after
 * the other and each sees the previous one's use count.
 *
 * The creator's authority is checked at use time, not only when the link was made: a link stops working
 * when its creator is demoted, moved out of the workspace or deleted.
 */
export const findUsableInvitation = async (em: EntityManager, tokenHash: Buffer, options: { lock?: boolean } = {}): Promise<UsableInvitation> => {
	const query = em.createQueryBuilder(Invitation, "i").where("i.token_hash = :tokenHash", { tokenHash });
	if (options.lock) query.setLock("pessimistic_write");
	const invitation = await query.getOne();
	if (!invitation || invitationStatus(invitation) !== "Active") throw invalidInvite();

	const office = await em.findOne(Office, { where: { id: invitation.officeId }, relations: { workspace: true } });
	const creator = invitation.createdById
		? await em.findOne(User, { where: { id: invitation.createdById }, relations: { office: true } })
		: null;
	if (!office || !creatorCanVouch(creator, office.workspaceId)) throw invalidInvite();
	return { invitation, office };
};

/** A personal link can only be accepted with its own email (both stored and compared lowercase). */
export const assertEmailMatches = (invitation: Invitation, email: string): void => {
	if (invitation.email && invitation.email !== email) throw new ForbiddenError("This invite is for a different email address.");
};

export const assertEmailAvailable = async (em: EntityManager, email: string): Promise<void> => {
	if (await em.existsBy(User, { email })) throw emailTaken();
};

/**
 * Everything accepting checks before writing: the link is usable, the email fits it and is free.
 * Run once cheaply before hashing the password, and again under the row lock inside the transaction.
 */
export const assertCanAccept = async (em: EntityManager, tokenHash: Buffer, email: string, options: { lock?: boolean } = {}): Promise<UsableInvitation> => {
	const usable = await findUsableInvitation(em, tokenHash, options);
	assertEmailMatches(usable.invitation, email);
	await assertEmailAvailable(em, email);
	return usable;
};

const isEmailUniqueViolation = (err: unknown): boolean => {
	if (!(err instanceof QueryFailedError)) return false;
	const driverError = err.driverError as { code?: string; constraint?: string } | undefined;
	return driverError?.code === "23505" && driverError.constraint === "users_email_unique";
};

/**
 * Runs the user insert. The unique index catches what the pre-check can't: the same email signing up through
 * two links at the same moment. It answers like the pre-check does.
 */
export const withEmailTakenGuard = async <T>(write: () => Promise<T>): Promise<T> => {
	try {
		return await write();
	} catch (err) {
		if (isEmailUniqueViolation(err)) throw emailTaken();
		throw err;
	}
};
