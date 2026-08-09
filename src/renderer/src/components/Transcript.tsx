import type { JSX } from "react";
import { useEffect, useMemo, useRef } from "react";
import { StepRow } from "./steps";
import { buildRows } from "@/lib/rows";
import { NO_STEPS, actions, currentSession, useStore } from "@/lib/store";

function Splash({ title, text }: { title: string; text: string }): JSX.Element {
	return (
		<div className="empty">
			<div className="empty__mark" />
			<div className="empty__title">{title}</div>
			<div className="empty__sub">{text}</div>
		</div>
	);
}

export function Transcript(): JSX.Element {
	const session = useStore(currentSession);
	const merge = useStore((s) => s.prefs.mergeToolCalls);
	const showThinking = useStore((s) => s.prefs.showThinking);
	const busy = useStore((s) => s.busy);
	const error = useStore((s) => s.error);
	const agentDir = useStore((s) => s.settings?.agentDir ?? "pi's agent directory");
	const scroller = useRef<HTMLDivElement>(null);

	const steps = session?.steps ?? NO_STEPS;

	// A long transcript is thousands of elements; rebuilding the rows on every
	// unrelated store write (a theme toggle, ⌘K) is the difference between a
	// free re-render and a 25 ms one.
	const rows = useMemo(() => buildRows(steps, merge, showThinking), [steps, merge, showThinking]);

	// Jump to the tail on a session switch and as steps arrive.
	useEffect(() => {
		const el = scroller.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [steps]);

	if (error) {
		return (
			<div className="transcript" ref={scroller}>
				<div className="empty">
					<div className="empty__title">Could not read pi's sessions</div>
					<div className="empty__sub">{error}</div>
					<div style={{ marginTop: 24 }}>
						<button type="button" className="btn btn--outline" onClick={() => void actions.load()}>
							Try again
						</button>
					</div>
				</div>
			</div>
		);
	}

	if (!session) {
		return (
			<div className="transcript" ref={scroller}>
				<Splash
					title={busy ? "Reading pi's sessions…" : "No session open"}
					text={busy ? `This walks ${agentDir}/sessions once.` : "Pick one from the rail, or press ⌘K."}
				/>
			</div>
		);
	}

	return (
		<div className="transcript" ref={scroller}>
			{steps.length === 0 ? (
				<Splash title="This session is empty" text="pi recorded a session here but no turns were taken." />
			) : (
				<div className="transcript__steps">
					{rows.map((row) => (
						<StepRow key={row.type === "group" ? row.key : row.step.id} row={row} />
					))}
					<div style={{ height: 10 }} />
				</div>
			)}
		</div>
	);
}
