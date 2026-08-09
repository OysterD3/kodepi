import { describe, expect, it } from "vitest";
import { parseModels } from "./agent";

/**
 * `get_available_models` answers with pi's own Model objects, which carry far
 * more than a picker needs. These assert the narrowing, and that a malformed
 * entry is dropped rather than drawn as a model nobody can select.
 */
describe("parseModels", () => {
	const answer = {
		models: [
			{
				id: "claude-opus-5",
				name: "Claude Opus 5",
				api: "anthropic-messages",
				provider: "anthropic",
				baseUrl: "https://api.anthropic.com",
				reasoning: true,
				input: ["text", "image"],
				contextWindow: 1000000,
				maxTokens: 128000,
			},
			{ id: "lite", name: "Lite", provider: "qoder", reasoning: false },
		],
	};

	it("keeps the five fields the picker draws", () => {
		expect(parseModels(answer)).toEqual([
			{ id: "claude-opus-5", name: "Claude Opus 5", provider: "anthropic", reasoning: true, contextWindow: 1000000 },
			// A model that states no window has none; nothing is invented for it.
			{ id: "lite", name: "Lite", provider: "qoder", reasoning: false, contextWindow: null },
		]);
	});

	it("falls back to the id when a provider gives no display name", () => {
		expect(parseModels({ models: [{ id: "qmodel_38max", provider: "qoder" }] })[0]?.name).toBe("qmodel_38max");
	});

	it("drops an entry that does not name both a provider and an id", () => {
		const models = parseModels({ models: [{ id: "orphan" }, { provider: "anthropic" }, { id: "", provider: "anthropic" }] });
		expect(models).toEqual([]);
	});

	it("reads nothing out of an answer that is not one", () => {
		expect(parseModels(null)).toEqual([]);
		expect(parseModels({})).toEqual([]);
		expect(parseModels({ models: "none" })).toEqual([]);
	});
});
