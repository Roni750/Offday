import { MigrationInterface, QueryRunner } from "typeorm";

/** Admins manage every office of their workspace, so the role is named after the workspace. */
export class WorkspaceAdminRole1760800000000 implements MigrationInterface {
	name = "WorkspaceAdminRole1760800000000";

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TYPE user_role RENAME VALUE 'OfficeAdmin' TO 'WorkspaceAdmin'`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TYPE user_role RENAME VALUE 'WorkspaceAdmin' TO 'OfficeAdmin'`);
	}
}
