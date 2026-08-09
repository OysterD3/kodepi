import { describe, expect, it } from "vitest";
import { nextTheme, prefersDark, resolveTheme, watchAppearance } from "./theme";

describe("resolveTheme", () => {
	it("follows macOS only under auto", () => {
		expect(resolveTheme("auto", true)).toBe("night");
		expect(resolveTheme("auto", false)).toBe("day");
	});

	it("ignores macOS once the user has said which one they want", () => {
		expect(resolveTheme("night", false)).toBe("night");
		expect(resolveTheme("day", true)).toBe("day");
	});
});

describe("nextTheme", () => {
	it("cycles the three, and comes back round", () => {
		expect(nextTheme("auto")).toBe("night");
		expect(nextTheme("night")).toBe("day");
		expect(nextTheme("day")).toBe("auto");
	});
});

describe("without a window to ask", () => {
	// Under `react-dom/server` there is no matchMedia. Neither call may throw:
	// the store reads the appearance while the module is still loading.
	it("assumes dark, and watches nothing", () => {
		expect(prefersDark()).toBe(true);
		expect(() => watchAppearance(() => undefined)()).not.toThrow();
	});
});
