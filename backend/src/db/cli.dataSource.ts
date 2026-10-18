// Data source for the TypeORM CLI (migrations) and the seed script; not bundled into the Lambda.
import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "./dataSourceOptions";
import { InitialSchema1760780000000 } from "./migrations/1760780000000-InitialSchema";
import { OfficeWorkWeek1760790000000 } from "./migrations/1760790000000-OfficeWorkWeek";
import { WorkspaceAdminRole1760800000000 } from "./migrations/1760800000000-WorkspaceAdminRole";
import { Invitations1760810000000 } from "./migrations/1760810000000-Invitations";
import { VacationGroups1760820000000 } from "./migrations/1760820000000-VacationGroups";

export default new DataSource({
	...buildDataSourceOptions(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL),
	migrations: [InitialSchema1760780000000, OfficeWorkWeek1760790000000, WorkspaceAdminRole1760800000000, Invitations1760810000000, VacationGroups1760820000000],
	migrationsTableName: "migrations",
});
