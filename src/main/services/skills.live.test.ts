/**
 * An integration test against the real skill directories.
 *
 * It skips itself when this machine has none. It asserts the shape of what
 * comes back and never which skills are installed, so it stays true whatever
 * the user has.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SKILL_MODES } from "@shared/model";
import { readSkills, storePath } from "./skills";

const userRoots = [join(homedir(), ".pi", "agent", "skills"), join(homedir(), ".agents", "skills")];
const hasSkills = userRoots.some((root) => existsSync(root));

describe.skipIf(!hasSkills)("readSkills, against the real skill directories", () => {
	it("reads every skill, with a mode and no command prefix", async () => {
		const list = await readSkills(process.cwd());

		expect(list.skills.length).toBeGreaterThan(0);
		expect(SKILL_MODES).toContain(list.fallback);
		expect(list.store).toBe(storePath());

		for (const skill of list.skills) {
			expect(skill.name).not.toBe("");
			// `skill:` belongs to the command pi registers, not to the skill.
			expect(skill.name.startsWith("skill:")).toBe(false);
			expect(skill.path.endsWith(".md")).toBe(true);
			expect(SKILL_MODES).toContain(skill.mode);
			expect(["user", "project"]).toContain(skill.scope);
		}
	});

	it("names each skill once, however many roots it could come from", async () => {
		const names = (await readSkills(process.cwd())).skills.map((skill) => skill.name);
		expect(new Set(names).size).toBe(names.length);
	});

	// The ancestor climb used to reach the home directory and pick
	// `~/.agents/skills` up again as though it belonged to a project, marking
	// every skill on the machine "project". It only shows from a cwd that is
	// under home and is *not* a repository — inside one, the climb stops at the
	// repo root long before it gets there.
	it("calls a skill under the home directory a user skill", async () => {
		const list = await readSkills(homedir());
		expect(list.skills.length).toBeGreaterThan(0);

		for (const skill of list.skills) {
			if (skill.path.startsWith(join(homedir(), ".agents")) || skill.path.startsWith(join(homedir(), ".pi"))) {
				expect(skill.scope).toBe("user");
			}
		}
	});
});
