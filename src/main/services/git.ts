/**
 * The one git question this app asks: which branch is a session's cwd on?
 *
 * `execFile`, never a shell, and with `GIT_DIR` / `GIT_WORK_TREE` /
 * `GIT_INDEX_FILE` scrubbed — inheriting those from whatever launched the app
 * would silently answer about a different repository.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function currentBranch(cwd: string): Promise<string | null> {
	const env = { ...process.env };
	delete env["GIT_DIR"];
	delete env["GIT_WORK_TREE"];
	delete env["GIT_INDEX_FILE"];

	try {
		const { stdout } = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, env, timeout: 3000 });
		const branch = stdout.trim();
		return branch && branch !== "HEAD" ? branch : null;
	} catch {
		// Not a repository, a detached HEAD, or the directory is gone.
		return null;
	}
}
