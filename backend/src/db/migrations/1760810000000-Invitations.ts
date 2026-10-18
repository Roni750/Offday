import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Invite links: a workspace admin creates a link for one office, the invitee opens it and creates their account there.
 * Only the SHA-256 of the token is stored. The rules that make a link safe (single use when tied to an email,
 * a 30-day ceiling, admin links personal and short-lived) are constraints, so no code path can create a looser link.
 */
export class Invitations1760810000000 implements MigrationInterface {
	name = "Invitations1760810000000";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE invitations (
				id          serial PRIMARY KEY,
				office_id   integer      NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
				created_by  integer      REFERENCES users(id) ON DELETE SET NULL,
				role        user_role    NOT NULL DEFAULT 'Requester',
				token_hash  bytea        NOT NULL,
				label       varchar(80),
				email       varchar(254),
				max_uses    integer      NOT NULL,
				use_count   integer      NOT NULL DEFAULT 0,
				expires_at  timestamptz  NOT NULL,
				revoked_at  timestamptz,
				revoked_by  integer      REFERENCES users(id) ON DELETE SET NULL,
				created_at  timestamptz  NOT NULL DEFAULT now(),

				-- sha256 digest, never the token itself.
				CONSTRAINT invitations_token_hash_length CHECK (octet_length(token_hash) = 32),
				CONSTRAINT invitations_email_lowercase CHECK (email IS NULL OR email = lower(email)),
				CONSTRAINT invitations_max_uses_range CHECK (max_uses BETWEEN 1 AND 200),
				CONSTRAINT invitations_use_count_range CHECK (use_count BETWEEN 0 AND max_uses),
				CONSTRAINT invitations_expiry_window
					CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days'),

				-- A personal link (tied to one email) is single use.
				CONSTRAINT invitations_personal_single_use CHECK (email IS NULL OR max_uses = 1),

				-- Admin rights only through a personal, single-use link that expires within 72 hours.
				CONSTRAINT invitations_admin_guard CHECK (
					role <> 'WorkspaceAdmin'
					OR (email IS NOT NULL AND max_uses = 1 AND expires_at <= created_at + interval '72 hours')
				)
			)`);
		await queryRunner.query(`CREATE UNIQUE INDEX invitations_token_hash_unique ON invitations (token_hash)`);
		await queryRunner.query(`CREATE INDEX invitations_office_created_idx ON invitations (office_id, created_at DESC)`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE IF EXISTS invitations`);
	}
}
