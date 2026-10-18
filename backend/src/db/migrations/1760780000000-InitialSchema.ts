import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Initial multi-tenant schema: workspaces > offices > users > vacation_requests, plus audit_log.
 * Business rules that must hold regardless of which code writes the data live here as constraints.
 */
export class InitialSchema1760780000000 implements MigrationInterface {
	name = "InitialSchema1760780000000";

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Lets one GiST exclusion constraint combine "=" on user_id with "&&" on time ranges.
		await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

		await queryRunner.query(`CREATE TYPE user_role AS ENUM ('Requester', 'Validator', 'OfficeAdmin')`);
		await queryRunner.query(`CREATE TYPE vacation_status AS ENUM ('Pending', 'Approved', 'Rejected')`);

		await queryRunner.query(`
			CREATE TABLE workspaces (
				id          serial PRIMARY KEY,
				name        varchar(120) NOT NULL,
				slug        varchar(60)  NOT NULL UNIQUE,
				created_at  timestamptz  NOT NULL DEFAULT now()
			)`);

		await queryRunner.query(`
			CREATE TABLE offices (
				id            serial PRIMARY KEY,
				workspace_id  integer      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
				name          varchar(120) NOT NULL,
				timezone      varchar(64)  NOT NULL,
				created_at    timestamptz  NOT NULL DEFAULT now(),
				UNIQUE (workspace_id, name)
			)`);

		await queryRunner.query(`
			CREATE TABLE users (
				id          serial PRIMARY KEY,
				office_id   integer      NOT NULL REFERENCES offices(id) ON DELETE RESTRICT,
				name        varchar(120) NOT NULL,
				email       varchar(254) NOT NULL,
				password    varchar(100) NOT NULL,
				role        user_role    NOT NULL DEFAULT 'Requester',
				created_at  timestamptz  NOT NULL DEFAULT now(),
				CONSTRAINT users_email_lowercase CHECK (email = lower(email))
			)`);
		await queryRunner.query(`CREATE UNIQUE INDEX users_email_unique ON users (email)`);
		await queryRunner.query(`CREATE INDEX users_office_idx ON users (office_id)`);

		await queryRunner.query(`
			CREATE TABLE vacation_requests (
				id          serial PRIMARY KEY,
				user_id     integer         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				start_date  timestamptz     NOT NULL,
				end_date    timestamptz     NOT NULL,
				reason      varchar(240),
				status      vacation_status NOT NULL DEFAULT 'Pending',
				comments    varchar(500),
				decided_by  integer         REFERENCES users(id) ON DELETE SET NULL,
				decided_at  timestamptz,
				created_at  timestamptz     NOT NULL DEFAULT now(),
				updated_at  timestamptz     NOT NULL DEFAULT now(),

				-- Rule 1: end after start (same-day partial requests allowed).
				CONSTRAINT vacation_end_after_start CHECK (end_date > start_date),

				-- Rule 5: a rejected request carries a non-empty comment.
				CONSTRAINT vacation_rejection_has_comment
					CHECK (status <> 'Rejected' OR (comments IS NOT NULL AND btrim(comments) <> '')),

				-- A decision records who made it and when.
				CONSTRAINT vacation_decision_recorded
					CHECK ((status = 'Pending') = (decided_at IS NULL)),

				-- Rule 2: no overlapping non-rejected requests for the same user, even under concurrent writes.
				-- Half-open ranges '[)': a request ending at 13:00 and one starting at 13:00 don't overlap.
				CONSTRAINT vacation_no_overlap EXCLUDE USING gist (
					user_id WITH =,
					tstzrange(start_date, end_date, '[)') WITH &&
				) WHERE (status <> 'Rejected')
			)`);
		await queryRunner.query(`CREATE INDEX vacation_user_start_idx ON vacation_requests (user_id, start_date DESC)`);
		await queryRunner.query(`CREATE INDEX vacation_status_idx ON vacation_requests (status)`);

		await queryRunner.query(`
			CREATE TABLE audit_log (
				id           bigserial PRIMARY KEY,
				office_id    integer     NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
				actor_id     integer     REFERENCES users(id) ON DELETE SET NULL,
				event_type   varchar(80) NOT NULL,
				entity_type  varchar(40) NOT NULL,
				entity_id    integer     NOT NULL,
				payload      jsonb       NOT NULL DEFAULT '{}',
				occurred_at  timestamptz NOT NULL DEFAULT now()
			)`);
		await queryRunner.query(`CREATE INDEX audit_office_time_idx ON audit_log (office_id, occurred_at DESC)`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE IF EXISTS audit_log`);
		await queryRunner.query(`DROP TABLE IF EXISTS vacation_requests`);
		await queryRunner.query(`DROP TABLE IF EXISTS users`);
		await queryRunner.query(`DROP TABLE IF EXISTS offices`);
		await queryRunner.query(`DROP TABLE IF EXISTS workspaces`);
		await queryRunner.query(`DROP TYPE IF EXISTS vacation_status`);
		await queryRunner.query(`DROP TYPE IF EXISTS user_role`);
	}
}
