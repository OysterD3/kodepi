/**
 * An integration test against a real pi installation.
 *
 * It skips itself when there is no agent directory, so it is a no-op on a
 * machine that has never run pi. It asserts invariants only — never counts or
 * names — so it stays true whatever is in the directory.
 */

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseEntries } from "../pi/entries";
import { reduceSession } from "../pi/transcript";
import { sessionsDir } from "./agent-dir";
import { type Scan, scanSessions } from "./sessions";

const hasAgentDir = existsSync(sessionsDir());

describe.skipIf(!hasAgentDir)("scanSessions, against the real agent directory", () => {
	// One walk for the whole file; the directory does not change under us.
	let scan: Scan;
	beforeAll(async () => {
		scan = await scanSessions();
	});

	it("groups sessions under absolute project paths", () => {
		expect(scan.sessions.length).toBeGreaterThan(0);

		for (const project of scan.projects) {
			// The directory names are lossy; the cwd must come from the header.
			expect(isAbsolute(project.id)).toBe(true);
			expect(project.name).not.toBe("");
			expect(project.sessionIds.length).toBeGreaterThan(0);
		}

		const ids = scan.sessions.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("gives every session a title and a status", () => {
		for (const session of scan.sessions) {
			expect(session.title).not.toBe("");
			expect(["new", "done", "error"]).toContain(session.status);
		}
	});

	it("lists newest first", () => {
		const times = scan.sessions.map((s) => s.modified);
		expect([...times].sort((a, b) => b - a)).toEqual(times);
	});

	it("reduces every recorded session without throwing", () => {
		for (const session of scan.sessions) {
			const reduced = reduceSession(parseEntries(readFileSync(session.file, "utf8")));
			expect(reduced.cwd, session.file).toBe(session.cwd);
			expect(new Set(reduced.steps.map((s) => s.id)).size, session.file).toBe(reduced.steps.length);
			for (const file of reduced.files) expect(file.hunks[0]?.kind, session.file).toBe("hdr");
		}
	});
});
