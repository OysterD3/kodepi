import type { JSX } from "react";
import { useMemo } from "react";
import { Blank } from "../primitives";
import { WORKFLOW_STATUS_COLOR, basename, formatDateTime, formatTokens, modelTint, plural } from "@/lib/format";
import { actions, sessionWorkflows, useStore } from "@/lib/store";

export function WorkflowTab(): JSX.Element {
	// Filtering in the selector would allocate a new array on every read, and
	// `useSyncExternalStore` compares snapshots by identity.
	const all = useStore((s) => s.workflows);
	const sessionId = useStore((s) => s.sessionId);
	const runs = useMemo(() => sessionWorkflows(all, sessionId), [all, sessionId]);
	const selectedId = useStore((s) => s.workflowId);
	const wide = useStore((s) => s.prefs.inspectorWide);

	if (runs.length === 0) {
		return (
			<div className="flow__body">
				<Blank tight title="NO WORKFLOW RUNS" text="pi records a run against the session that started it. This session started none." />
			</div>
		);
	}

	const selected = runs.find((r) => r.id === selectedId) ?? runs[0];
	if (!selected) return <div className="flow__body" />;

	return (
		<>
			<div className="flow__head">
				<div className="flow__title-row">
					<span className="flow__glyph">◈</span>
					<span className="flow__label">{selected.name}</span>
					<span className="spacer" />
					<span className="flow__status" style={{ color: WORKFLOW_STATUS_COLOR[selected.status] }}>
						{selected.status}
					</span>
				</div>
				<div className="flow__meta">
					<span>{basename(selected.cwd)}</span>
					<span className="spacer" />
					<span>{formatDateTime(selected.updatedAt)}</span>
				</div>
				<div className="flow__actions">
					<span className="flow__cost">
						<span className="flow__cost-label">Tokens</span>
						<span className="flow__cost-value">{formatTokens(selected.totalTokens)}</span>
					</span>
					<span className="spacer" />
					<span className="flow__cost">
						<span className="flow__cost-label">Cost</span>
						<span className="flow__cost-value">${selected.costUsd.toFixed(2)}</span>
					</span>
				</div>
			</div>

			<div className="flow__body">
				{selected.phases.length > 0 ? (
					selected.phases.map((phase, i) => (
						<div className="phase" key={phase.name}>
							<div className="phase__head">
								<span className="phase__num">{i + 1}</span>
								<span style={{ flex: 1, minWidth: 0 }}>
									<span className="phase__name">{phase.name}</span>
									<span className="phase__mode">{plural(phase.agents.length, "agent", "agents")}</span>
								</span>
							</div>
							<div className="phase__grid" style={{ gridTemplateColumns: wide ? "1fr 1fr" : "1fr" }}>
								{phase.agents.map((agent) => (
									<div className="wfagent" key={agent.id}>
										<div className="wfagent__head">
											<span className="dot dot--info" />
											<span className="wfagent__name">{agent.name}</span>
											{agent.model ? (
												<span className="wfagent__model" style={{ color: modelTint(agent.model) }}>
													{agent.model}
												</span>
											) : null}
										</div>
										{agent.task ? <div className="wfagent__scope">{agent.task}</div> : null}
									</div>
								))}
							</div>
						</div>
					))
				) : (
					<Blank tight title="NO PHASES RECORDED" text="pi writes a phase only as the run opens it. This one stopped before it opened any." />
				)}

				<div className="mix">
					<div className="section-label" style={{ marginBottom: 9 }}>
						RUNS IN THIS SESSION ({runs.length})
					</div>
					<div className="difflist__files">
						{runs.map((run) => (
							<button
								type="button"
								className={`filerow${run.id === selected.id ? " filerow--active" : ""}`}
								key={run.id}
								onClick={() => actions.selectWorkflow(run.id)}
								title={run.cwd}
							>
								<span className="dot" style={{ background: WORKFLOW_STATUS_COLOR[run.status] }} />
								<span className="filerow__path" style={{ direction: "ltr" }}>
									{run.name}
								</span>
								<span className="hint">{basename(run.cwd)}</span>
							</button>
						))}
					</div>
				</div>
			</div>
		</>
	);
}
