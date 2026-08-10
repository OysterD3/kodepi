/**
 * The one thing this app writes to pi's settings.json in the model panel.
 *
 * Every case here is about what happens to the *rest* of the file: it is the
 * user's tracked configuration, and pi keeps things in it that this app has
 * never heard of.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ThinkingLevel } from "@shared/model";
import { readSettings, setActiveProfile, setAdvisorModel, setDefaultModel, setDefaultThinkingLevel, setRoleModel } from "./settings";

let dir = "";
let file = "";
const before = process.env["PI_CODING_AGENT_DIR"];

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "kodepi-settings-"));
	file = join(dir, "settings.json");
	process.env["PI_CODING_AGENT_DIR"] = dir;
});

afterEach(async () => {
	if (before === undefined) delete process.env["PI_CODING_AGENT_DIR"];
	else process.env["PI_CODING_AGENT_DIR"] = before;
	await rm(dir, { recursive: true, force: true });
});

async function read(): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
}

describe("setDefaultModel", () => {
	it("keeps every other key, including ones this app does not know", async () => {
		await writeFile(
			file,
			JSON.stringify({
				theme: "one-dark-pro",
				defaultProvider: "openai-codex",
				defaultModel: "gpt-5.6-sol",
				permissions: { defaultMode: "auto", deny: ["Read(**/.env)"] },
				models: { active: "openai", providers: { openai: { session: "openai-codex/gpt-5.6-sol" } } },
			}),
		);

		await setDefaultModel("anthropic", "claude-opus-5");

		expect(await read()).toEqual({
			theme: "one-dark-pro",
			defaultProvider: "anthropic",
			defaultModel: "claude-opus-5",
			permissions: { defaultMode: "auto", deny: ["Read(**/.env)"] },
			// The `/provider` command's own block. Switching a profile is its
			// business; this writes pi's two keys and nothing else.
			models: { active: "openai", providers: { openai: { session: "openai-codex/gpt-5.6-sol" } } },
		});
	});

	it("writes a settings file where pi has none yet", async () => {
		await setDefaultModel("qoder", "lite");
		expect(await read()).toEqual({ defaultProvider: "qoder", defaultModel: "lite" });
	});

	it("refuses a file it cannot parse, rather than starting a new one", async () => {
		await writeFile(file, "{ this is not json");

		await expect(setDefaultModel("anthropic", "claude-opus-5")).rejects.toThrow(/not readable as JSON/);
		expect(await readFile(file, "utf8")).toBe("{ this is not json");
	});

	it("refuses half a name: a model is its provider and its id", async () => {
		await expect(setDefaultModel("", "claude-opus-5")).rejects.toThrow(/provider and its id/);
		await expect(setDefaultModel("anthropic", " ")).rejects.toThrow(/provider and its id/);
	});
});

describe("setDefaultThinkingLevel", () => {
	it("writes the level and keeps the model beside it", async () => {
		await writeFile(file, JSON.stringify({ defaultProvider: "anthropic", defaultModel: "claude-opus-5", defaultThinkingLevel: "low" }));

		await setDefaultThinkingLevel("xhigh");

		expect(await read()).toEqual({ defaultProvider: "anthropic", defaultModel: "claude-opus-5", defaultThinkingLevel: "xhigh" });
	});

	it("refuses a level pi has never had", async () => {
		await expect(setDefaultThinkingLevel("hard" as ThinkingLevel)).rejects.toThrow(/no "hard" thinking level/);
	});
});

/** The `/provider` extension's block, which names models by the job they do. */
const COMBOS = {
	active: "openai",
	providers: {
		openai: { session: "openai-codex/gpt-5.6-sol:max", frontier: "openai-codex/gpt-5.6-sol", cheap: "openai-codex/gpt-5.6-luna" },
		anthropic: { session: "anthropic/claude-opus-5", frontier: "anthropic/claude-opus-5" },
	},
};

describe("the combinations readSettings reports", () => {
	it("reads every profile and its roles, in the order the file lists them", async () => {
		await writeFile(file, JSON.stringify({ models: COMBOS, advisor: { model: "frontier" } }));

		const settings = await readSettings();

		expect(settings.modelProfile).toBe("openai");
		expect(settings.modelProfiles).toEqual([
			{
				name: "openai",
				roles: [
					{ name: "session", ref: "openai-codex/gpt-5.6-sol:max" },
					{ name: "frontier", ref: "openai-codex/gpt-5.6-sol" },
					{ name: "cheap", ref: "openai-codex/gpt-5.6-luna" },
				],
			},
			{
				name: "anthropic",
				roles: [
					{ name: "session", ref: "anthropic/claude-opus-5" },
					{ name: "frontier", ref: "anthropic/claude-opus-5" },
				],
			},
		]);
		expect(settings.advisorModel).toBe("frontier");
	});

	it("has none in force when the block is absent, half written, or names a profile nobody defined", async () => {
		for (const models of [undefined, { active: "openai" }, { providers: COMBOS.providers }, { active: "qoder", providers: COMBOS.providers }]) {
			await writeFile(file, JSON.stringify({ models }));
			// The profiles may still be there to read; what is missing is one in
			// force, and pi would read every role as a literal model.
			expect((await readSettings()).modelProfile).toBe("");
		}
	});

	it("drops a role whose value is not a model reference", async () => {
		await writeFile(file, JSON.stringify({ models: { active: "x", providers: { x: { frontier: "anthropic/claude-opus-5", fast: { id: "nope" }, cheap: "" } } } }));

		expect((await readSettings()).modelProfiles).toEqual([{ name: "x", roles: [{ name: "frontier", ref: "anthropic/claude-opus-5" }] }]);
	});
});

