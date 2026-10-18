import { DataSourceOptions } from "typeorm";
// Static import so esbuild (cef-build) bundles the driver; TypeORM's own require("pg") is dynamic.
import * as pg from "pg";
import { Workspace } from "../domain/Workspace";
import { Office } from "../domain/Office";
import { User } from "../domain/User";
import { VacationRequest } from "../domain/VacationRequest";
import { AuditLogEntry } from "../domain/AuditLogEntry";
import { Invitation } from "../domain/Invitation";

export const ENTITIES = [Workspace, Office, User, VacationRequest, AuditLogEntry, Invitation];

/** Reads env at call time: CEF's loadEnv() is async, so process.env isn't ready at import time. */
export const buildDataSourceOptions = (url = process.env.DATABASE_URL): DataSourceOptions => ({
	type: "postgres",
	driver: pg,
	url,
	ssl: process.env.DB_SSL === "true" ? { ca: process.env.DB_CA_CERT?.replace(/\\n/g, "\n") } : false,
	entities: ENTITIES,
	synchronize: false,
	// A long-running server serves many requests at once; a Lambda container serves one at a time (DB_POOL_MAX=2 there).
	extra: { max: Number(process.env.DB_POOL_MAX ?? 10) },
});
