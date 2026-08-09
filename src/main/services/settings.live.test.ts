/**
 * An integration test against a real pi installation.
 *
 * It skips itself when there is no `pi` command to find, so it is a no-op on a
 * machine that has never installed one. It asserts the shape of what comes
 * back, never a version number, so an upgrade does not break it.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSettings } from "./settings";

/** Found without going through the code under test. */
const shim = [join(homedir(), "Library/pnpm/bin/pi"), join(homedir(), ".local/share/pnpm/bin/pi"), join(homedir(), ".bun/bin/pi")].find(
	(path) => existsSync(path),
);

describe.skipIf(!shim)("readSettings, against the real pi installation", () => {
	it("finds the version of the pi that would actually run", async () => {
		// pnpm 11 nests the package two levels deep, under a hashed install
		// directory. Reading only one level down is what used to report that pi
		// was not on the machine at all.
		const settings = await readSettings();
		expect(settings.piVersion).toMatch(/^\d+\.\d+\.\d+/);
	});

	it("reports pi's agent directory as an absolute path", async () => {
		const settings = await readSettings();
		expect(settings.agentDir.startsWith("/")).toBe(true);
	});
});
