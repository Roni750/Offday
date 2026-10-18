import { defineConfig } from "vitest/config";

// Unit tests: pure domain logic, no database. Run with `npm test`.
export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
	},
});
