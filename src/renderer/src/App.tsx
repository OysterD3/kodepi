import type { JSX } from "react";
import { useEffect } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { Composer } from "./components/Composer";
import { Inspector, InspectorStrip } from "./components/Inspector";
import { LeftRail } from "./components/LeftRail";
import { Settings } from "./components/Settings";
import { Titlebar } from "./components/Titlebar";
import { Transcript } from "./components/Transcript";
import { api } from "./lib/api";
import { useHotkeys } from "./lib/useHotkeys";
import { actions, useStore } from "./lib/store";

export function App(): JSX.Element {
	const theme = useStore((s) => s.prefs.theme);
	const inspectorOpen = useStore((s) => s.prefs.inspectorOpen);
	const palette = useStore((s) => s.palette);
	const settingsOpen = useStore((s) => s.settingsOpen);

	useHotkeys();

	useEffect(() => {
		void actions.load();
	}, []);

	// One subscription for the window: a live pi writes to the session it owns,
	// whichever one is on screen.
	useEffect(() => {
		const off = [
			api.onAgentSession((draftId, session) => actions.receiveSession(draftId, session)),
			api.onAgentStatus((draftId, running) => actions.receiveStatus(draftId, running)),
			api.onAgentNotice((_draftId, text) => actions.notice(text)),
		];
		return () => {
			for (const unsubscribe of off) unsubscribe();
		};
	}, []);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);

	return (
		<div className="app">
			<Titlebar />
			<div className="app__body">
				<LeftRail />
				<div className="centre">
					<Transcript />
					<Composer />
				</div>
				{inspectorOpen ? <Inspector /> : <InspectorStrip />}
			</div>

			{palette ? <CommandPalette /> : null}
			{settingsOpen ? <Settings /> : null}
		</div>
	);
}
