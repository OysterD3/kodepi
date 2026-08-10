/**
 * Reading a model reference, which is the one place this app parses one.
 *
 * Both halves have a case that looks like the other: an id may hold slashes,
 * and an id may end in something colon-shaped that is not a thinking level.
 */

import { describe, expect, it } from "vitest";
import { activeRoles, parseRef } from "./model";
import type { PiSettings } from "./model";

describe("parseRef", () => {
	it("splits the provider off at the first slash, not the last", () => {
		expect(parseRef("openai-codex/gpt-5.6-sol")).toEqual({ provider: "openai-codex", id: "gpt-5.6-sol", level: null });
		// OpenRouter's ids carry a slash of their own, and it belongs to the id.
		expect(parseRef("openrouter/deepseek/deepseek-chat")).toEqual({ provider: "openrouter", id: "deepseek/deepseek-chat", level: null });
	});

	it("takes the tail as a level only when pi has one by that name", () => {
		expect(parseRef("openai-codex/gpt-5.6-sol:max")).toEqual({ provider: "openai-codex", id: "gpt-5.6-sol", level: "max" });
		// `free` is part of a real id, and splitting it off would point the
		// setting at a model nobody serves.
		expect(parseRef("openrouter/deepseek/deepseek-chat:free")).toEqual({ provider: "openrouter", id: "deepseek/deepseek-chat:free", level: null });
	});

	it("reads nothing out of something that is not a reference", () => {
		for (const ref of ["", "frontier", "/gpt-5.6-sol"]) {
			expect(parseRef(ref)).toEqual({ provider: "", id: "", level: null });
		}
	});
});

const settings: Pick<PiSettings, "modelProfile" | "modelProfiles"> = {
	modelProfile: "openai",
	modelProfiles: [
		{ name: "openai", roles: [{ name: "session", ref: "openai-codex/gpt-5.6-sol" }] },
		{ name: "anthropic", roles: [{ name: "session", ref: "anthropic/claude-opus-5" }] },
	],
};

describe("activeRoles", () => {
	it("is the roles of the combination in force", () => {
		expect(activeRoles(settings)).toEqual([{ name: "session", ref: "openai-codex/gpt-5.6-sol" }]);
	});

	it("is none when no combination is in force, and none when there are no settings", () => {
		expect(activeRoles({ ...settings, modelProfile: "" })).toEqual([]);
		expect(activeRoles(null)).toEqual([]);
	});
});
