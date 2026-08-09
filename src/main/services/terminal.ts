/**
 * A shell per session.
 *
 * Everything else in this app reads pi's directory; this is the one place
 * kodepi runs something. It runs the user's own login shell in a pty, so the
 * prompt, aliases and PATH are the ones their `.zshrc` sets up — a packaged
 * Electron app inherits none of that from its environment.
 *
 * A shell outlives the tab that opened it: the pane can be closed and the
 * session switched away from while a build keeps running. They are killed on
 * quit, or the shells would outlive the app that started them.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { type IPty, spawn } from "@lydell/node-pty";
import type { WebContents } from "electron";
import { CHANNELS } from "@shared/ipc";

interface Shell {
	readonly pty: IPty;
	/** The window to write to. Re-pointed when a new one asks for this shell. */
	target: WebContents;
	/** What the renderer needs to redraw a shell it did not see start. */
	scrollback: string;
}

const shells = new Map<string, Shell>();

/** Enough to refill a pane, not enough to hold a build log in memory. */
const SCROLLBACK_BYTES = 64 * 1024;

/** The user's login shell. `-l` is what makes it read their profile. */
function shellCommand(): { file: string; args: string[] } {
	const file = process.env["SHELL"] || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
	return { file, args: ["-l"] };
}

export function shellEnv(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (typeof value === "string") env[key] = value;
	}
	// Electron sets these for its own child processes; a shell must not inherit
	// them or `node` inside it turns into a second Electron.
	delete env["ELECTRON_RUN_AS_NODE"];
	delete env["ELECTRON_NO_ATTACH_CONSOLE"];
	env["TERM"] = "xterm-256color";
	env["COLORTERM"] = "truecolor";
	return env;
}

/**
 * Start the session's shell, or hand back the one already running.
 *
 * The renderer calls this every time the tab is mounted, so a second call is
 * the normal case. A window that reopens gets a shell it never saw start, so
 * what that shell has printed is replayed into it — otherwise a live shell
 * would sit behind a blank pane until it next wrote something.
 */
export function startShell(target: WebContents, sessionId: string, cwd: string, cols: number, rows: number): void {
	const running = shells.get(sessionId);
	if (running) {
		running.target = target;
		running.pty.resize(Math.max(2, cols), Math.max(2, rows));
		if (running.scrollback && !target.isDestroyed()) target.send(CHANNELS.termData, sessionId, running.scrollback);
		return;
	}

	const { file, args } = shellCommand();
	const pty = spawn(file, args, {
		name: "xterm-256color",
		cols: Math.max(2, cols),
		rows: Math.max(2, rows),
		// A recorded directory can be gone — pi sessions run in scratch dirs —
		// and a pty that cannot chdir fails to spawn at all.
		cwd: cwd && existsSync(cwd) ? cwd : homedir(),
		env: shellEnv(),
	});

	const shell: Shell = { pty, target, scrollback: "" };
	shells.set(sessionId, shell);

	pty.onData((data) => {
		shell.scrollback = (shell.scrollback + data).slice(-SCROLLBACK_BYTES);
		if (!shell.target.isDestroyed()) shell.target.send(CHANNELS.termData, sessionId, data);
	});

	pty.onExit(({ exitCode }) => {
		shells.delete(sessionId);
		if (!shell.target.isDestroyed()) shell.target.send(CHANNELS.termExit, sessionId, exitCode);
	});
}

export function writeShell(sessionId: string, data: string): void {
	shells.get(sessionId)?.pty.write(data);
}

export function resizeShell(sessionId: string, cols: number, rows: number): void {
	shells.get(sessionId)?.pty.resize(Math.max(2, cols), Math.max(2, rows));
}

export function killShells(): void {
	for (const shell of shells.values()) shell.pty.kill();
	shells.clear();
}
