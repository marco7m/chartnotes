import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "jsdom",
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: [
				"node_modules/",
				"**/*.config.*",
				"**/main.ts",
				"**/version-bump.mjs",
				"**/esbuild.config.mjs",
			],
		},
	},
});

