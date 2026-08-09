/**
 * The shell, for real.
 *
 * It spawns the machine's own login shell, so it is as slow as that shell's
 * profile — worth it, because the thing worth proving is that a keystroke
 * reaches the pty and its output comes back.
 */

import { existsSync } from "node:fs";
import type { WebContents } from "electron";
import { afterAll, describe, expect, it } from "vitest";
import { killShells, resizeShell, startShell, writeShell } from "./terminal";

const shellPath = process.env["SHELL"] || "/bin/zsh";
const hasShell = existsSync(shellPath);

/** Enough of a `WebContents` for the service: it only sends. */
function recorder(): { chunks: string[]; sender: WebContents } {
	const chunks: string[] = [];
	const sender = {
		isDestroyed: () => false,
		send: (_channel: string, _sessionId: string, data: string) => chunks.push(data),
	};
	return { chunks, sender: sender as unknown as WebContents };
}

/** Escape codes are the shell's business, not this test's. */
function plain(text: string): string {
	// biome-ignore lint: control characters are the point here.
	return text.replace(/\x1b\][^\x07]*\x07/g, "").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

async function waitFor(predicate: () => boolean, timeoutMs = 20_000): Promise<void> {
	const until = Date.now() + timeoutMs;
	while (Date.now() < until) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error("timed out");
}

describe.skipIf(!hasShell)("startShell, against a real login shell", () => {
	afterAll(() => killShells());

	it("runs what is written to it and streams the output back", async () => {
		const { chunks, sender } = recorder();
		startShell(sender, "write", process.cwd(), 80, 24);

		// The prompt comes first; writing before the shell is up would be typed
		// into a shell that is still sourcing its profile.
		await waitFor(() => chunks.join("").length > 0);
		writeShell("write", "echo KODEPI_$((6*7))\r");

		// The echoed keystrokes carry the expression, so only the shell's own
		// output can carry the answer.
		await waitFor(() => /KODEPI_42/.test(plain(chunks.join(""))));
	}, 30_000);

	it("starts in the session's directory, and resizes with the pane", async () => {
		const { chunks, sender } = recorder();
		startShell(sender, "cwd", process.cwd(), 80, 24);
		await waitFor(() => chunks.join("").length > 0);

		writeShell("cwd", "pwd\r");
		await waitFor(() => plain(chunks.join("")).includes(process.cwd()));

		resizeShell("cwd", 120, 40);
		writeShell("cwd", "echo COLS=$COLUMNS\r");
		await waitFor(() => /COLS=120/.test(plain(chunks.join(""))));
	}, 30_000);

	it("replays what a running shell printed into a window that reopens", async () => {
		const first = recorder();
		startShell(first.sender, "replay", process.cwd(), 80, 24);
		await waitFor(() => first.chunks.join("").length > 0);
		writeShell("replay", "echo REPLAY_MARK\r");
		await waitFor(() => /REPLAY_MARK/.test(plain(first.chunks.join(""))));

		// The same shell, asked for by a window that never saw it start.
		const second = recorder();
		startShell(second.sender, "replay", process.cwd(), 80, 24);
		await waitFor(() => /REPLAY_MARK/.test(plain(second.chunks.join(""))));

		// And it now writes to the new window rather than the old one.
		const before = first.chunks.length;
		writeShell("replay", "echo SECOND_MARK\r");
		await waitFor(() => /SECOND_MARK/.test(plain(second.chunks.join(""))));
		expect(first.chunks.length).toBe(before);
	}, 30_000);

	it("falls back to the home directory when the recorded one is gone", async () => {
		const { chunks, sender } = recorder();
		startShell(sender, "gone", "/no/such/directory", 80, 24);
		// A pty that cannot chdir does not spawn at all, so any output is proof.
		await waitFor(() => chunks.join("").length > 0);
		expect(chunks.join("")).not.toBe("");
	}, 30_000);
});
