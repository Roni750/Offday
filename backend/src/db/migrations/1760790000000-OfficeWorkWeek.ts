import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Working days per office, as ISO weekdays (1 = Monday ... 7 = Sunday). Day counts, the calendar's
 * weekend shading and "a request must include a working day" all follow the office's week.
 */
export class OfficeWorkWeek1760790000000 implements MigrationInterface {
	name = "OfficeWorkWeek1760790000000";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			ALTER TABLE offices
				ADD COLUMN work_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
				ADD CONSTRAINT offices_work_days_valid CHECK (
					cardinality(work_days) BETWEEN 1 AND 7
					AND work_days <@ '{1,2,3,4,5,6,7}'::smallint[]
				)`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE offices DROP CONSTRAINT offices_work_days_valid, DROP COLUMN work_days`);
	}
}
