import { describe, expect, it } from "vitest";
import type { ThinkingLevel } from "@shared/model";
import { effortNote } from "./Composer";

const FOUR: ThinkingLevel[] = ["off", "low", "medium", "high"];

describe("effortNote", () => {
	it("says the level is only a report until pi has answered", () => {
		expect(effortNote("max", [])).toContain("seven levels");
		expect(effortNote("max", [])).toContain("needs a live session");
	});

	it("says what a live model offers, and how long the choice lasts", () => {
		expect(effortNote("medium", FOUR)).toBe("This model offers 4. It holds until this pi stops.");
	});

	// A model without reasoning answers with "off" alone. Claiming seven levels
	// and a dead session would be wrong twice over.
	it("does not offer a choice a one-level model cannot make", () => {
		const note = effortNote("off", ["off"]);
		expect(note).toBe("This model has one level. There is nothing to choose.");
		expect(note).not.toContain("seven");
	});

	// The slider has no place to draw this level, so it must not pretend one.
	it("says so when pi is on a level this model does not list", () => {
		expect(effortNote("max", FOUR)).toBe("pi is on Max effort, which this model does not list. Left where pi has it.");
	});
});
