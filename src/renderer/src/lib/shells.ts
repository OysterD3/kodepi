/**
 * The xterm views, one per session, kept outside React.
 *
 * The inspector unmounts a tab when you switch away from it, and a terminal
 * that loses its scrollback on every tab switch is not a terminal. So each
 * view owns a detached element: the component appends it on mount and takes it
 * back off on unmount, and the buffer lives in the view for as long as the
 * window does.
 *
 * Output is routed here rather than in the component, so a build keeps
 * scrolling into a session the user is not looking at.
 */

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { api } from "./api";

export interface ShellView {
	readonly term: Terminal;
	readonly fit: FitAddon;
	/** The element xterm draws into. Detached until a tab mounts it. */
	readonly element: HTMLDivElement;
	opened: boolean;
	/**
	 * Whether this view has already asked for its shell.
	 *
	 * Asking twice would replay the shell's scrollback into a pane that is
	 * already showing it. It goes back to false when the shell exits, so the
	 * next mount starts a fresh one.
	 */
	started: boolean;
}

const views = new Map<string, ShellView>();
let routing = false;

/** The app's own colours, read from the stylesheet so the two cannot drift. */
function theme(): Record<string, string> {
	const css = getComputedStyle(document.documentElement);
	const token = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
	return {
		background: token("--term", "#101010"),
		foreground: token("--term-fg", "#b4b4b4"),
		cursor: token("--term-fg-hi", "#f4f4f4"),
		selectionBackground: token("--line-3", "rgba(255,255,255,0.17)"),
		green: token("--term-pass", "#7fe0ad"),
		red: token("--term-err", "#f87171"),
		yellow: token("--warn", "#fbbf24"),
		blue: token("--info", "#60a5fa"),
		magenta: token("--violet", "#a78bfa"),
	};
}

/**
 * The font the shell is drawn in.
 *
 * A prompt theme draws powerline and devicon glyphs that a plain monospace
 * font has no characters for, and a miss renders as an empty box. So the
 * Nerd Font builds come first, and the app's own `--code` stack is the
 * fallback rather than the first choice. xterm measures a character with this
 * string, so it is resolved here — `var()` would not survive that.
 */
function monoStack(): string {
	const code = getComputedStyle(document.documentElement).getPropertyValue("--code").trim() || "monospace";
	return `"JetBrainsMono Nerd Font Mono", "FiraCode Nerd Font Mono", "MesloLGS NF", "Hack Nerd Font Mono", ${code}`;
}

/** One subscription for the window, however many shells are running. */
function startRouting(): void {
	if (routing) return;
	routing = true;
	api.onShellData((sessionId, data) => views.get(sessionId)?.term.write(data));
	api.onShellExit((sessionId, exitCode) => {
		const view = views.get(sessionId);
		if (!view) return;
		// The output stays readable; the next mount starts a new shell.
		view.started = false;
		view.term.write(`\r\n\x1b[2m[shell exited with ${exitCode} — reopen this tab to start a new one]\x1b[0m\r\n`);
	});
}

export function shellView(sessionId: string): ShellView {
	const existing = views.get(sessionId);
	if (existing) return existing;

	startRouting();

	const term = new Terminal({
		allowProposedApi: true,
		cursorBlink: true,
		fontFamily: monoStack(),
		fontSize: 12,
		lineHeight: 1.35,
		scrollback: 5000,
		theme: theme(),
	});
	const fit = new FitAddon();
	term.loadAddon(fit);

	const element = document.createElement("div");
	element.className = "term__xterm";

	term.onData((data) => void api.writeShell(sessionId, data));
	term.onResize(({ cols, rows }) => void api.resizeShell(sessionId, cols, rows));

	const view: ShellView = { term, fit, element, opened: false, started: false };
	views.set(sessionId, view);
	return view;
}

/** Repaint every open shell after a theme change. */
export function retintShells(): void {
	for (const view of views.values()) view.term.options.theme = theme();
}
