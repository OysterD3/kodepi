import { describe, expect, it } from "vitest";
import type { PiCommand } from "@shared/model";
import { commandGroups, completion, flatMatches, label, slashQuery } from "./commands";

/** Shapes taken from a real `get_commands` reply. */
const commands: PiCommand[] = [
	{ name: "usage", description: "Show what this session has cost", source: "extension", scope: "user" },
	{ name: "subagents", description: "Show or configure subagents", source: "extension", scope: "user" },
	{ name: "advisor", description: "Set or toggle the advisor reviewer model", source: "extension", scope: "user" },
	{ name: "fix-tests", description: "Fix failing tests", source: "prompt", scope: "project" },
	{ name: "skill:pptx", description: "Anything to do with a .pptx file", source: "skill", scope: "user" },
	{ name: "skill:skill-creator", description: "Guide for creating effective skills", source: "skill", scope: "user" },
];

describe("slashQuery", () => {
	it("names a command only while the draft is one token starting with a slash", () => {
		expect(slashQuery("/")).toBe("");
		expect(slashQuery("/us")).toBe("us");
		expect(slashQuery("/skill:pptx")).toBe("skill:pptx");
	});

	it("lets go once the command has arguments, or was never one", () => {
		expect(slashQuery("/usage ")).toBeNull();
		expect(slashQuery("/code-review high")).toBeNull();
		expect(slashQuery("")).toBeNull();
		expect(slashQuery("what does / mean")).toBeNull();
	});
});

describe("commandGroups", () => {
	it("offers everything on a bare slash, under pi's own three headings", () => {
		const groups = commandGroups(commands, "");
		expect(groups.map((g) => g.title)).toEqual(["COMMANDS", "PROMPTS", "SKILLS"]);
		expect(flatMatches(groups)).toHaveLength(commands.length);
		// Nothing was typed, so there is nothing to pick out.
		expect(flatMatches(groups).every((m) => m.at === -1)).toBe(true);
	});

	it("matches anywhere in the name, and puts the ones that start with it first", () => {
		// Ranked inside each heading, and the headings keep their order.
		const rows = flatMatches(commandGroups(commands, "s"));
		expect(rows.map((r) => r.command.name)).toEqual(["subagents", "usage", "advisor", "fix-tests", "skill:skill-creator"]);
		expect(rows[0]?.at).toBe(0);
		// "u-s-age": the match is where the highlight goes.
		expect(rows.find((r) => r.command.name === "usage")?.at).toBe(1);

		// The point of matching the label: every skill is named "skill:…", so
		// matching the whole name would rank all of them first on a bare "s"
		// and highlight a prefix the user never typed. pptx has no "s" at all.
		expect(rows.map((r) => r.command.name)).not.toContain("skill:pptx");
	});

	it("finds a skill by its own name, and by the prefix pi runs it under", () => {
		for (const query of ["pptx", "skill:pptx"]) {
			const rows = flatMatches(commandGroups(commands, query));
			expect(rows).toHaveLength(1);
			expect(rows[0]?.command.name).toBe("skill:pptx");
			// Drawn as the skill's own name, and the highlight lands on it.
			expect(rows[0]?.label).toBe("pptx");
			expect(rows[0]?.at).toBe(0);
			expect(rows[0]?.len).toBe(4);
		}
	});

	it("ignores case, and drops a heading with nothing under it", () => {
		const groups = commandGroups(commands, "PPT");
		expect(groups).toHaveLength(1);
		expect(groups[0]?.title).toBe("SKILLS");
		expect(groups[0]?.matches[0]?.command.name).toBe("skill:pptx");
	});

	it("finds nothing rather than everything when no name matches", () => {
		expect(commandGroups(commands, "zzz")).toEqual([]);
	});
});

describe("label and completion", () => {
	// pi expands only `/skill:name` — agent-session.js gates on that exact
	// prefix — so the prefix is dropped for the eye and kept for pi.
	it("shows a skill by its own name and runs it by pi's", () => {
		const pptx = commands[4] as PiCommand;
		expect(label(pptx)).toBe("pptx");
		expect(completion(pptx)).toBe("/skill:pptx ");
	});

	it("leaves everything else exactly as pi named it", () => {
		const usage = commands[0] as PiCommand;
		expect(label(usage)).toBe("usage");
		expect(completion(usage)).toBe("/usage ");
		// The trailing space closes the menu.
		expect(slashQuery(completion(usage))).toBeNull();
	});
});
