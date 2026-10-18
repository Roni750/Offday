// Prepares a disposable database and a running API for the end-to-end suite.
import { ChildProcess, execSync, spawn } from "node:child_process";
import { openSync } from "node:fs";
import { resolve } from "node:path";

const BACKEND_DIR = resolve(__dirname, "../..");
export const E2E_PORT = 8898;
const DEFAULT_DB = "postgresql://offday:offday@localhost:5433/offday";

let server: ChildProcess | undefined;

/**
 * The suite truncates and reseeds the database, so it only runs against a local one
 * (the docker-compose Postgres by default), never against a shared or hosted database.
 */
const resolveDatabaseUrl = (): string => {
	const url = process.env.E2E_DATABASE_URL ?? DEFAULT_DB;
	const host = new URL(url).hostname;
	if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
		throw new Error(`Refusing to run e2e tests against non-local database host "${host}". Set E2E_DATABASE_URL to a local database.`);
	}
	return url;
};

const testEnv = (databaseUrl: string): NodeJS.ProcessEnv => ({
	...process.env,
	// Explicit values win over backend/.env (dotenv and CEF's loadEnv never override existing variables).
	DATABASE_URL: databaseUrl,
	MIGRATION_DATABASE_URL: databaseUrl,
	DB_SSL: "false",
	JWT_SECRET: "e2e-test-secret-not-for-production",
	JWT_EXPIRES_IN: "1h",
});

const run = (command: string, env: NodeJS.ProcessEnv) => execSync(command, { cwd: BACKEND_DIR, env, stdio: "pipe" });

const waitForHealth = async (timeoutMs = 60_000): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`http://localhost:${E2E_PORT}/health`);
			if (res.ok) return;
		} catch {
			// Not up yet.
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`API didn't become healthy on port ${E2E_PORT}`);
};

export async function setup(): Promise<void> {
	const env = testEnv(resolveDatabaseUrl());
	run("npm run migration:run", env);
	run("npm run seed", env);

	// Server output goes to tests/e2e/server.log for debugging failed runs.
	const log = openSync(resolve(__dirname, "server.log"), "w");
	server = spawn("npx", ["ts-node", "src/index.ts", "--local", String(E2E_PORT)], {
		cwd: BACKEND_DIR,
		env,
		shell: true,
		stdio: ["ignore", log, log],
	});
	await waitForHealth();
}

export async function teardown(): Promise<void> {
	if (server?.pid) {
		// The server runs behind npx/a shell, so stop the whole process tree.
		if (process.platform === "win32") execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
		else process.kill(-server.pid, "SIGTERM");
	}
	// Leave the database in the demo state.
	run("npm run seed", testEnv(resolveDatabaseUrl()));
}
