// Data source for the TypeORM CLI (migrations) and the seed script; not bundled into the Lambda.
import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";
import { buildDataSourceOptions } from "./dataSourceOptions";
import { InitialSchema1760780000000 } from "./migrations/1760780000000-InitialSchema";

export default new DataSource({
	...buildDataSourceOptions(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL),
	migrations: [InitialSchema1760780000000],
	migrationsTableName: "migrations",
});