describe("setActiveProfile", () => {
	it("moves pi's own two keys and the level onto the new session role", async () => {
		await writeFile(file, JSON.stringify({ defaultProvider: "anthropic", defaultModel: "claude-opus-5", defaultThinkingLevel: "low", models: COMBOS }));

		await setActiveProfile("openai");

		const written = await read();
		expect(written["models"]).toEqual({ ...COMBOS, active: "openai" });
		expect(written["defaultProvider"]).toBe("openai-codex");
		expect(written["defaultModel"]).toBe("gpt-5.6-sol");
		// The `:max` pin rides with the model, so it lands on pi's own key.
		expect(written["defaultThinkingLevel"]).toBe("max");
	});

	it("leaves the thinking level alone when the session role states none", async () => {
		await writeFile(file, JSON.stringify({ defaultThinkingLevel: "low", models: COMBOS }));

		await setActiveProfile("anthropic");

		expect(await read()).toEqual({
			defaultThinkingLevel: "low",
			defaultProvider: "anthropic",
			defaultModel: "claude-opus-5",
			models: { ...COMBOS, active: "anthropic" },
		});
	});

	it("moves nothing else when the profile defines no session role", async () => {
		const models = { active: "openai", providers: { openai: COMBOS.providers.openai, spare: { frontier: "qoder/ultimate" } } };
		await writeFile(file, JSON.stringify({ defaultProvider: "openai-codex", defaultModel: "gpt-5.6-sol", models }));

		await setActiveProfile("spare");

		expect(await read()).toEqual({ defaultProvider: "openai-codex", defaultModel: "gpt-5.6-sol", models: { ...models, active: "spare" } });
	});

	it("refuses a combination the file does not define", async () => {
		await writeFile(file, JSON.stringify({ models: COMBOS }));
		await expect(setActiveProfile("qoder")).rejects.toThrow(/no "qoder" combination/);
	});

	it("refuses a session role it cannot read, rather than half applying the switch", async () => {
		// Marking it in force while pi went on starting every chat on the last
		// combination's model is the one outcome nothing on screen would show.
		const models = { active: "openai", providers: { ...COMBOS.providers, spare: { session: "frontier" } } };
		await writeFile(file, JSON.stringify({ defaultProvider: "openai-codex", defaultModel: "gpt-5.6-sol", models }));

		await expect(setActiveProfile("spare")).rejects.toThrow(/not a model reference/);
		expect((await read())["models"]).toEqual(models);
	});
});

describe("setRoleModel", () => {
	it("writes one role and leaves its siblings, the other profiles, and the file", async () => {
		await writeFile(file, JSON.stringify({ theme: "one-dark-pro", models: COMBOS }));

		await setRoleModel("anthropic", "frontier", "anthropic/claude-opus-5:xhigh");

		expect(await read()).toEqual({
			theme: "one-dark-pro",
			models: {
				active: "openai",
				providers: {
					openai: COMBOS.providers.openai,
					anthropic: { session: "anthropic/claude-opus-5", frontier: "anthropic/claude-opus-5:xhigh" },
				},
			},
		});
	});

	it("carries pi's own keys with the session role of the combination in force", async () => {
		await writeFile(file, JSON.stringify({ defaultProvider: "openai-codex", defaultModel: "gpt-5.6-sol", defaultThinkingLevel: "low", models: COMBOS }));

		await setRoleModel("openai", "session", "qoder/ultimate:high");

		const written = await read();
		expect(written["defaultProvider"]).toBe("qoder");
		expect(written["defaultModel"]).toBe("ultimate");
		// Not the thinking level. That has a control of its own in the same
		// panel, and choosing a model is not asking to undo it — only putting a
		// whole combination in force is.
		expect(written["defaultThinkingLevel"]).toBe("low");
	});

	it("leaves pi's own keys alone for a combination that is not in force", async () => {
		await writeFile(file, JSON.stringify({ defaultProvider: "openai-codex", defaultModel: "gpt-5.6-sol", models: COMBOS }));

		await setRoleModel("anthropic", "session", "qoder/ultimate");

		const written = await read();
		expect(written["defaultProvider"]).toBe("openai-codex");
		expect(written["defaultModel"]).toBe("gpt-5.6-sol");
	});

	it("refuses to invent a combination that is not there", async () => {
		await writeFile(file, JSON.stringify({ models: COMBOS }));
		await expect(setRoleModel("qoder", "session", "qoder/ultimate")).rejects.toThrow(/no "qoder" combination/);
	});
});

describe("setAdvisorModel", () => {
	it("keeps the rest of the advisor's own block, not just the rest of the file", async () => {
		await writeFile(file, JSON.stringify({ defaultModel: "gpt-5.6-sol", models: COMBOS, advisor: { model: "cheap", enabled: true } }));

		await setAdvisorModel("frontier");

		expect(await read()).toEqual({
			defaultModel: "gpt-5.6-sol",
			models: COMBOS,
			// `enabled` is the extension's kill switch. Dropping it here would
			// switch the advisor back on without saying so.
			advisor: { model: "frontier", enabled: true },
		});
	});

	it("writes the block where there is none", async () => {
		await writeFile(file, JSON.stringify({ defaultModel: "gpt-5.6-sol" }));

		await setAdvisorModel("frontier");

		expect(await read()).toEqual({ defaultModel: "gpt-5.6-sol", advisor: { model: "frontier" } });
	});

	it("takes a model reference too, because pi resolves this the same way it resolves --model", async () => {
		await setAdvisorModel("anthropic/claude-opus-5");
		expect(await read()).toEqual({ advisor: { model: "anthropic/claude-opus-5" } });
	});

	it("refuses an empty name rather than writing a setting that disables the tool", async () => {
		await expect(setAdvisorModel(" ")).rejects.toThrow(/needs a model/);
	});
});
