import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Vacation with colleagues (decisions.md #15): one request row per person, linked by a group.
 *
 * Backwards compatible with the API version that is still live while this runs (#13): that code never writes
 * group_id, so its rows are covered by vacation_no_overlap_own exactly as they were by vacation_no_overlap.
 * The new constraints are added before the old one is dropped, so overlaps are never unprotected.
 */
export class VacationGroups1760820000000 implements MigrationInterface {
	name = "VacationGroups1760820000000";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE vacation_groups (
				id            serial PRIMARY KEY,
				office_id     integer     NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
				organizer_id  integer     REFERENCES users(id) ON DELETE SET NULL,
				created_at    timestamptz NOT NULL DEFAULT now()
			)`);
		await queryRunner.query(`CREATE INDEX vacation_groups_office_idx ON vacation_groups (office_id)`);

		// Nullable, no default: nothing to backfill, and the deployed code keeps inserting without them.
		await queryRunner.query(`
			ALTER TABLE vacation_requests
				ADD COLUMN group_id integer REFERENCES vacation_groups(id) ON DELETE SET NULL,
				ADD COLUMN added_by integer REFERENCES users(id) ON DELETE SET NULL`);
		await queryRunner.query(`CREATE INDEX vacation_group_idx ON vacation_requests (group_id) WHERE group_id IS NOT NULL`);
		// One row per person per trip.
		await queryRunner.query(`CREATE UNIQUE INDEX vacation_group_member_unique ON vacation_requests (group_id, user_id) WHERE group_id IS NOT NULL`);

		// Rule 2 for everything a person submits alone: unchanged.
		await queryRunner.query(`
			ALTER TABLE vacation_requests ADD CONSTRAINT vacation_no_overlap_own EXCLUDE USING gist (
				user_id WITH =,
				tstzrange(start_date, end_date, '[)') WITH &&
			) WHERE (status <> 'Rejected' AND group_id IS NULL)`);
		// For everyone, trip rows included: never two overlapping approved requests.
		await queryRunner.query(`
			ALTER TABLE vacation_requests ADD CONSTRAINT vacation_no_overlap_approved EXCLUDE USING gist (
				user_id WITH =,
				tstzrange(start_date, end_date, '[)') WITH &&
			) WHERE (status = 'Approved')`);
		await queryRunner.query(`ALTER TABLE vacation_requests DROP CONSTRAINT vacation_no_overlap`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// The original rule can't hold for trip rows that overlap another non-rejected request of the same person.
		// Every such pair includes at least one trip row (vacation_no_overlap_own forbids the others): delete it,
		// or the later one when both are trip rows.
		await queryRunner.query(`
			DELETE FROM vacation_requests r
			USING vacation_requests o
			WHERE r.group_id IS NOT NULL
				AND r.status <> 'Rejected' AND o.status <> 'Rejected'
				AND o.user_id = r.user_id AND o.id <> r.id
				AND tstzrange(r.start_date, r.end_date, '[)') && tstzrange(o.start_date, o.end_date, '[)')
				AND (o.group_id IS NULL OR o.id < r.id)`);
		await queryRunner.query(`
			ALTER TABLE vacation_requests ADD CONSTRAINT vacation_no_overlap EXCLUDE USING gist (
				user_id WITH =,
				tstzrange(start_date, end_date, '[)') WITH &&
			) WHERE (status <> 'Rejected')`);
		await queryRunner.query(`ALTER TABLE vacation_requests DROP CONSTRAINT vacation_no_overlap_approved`);
		await queryRunner.query(`ALTER TABLE vacation_requests DROP CONSTRAINT vacation_no_overlap_own`);
		await queryRunner.query(`DROP INDEX IF EXISTS vacation_group_member_unique`);
		await queryRunner.query(`DROP INDEX IF EXISTS vacation_group_idx`);
		await queryRunner.query(`ALTER TABLE vacation_requests DROP COLUMN added_by, DROP COLUMN group_id`);
		await queryRunner.query(`DROP TABLE IF EXISTS vacation_groups`);
	}
}
