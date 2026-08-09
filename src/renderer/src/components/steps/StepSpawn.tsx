import type { JSX } from "react";
import type { SpawnStep } from "@shared/model";

export function StepSpawn({ step }: { step: SpawnStep }): JSX.Element {
	return (
		<div className="card spawn">
			<div className="spawn__head">
				<span className="eyebrow">SUBAGENTS</span>
				<span className="spawn__text">{step.text}</span>
			</div>
			<div className="spawn__list">
				{step.agents.map((agent) => (
					<div className="spawn__row" key={agent.id}>
						<div className={`dot dot--${agent.status === "done" ? "ok" : agent.status === "failed" ? "bad" : "info"}`} />
						<span className="spawn__name">{agent.name}</span>
						<span className="spawn__task">{agent.task}</span>
						{/* A delegation reports no fraction, so there is no bar to draw. */}
						<span className="spawn__pct">{agent.percent === null ? "—" : `${agent.percent}%`}</span>
					</div>
				))}
			</div>
		</div>
	);
}
