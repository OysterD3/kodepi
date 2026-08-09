import type { JSX } from "react";
import type { WfStep } from "@shared/model";
import { WORKFLOW_STATUS_COLOR, formatTokens, plural } from "@/lib/format";
import { actions, useStore } from "@/lib/store";

export function StepWorkflow({ step }: { step: WfStep }): JSX.Element {
	const runs = useStore((s) => s.workflows);
	// An empty runId must not match an empty workflowId, or every card lights up.
	const active = useStore((s) => step.runId !== "" && s.tab === "flow" && s.prefs.inspectorOpen && s.workflowId === step.runId);

	// A call pi refused never started a run, so there is nothing to open.
	if (step.failed) {
		return (
			<div className="wfcard wfcard--failed">
				<span className="wfcard__glyph" style={{ color: "var(--bad)" }}>
					◈
				</span>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div className="wfcard__top">
						<span className="wfcard__label">{step.name}</span>
						<span className="wfcard__status" style={{ color: "var(--bad)" }}>
							refused
						</span>
					</div>
					<div className="wfcard__sub">{step.error}</div>
				</div>
			</div>
		);
	}

	// The id the tool result printed is the run directory's own name, so this
	// resolves — unless pi has already pruned the run.
	const run = step.runId ? runs.find((r) => r.id === step.runId) : undefined;

	return (
		<button
			type="button"
			className={`wfcard${active ? " wfcard--active" : ""}`}
			disabled={!run}
			onClick={() => {
				if (run) actions.selectWorkflow(run.id);
			}}
		>
			<span className="wfcard__glyph">◈</span>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div className="wfcard__top">
					<span className="wfcard__label">{run?.name ?? step.name}</span>
					<span className="wfcard__name">{step.runId}</span>
					{run ? (
						<span className="wfcard__status" style={{ color: WORKFLOW_STATUS_COLOR[run.status] }}>
							{run.status}
						</span>
					) : null}
				</div>
				<div className="wfcard__sub">
					{run
						? `${plural(run.agentCount, "agent", "agents")} · ${formatTokens(run.totalTokens)} tok · $${run.costUsd.toFixed(2)}`
						: "This run is not in pi's workflow-runs store"}
				</div>
			</div>
			{run ? <span className="wfcard__cta">{active ? "Open →" : "View →"}</span> : null}
		</button>
	);
}
