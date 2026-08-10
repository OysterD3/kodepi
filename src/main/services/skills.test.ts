import { describe, expect, it } from "vitest";
import type { LoadingMode, SkillMode } from "@shared/model";
import { LOADING_MODES, SKILL_MODES, SKILL_MODE_LABEL } from "@shared/model";
import { excludedBy, frontmatter, modeFor, setSkillMode } from "./skills";

describe("the modes offered", () => {
	// Four belong to the extension's preferences file; "off" is pi core's
	// exclusion and lives in settings.json. Writing "off" into the extension's
	// file is the one thing that must never happen: it drops a mode it does not
	// know, and the skill falls back to fully listed — the opposite of off.
	it("keeps pi core's off apart from the extension's four", () => {
		expect([...LOADING_MODES]).toEqual(["preload", "name", "brief", "command"]);
		expect([...SKILL_MODES]).toEqual(["preload", "name", "brief", "command", "off"]);
		expect(SKILL_MODE_LABEL.off).toBe("Off");
		expect(SKILL_MODE_LABEL.name).toBe("On");
	});

	it("refuses a mode pi has never heard of, and a nameless skill", async () => {
		await expect(setSkillMode("pptx", "hidden" as SkillMode)).rejects.toThrow(/no "hidden" skill mode/);
		await expect(setSkillMode("", "name")).rejects.toThrow(/no name/);
	});
});

describe("excludedBy", () => {
	const skill = { name: "pptx", path: "/home/me/.agents/skills/pptx/SKILL.md" };

	it("finds nothing when nothing excludes the skill", () => {
		expect(excludedBy(skill, [])).toBeUndefined();
		expect(excludedBy(skill, ["!dogfood"])).toBeUndefined();
	});

	it("matches an exact name and a family glob", () => {
		expect(excludedBy(skill, ["!pptx"])).toBe("!pptx");
		expect(excludedBy({ name: "chrome:a11y", path: "" }, ["!chrome:*"])).toBe("!chrome:*");
	});

	// `-path` force-excludes an exact path, so it names the file or its folder.
	it("matches a force-excluded path", () => {
		expect(excludedBy(skill, ["-/home/me/.agents/skills/pptx"])).toBe("-/home/me/.agents/skills/pptx");
		expect(excludedBy(skill, ["-/home/me/.agents/skills/other"])).toBeUndefined();
	});
});

/**
 * The precedence has to match pi's own `skill-loading/select.ts`. Reading it
 * wrong shows a skill as advertised when it is hidden, which is the one thing
 * this panel must never do.
 */
describe("modeFor", () => {
	const rules: Record<string, LoadingMode> = {
		"chrome-devtools-mcp:*": "command",
		"chrome-devtools-mcp:troubleshooting": "preload",
		"*": "command",
	};

	it("falls back to the default when no rule names the skill", () => {
		expect(modeFor("pptx", {}, "name")).toEqual({ mode: "name", inherited: true });
	});

	it("prefers an exact name over any glob", () => {
		expect(modeFor("chrome-devtools-mcp:troubleshooting", rules, "name")).toEqual({ mode: "preload", inherited: false });
	});

	it("prefers the longest glob, so a family rule beats a catch-all", () => {
		expect(modeFor("chrome-devtools-mcp:a11y-debugging", rules, "name")).toEqual({ mode: "command", inherited: false });
		expect(modeFor("anything-else", rules, "name")).toEqual({ mode: "command", inherited: false });
	});

	// A mode that came from a pattern is not inherited: the user chose it, even
	// though they did not name this skill.
	it("counts a glob match as set, not inherited", () => {
		expect(modeFor("chrome-devtools-mcp:x", { "chrome-devtools-mcp:*": "preload" }, "name").inherited).toBe(false);
	});
});

describe("frontmatter", () => {
	it("reads a plain name and description", () => {
		const meta = frontmatter("---\nname: pptx\ndescription: Makes slide decks.\n---\n\n# Body\n");
		expect(meta["name"]).toBe("pptx");
		expect(meta["description"]).toBe("Makes slide decks.");
	});

	it("unwraps a quoted value", () => {
		expect(frontmatter(`---\ndescription: "Quoted, with: a colon"\n---\n`)["description"]).toBe("Quoted, with: a colon");
	});

	// Long skill descriptions are usually folded over several lines.
	it("folds a block scalar into one line", () => {
		const meta = frontmatter("---\nname: dogfood\ndescription: >-\n  Explore an app\n  and find bugs.\n---\n");
		expect(meta["description"]).toBe("Explore an app and find bugs.");
		expect(meta["name"]).toBe("dogfood");
	});

	it("gives nothing back rather than guessing, when there is no frontmatter", () => {
		expect(frontmatter("# Just a heading\n")).toEqual({});
		expect(frontmatter("---\nname: unterminated\n")).toEqual({});
	});
});
