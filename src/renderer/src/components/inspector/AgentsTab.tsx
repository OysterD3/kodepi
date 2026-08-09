import type { JSX } from "react";
import { Blank } from "../primitives";
import { NO_AGENTS, currentSession, useStore } from "@/lib/store";

const DOT: Record<string, string> = { done: "dot--ok", failed: "dot--bad", running: "dot--info" };

export function AgentsTab(): JSX.Element {
	const agents = useStore((s) => currentSession(s)?.agents ?? NO_AGENTS);

	if (agents.length === 0) {
		return (
			<div className="agents">
				<Blank tight title="NO SUBAGENTS" text="This session ran on the main thread. A `task` delegation would appear here." />
			</div>
		);
	}

	return (
		<div className="agents">
			{agents.map((agent) => (
				<div className="agentcard" key={agent.id}>
					<div className="agentcard__head">
						<span className={`dot ${DOT[agent.status] ?? "dot--idle"}`} />
						<span className="agentcard__name">{agent.name}</span>
						<span className="spacer" />
						<span className="agentcard__status">{agent.status}</span>
					</div>
					<div className="agentcard__task">{agent.task}</div>
					{/* A delegation reports no fraction, so there is no bar to draw. */}
					<div className="agentcard__meta">
						<span>{agent.model || "model not recorded"}</span>
					</div>
				</div>
			))}
		</div>
	);
}
