import { Client } from "pg";

const DEFAULT_DB = "postgresql://offday:offday@localhost:5433/offday";

/**
 * The suite truncates and reseeds the database, and some scenarios edit rows directly, so it only runs against
 * a local one (the docker-compose Postgres by default), never against a shared or hosted database.
 */
export const resolveDatabaseUrl = (): string => {
	const url = process.env.E2E_DATABASE_URL ?? DEFAULT_DB;
	const host = new URL(url).hostname;
	if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
		throw new Error(`Refusing to run e2e tests against non-local database host "${host}". Set E2E_DATABASE_URL to a local database.`);
	}
	return url;
};

/** Runs one statement against the local test database, for setups the API can't produce (e.g. an expired link). */
export const sql = async <T extends Record<string, unknown> = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> => {
	const client = new Client({ connectionString: resolveDatabaseUrl() });
	await client.connect();
	try {
		return (await client.query<T>(text, params)).rows;
	} finally {
		await client.end();
	}
};
