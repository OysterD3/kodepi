import { describe, expect, it } from "vitest";
import { brandFor } from "./BrandIcon";

/** The name only; which component it is, is the render's business. */
function name(provider: string, model: string): string | null {
	return brandFor(provider, model)?.name ?? null;
}

describe("brandFor", () => {
	it("reads the maker off the model id, not off whoever resells it", () => {
		// One provider, four makers. This is the whole reason the id is read first.
		expect(name("opencode-go", "kimi-k3")).toBe("Kimi");
		expect(name("opencode-go", "qwen3.8-max")).toBe("Qwen");
		expect(name("opencode-go", "glm-5.2")).toBe("ChatGLM");
		expect(name("opencode-go", "grok-4.5")).toBe("Grok");
		// Even an OpenAI model sold by someone else is still OpenAI's.
		expect(name("opencode-go", "gpt-5.6-luna")).toBe("OpenAI");
	});

	it("falls back to the provider when the id names nobody", () => {
		// qoder's own `lite` says nothing about who made it.
		expect(name("qoder", "lite")).toBe("Qoder");
		// But `qmodel_38max` does — qoder calls it Qwen3.8-Max.
		expect(name("qoder", "qmodel_38max")).toBe("Qwen");
		expect(name("opencode-go", "something-new")).toBe("OpenCode");
		expect(name("anthropic", "")).toBe("Anthropic");
	});

	it("knows nothing about a provider and a model it has never seen", () => {
		expect(name("retired", "old-one")).toBeNull();
		expect(name("", "")).toBeNull();
	});

	it("does not care about case or stray spacing", () => {
		expect(name("ANTHROPIC", " Claude-Opus-5 ")).toBe("Claude");
		expect(name(" Qoder ", "LITE")).toBe("Qoder");
	});
});
