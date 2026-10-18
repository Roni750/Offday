import "reflect-metadata";
import { DataSource } from "typeorm";
// Static import so esbuild (cef-build) bundles the driver; TypeORM's own require("pg") is dynamic.
import * as pg from "pg";

let dataSource: DataSource | undefined;

// Built lazily: CEF's loadEnv() is async, so process.env is not ready at import time.
// Reused across warm Lambda invocations.
export const getDataSource = async (): Promise<DataSource> => {
	if (!dataSource) {
		const sslEnabled = process.env.DB_SSL === "true";
		dataSource = new DataSource({
			type: "postgres",
			driver: pg,
			url: process.env.DATABASE_URL,
			ssl: sslEnabled ? { ca: process.env.DB_CA_CERT?.replace(/\\n/g, "\n") } : false,
			entities: [],
			synchronize: false,
			extra: { max: 2 },
		});
	}
	if (!dataSource.isInitialized) await dataSource.initialize();
	return dataSource;
};
