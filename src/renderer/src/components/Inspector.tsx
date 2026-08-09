import type { JSX } from "react";
import type { InspectorTab } from "@shared/model";
import { ExpandIcon } from "./icons";
import { AgentsTab } from "./inspector/AgentsTab";
import { DiffTab } from "./inspector/DiffTab";
import { TerminalTab } from "./inspector/TerminalTab";
import { WorkflowTab } from "./inspector/WorkflowTab";
import { actions, currentSession, sessionWorkflows, useStore } from "@/lib/store";

const TABS: { key: InspectorTab; label: string; short: string }[] = [
	{ key: "diff", label: "Diff", short: "DF" },
	{ key: "agents", label: "Agents", short: "AG" },
	{ key: "term", label: "Terminal", short: "TM" },
	{ key: "flow", label: "Workflow", short: "WF" },
];

/** The 48px strip the inspector collapses to. */
export function InspectorStrip(): JSX.Element {
	return (
		<div className="railstrip">
			{TABS.map((tab) => (
				<button type="button" key={tab.key} title={tab.label} onClick={() => actions.openTab(tab.key)}>
					{tab.short}
				</button>
			))}
		</div>
	);
}

export function Inspector(): JSX.Element {
	const fileCount = useStore((s) => currentSession(s)?.files.length ?? 0);
	const agentCount = useStore((s) => currentSession(s)?.agents.length ?? 0);
	const workflowCount = useStore((s) => sessionWorkflows(s.workflows, s.sessionId).length);
	const tab = useStore((s) => s.tab);
	const wide = useStore((s) => s.prefs.inspectorWide);

	const counts: Record<InspectorTab, number> = {
		diff: fileCount,
		agents: agentCount,
		term: 0,
		flow: workflowCount,
	};

	return (
		<div className="inspector" style={{ width: wide ? 660 : 408 }}>
			<div className="inspector__tabs">
				{TABS.map((t) => (
					<button
						type="button"
						key={t.key}
						className={`tab${tab === t.key ? " tab--active" : ""}`}
						onClick={() => actions.setTab(t.key)}
					>
						<span className="tab__label">{t.label}</span>
						{counts[t.key] ? <span className="tab__count">{counts[t.key]}</span> : null}
					</button>
				))}
				<span className="spacer" />
				<button type="button" className="icon-btn icon-btn--md" title="Expand" onClick={actions.toggleWide}>
					<ExpandIcon />
				</button>
				<button type="button" className="icon-btn icon-btn--md" title="Close" onClick={actions.toggleInspector}>
					×
				</button>
			</div>

			{tab === "diff" ? <DiffTab /> : null}
			{tab === "agents" ? <AgentsTab /> : null}
			{tab === "term" ? <TerminalTab /> : null}
			{tab === "flow" ? <WorkflowTab /> : null}
		</div>
	);
}
