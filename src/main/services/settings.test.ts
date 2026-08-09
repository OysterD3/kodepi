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
import { setDefaultModel, setDefaultThinkingLevel } from "./settings";

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
