import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: {
			rollupOptions: { input: { index: resolve("src/main/index.ts") } },
		},
		resolve: { alias: { "@shared": resolve("src/shared") } },
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: {
			rollupOptions: {
				input: { index: resolve("src/preload/index.ts") },
				// package.json is `"type": "module"`, so electron-vite emits `.mjs` by
				// default. A sandboxed preload is loaded as a classic script: an ESM
				// preload dies on its first `import` and leaves `window.api` undefined
				// with no visible error. CJS here is what keeps `sandbox: true` usable.
				output: { format: "cjs", entryFileNames: "[name].cjs" },
			},
		},
		resolve: { alias: { "@shared": resolve("src/shared") } },
	},
	renderer: {
		root: resolve("src/renderer"),
		plugins: [react()],
		build: {
			rollupOptions: { input: { index: resolve("src/renderer/index.html") } },
		},
		resolve: {
			alias: {
				"@shared": resolve("src/shared"),
				"@": resolve("src/renderer/src"),
			},
		},
	},
});
