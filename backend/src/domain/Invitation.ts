import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Role } from "./enums";
import type { Office } from "./Office";
import type { User } from "./User";

/**
 * Link and password limits. The migration's CHECK constraints hold the link limits too; the frontend mirrors
 * them (validation/joinForm.ts and the admin form) for readable errors.
 */
export const INVITE_LIMITS = {
	maxUses: 200,
	defaultTeamUses: 25,
	maxDays: 30,
	defaultDays: 7,
	/** Admin links: at most 72 hours. */
	adminMaxDays: 3,
	passwordMinChars: 10,
	/** bcrypt ignores everything after 72 bytes. */
	passwordMaxBytes: 72,
} as const;

export type InvitationKind = "personal" | "team";
export type InvitationStatus = "Active" | "Expired" | "Revoked" | "UsedUp";

/**
 * An invite link to one office. "Personal" links are tied to one email and single use; "team" links have no email
 * and a number of uses. The token itself is never stored, only its SHA-256 (see auth/inviteTokens.ts).
 */
@Entity({ name: "invitations" })
export class Invitation {
	@PrimaryGeneratedColumn({ type: "integer" })
	id!: number;

	@Column({ type: "integer", name: "office_id" })
	officeId!: number;

	@ManyToOne("Office", { onDelete: "CASCADE" })
	@JoinColumn({ name: "office_id" })
	office!: Office;

	@Column({ type: "integer", name: "created_by", nullable: true })
	createdById!: number | null;

	@ManyToOne("User", { onDelete: "SET NULL", nullable: true })
	@JoinColumn({ name: "created_by" })
	createdBy!: User | null;

	@Column({ type: "enum", enum: Role, enumName: "user_role", default: Role.Requester })
	role!: Role;

	/** sha256(token), 32 bytes. Excluded from default selects so it never reaches a response by accident. */
	@Column({ type: "bytea", name: "token_hash", select: false })
	tokenHash!: Buffer;

	@Column({ type: "varchar", length: 80, nullable: true })
	label!: string | null;

	/** Set on personal links: only this email (lowercase) can accept. */
	@Column({ type: "varchar", length: 254, nullable: true })
	email!: string | null;

	@Column({ type: "integer", name: "max_uses" })
	maxUses!: number;

	@Column({ type: "integer", name: "use_count", default: 0 })
	useCount!: number;

	@Column({ type: "timestamptz", name: "expires_at" })
	expiresAt!: Date;

	@Column({ type: "timestamptz", name: "revoked_at", nullable: true })
	revokedAt!: Date | null;

	@Column({ type: "integer", name: "revoked_by", nullable: true })
	revokedById!: number | null;

	@CreateDateColumn({ type: "timestamptz", name: "created_at" })
	createdAt!: Date;
}

/** A link tied to an email is personal; one without is a team link. */
export const invitationKind = (invitation: Invitation): InvitationKind => (invitation.email ? "personal" : "team");

/** Revoked wins over used up, which wins over expired. */
export const invitationStatus = (invitation: Invitation, now = new Date()): InvitationStatus => {
	if (invitation.revokedAt) return "Revoked";
	if (invitation.useCount >= invitation.maxUses) return "UsedUp";
	if (invitation.expiresAt <= now) return "Expired";
	return "Active";
};
