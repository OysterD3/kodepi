/**
 * An integration test against a real pi installation.
 *
 * It skips itself when there is no `pi` command to find. It asserts the shape
 * of what comes back and never which models are configured, so it stays true
 * whatever providers this machine has.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listModels } from "./agent";

/** Found without going through the code under test. */
const shim = [join(homedir(), "Library/pnpm/bin/pi"), join(homedir(), ".local/share/pnpm/bin/pi"), join(homedir(), ".bun/bin/pi")].find(
	(path) => existsSync(path),
);

describe.skipIf(!shim)("listModels, against a real pi", () => {
	it("lists the models pi is configured for", async () => {
		const models = await listModels(process.cwd());

		expect(models.length).toBeGreaterThan(0);
		for (const model of models) {
			expect(model.id).not.toBe("");
			expect(model.provider).not.toBe("");
			expect(model.name).not.toBe("");
			expect(typeof model.reasoning).toBe("boolean");
			expect(model.contextWindow === null || model.contextWindow > 0).toBe(true);
		}
	}, 30_000);

	it("names each model by its provider and its id together", async () => {
		const models = await listModels(process.cwd());

		// Ids collide across providers — `deepseek-v4-flash` is offered by two
		// here — so only the pair is unique, and only the pair may be written.
		const refs = models.map((model) => `${model.provider}/${model.id}`);
		expect(new Set(refs).size).toBe(refs.length);
	}, 30_000);
});
