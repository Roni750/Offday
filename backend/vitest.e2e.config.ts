import { defineConfig } from "vitest/config";

// End-to-end tests: real API + local Postgres. Run with `npm run test:e2e` (needs `docker compose up -d`).
export default defineConfig({
	test: {
		include: ["tests/e2e/**/*.e2e.test.ts"],
		globalSetup: ["tests/e2e/globalSetup.ts"],
		// One database, ordered scenarios: run sequentially.
		fileParallelism: false,
		sequence: { concurrent: false },
		testTimeout: 20_000,
		hookTimeout: 120_000,
	},
});
