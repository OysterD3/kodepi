import type { JSX } from "react";
import type { Theme } from "@shared/model";
import { LinesIcon, PanelIcon } from "./icons";
import { Menu } from "./primitives";
import { basename, formatDuration } from "@/lib/format";
import { actions, currentSession, useStore } from "@/lib/store";

/** The button cycles the three, and says which one it is on. */
const THEME_GLYPH: Record<Theme, string> = { auto: "◐", night: "☾", day: "☀" };

const THEME_TITLE: Record<Theme, string> = {
	auto: "Appearance: following macOS",
	night: "Appearance: always dark",
	day: "Appearance: always light",
};

function ViewMenu(): JSX.Element {
	const merge = useStore((s) => s.prefs.mergeToolCalls);
	const thinking = useStore((s) => s.prefs.showThinking);
	const wide = useStore((s) => s.prefs.inspectorWide);

	const options = [
		{
			on: merge,
			name: "Merge tool calls",
			sub: "Collapse runs of reads, edits and commands into one line. Diff totals show beside the summary.",
			click: actions.toggleMerge,
		},
		{
			on: thinking,
			name: "Show thinking",
			sub: "pi's reasoning between steps. Hidden by default — what it wrote and did is shown either way.",
			click: actions.toggleThinking,
		},
		{
			on: wide,
			name: "Wide inspector",
			sub: "Give the right panel more room for diffs and workflow runs.",
			click: actions.toggleWide,
		},
	];

	return (
		<Menu className="menu menu--below" width={320}>
			<div className="menu__head">TRANSCRIPT</div>
			{options.map((o) => (
				<button type="button" className="menu__row" key={o.name} onClick={o.click}>
					<div className="switch" style={{ background: o.on ? "var(--accent)" : "var(--line-3)" }}>
						<div className="switch__knob" style={{ left: o.on ? 13 : 2 }} />
					</div>
					<span className="menu__body">
						<span className="menu__name">{o.name}</span>
						<span className="menu__sub">{o.sub}</span>
					</span>
				</button>
			))}
		</Menu>
	);
}

export function Titlebar(): JSX.Element {
	const session = useStore(currentSession);
	const theme = useStore((s) => s.prefs.theme);
	const viewMenu = useStore((s) => s.menu === "view");
	const busy = useStore((s) => s.busy);

	const elapsed = session ? formatDuration(session.elapsedMs) : "";

	return (
		<div className="titlebar">
			<div className="titlebar__rail">
				<div className="titlebar__lights" />
			</div>
			<div className="titlebar__main">
				<span className="titlebar__title">{session?.title ?? "kodepi"}</span>
				{session ? <span className="chip-code">{basename(session.cwd)}</span> : null}

				{busy ? (
					<div className="titlebar__status">
						<div className="dot dot--info dot--live" />
						<span className="titlebar__status-word titlebar__status-word--running">Reading</span>
					</div>
				) : null}

				{!busy && session?.status === "error" ? (
					<div className="titlebar__status">
						<div className="dot dot--bad" />
						<span className="titlebar__status-word titlebar__status-word--failed">Last turn failed</span>
					</div>
				) : null}

				{!busy && elapsed ? <span className="titlebar__elapsed">{elapsed}</span> : null}

				<div className="spacer" />

				<button type="button" className="icon-btn" title="Toggle inspector" onClick={actions.toggleInspector}>
					<PanelIcon />
				</button>

				<div className="menu-anchor">
					<button type="button" className="icon-btn" title="Transcript settings" onClick={() => actions.toggleMenu("view")}>
						<LinesIcon />
					</button>
					{viewMenu ? <ViewMenu /> : null}
				</div>

				<button type="button" className="icon-btn" title={THEME_TITLE[theme]} onClick={actions.cycleTheme}>
					{THEME_GLYPH[theme]}
				</button>
			</div>
		</div>
	);
}
