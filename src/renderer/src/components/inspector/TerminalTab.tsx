import type { JSX } from "react";
import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { retintShells, shellView } from "@/lib/shells";
import { appearance, currentSession, useStore } from "@/lib/store";

export function TerminalTab(): JSX.Element {
	const session = useStore(currentSession);
	// The painted appearance, not the preference: under `auto` the preference
	// stays put while macOS changes underneath it.
	const theme = useStore(appearance);
	const host = useRef<HTMLDivElement>(null);

	const sessionId = session?.id ?? "";
	const cwd = session?.cwd ?? "";

	useEffect(() => {
		const mount = host.current;
		if (!sessionId || !mount) return;

		const view = shellView(sessionId);
		mount.appendChild(view.element);
		// xterm measures a character on open, so it has to be in the document.
		if (!view.opened) {
			view.term.open(view.element);
			view.opened = true;
		}
		view.fit.fit();
		view.term.focus();

		// Started with the size it will be drawn at, so the first prompt does
		// not have to be reflowed — and only once per view, or the main process
		// would replay its scrollback into a pane that already shows it.
		if (!view.started) {
			view.started = true;
			void api.startShell(sessionId, cwd, view.term.cols, view.term.rows);
		}

		const observer = new ResizeObserver(() => view.fit.fit());
		observer.observe(mount);

		return () => {
			observer.disconnect();
			// Detach, never dispose: the buffer and the shell both outlive the tab.
			view.element.remove();
		};
	}, [sessionId, cwd]);

	// The inspector's width toggle resizes the pane in one step, which the
	// observer sees, and the theme toggle only changes colours.
	useEffect(() => {
		retintShells();
	}, [theme]);

	return (
		<div className="term">
			{sessionId ? <div className="term__host" ref={host} /> : <div className="term__host term__host--empty">No session is open.</div>}
			<div className="term__foot">
				<span>{session?.branch ?? "not a git repository"}</span>
				<span className="spacer" />
				<span>{cwd}</span>
			</div>
		</div>
	);
}
