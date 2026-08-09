import type { JSX } from "react";
import type { SessionStatus, SessionSummary } from "@shared/model";
import { BranchIcon } from "./icons";
import { Blank, Chevron } from "./primitives";
import { formatAgo } from "@/lib/format";
import { actions, useStore } from "@/lib/store";

const STATUS_WORD: Record<SessionStatus, string> = {
	running: "Working",
	waiting: "Waiting",
	done: "Completed",
	error: "Failed",
	new: "Empty",
};

const STATUS_DOT: Record<SessionStatus, string> = {
	running: "dot--info dot--live",
	waiting: "dot--warn",
	done: "dot--ok",
	error: "dot--bad",
	new: "dot--idle",
};

/** The rail labels a session only when it moved recently or ended badly. */
const FRESH_MS = 90_000;

function SessionRow({ session, active, now }: { session: SessionSummary; active: boolean; now: number }): JSX.Element {
	const showStatus = !active && (now - session.modified < FRESH_MS || session.status === "error");

	return (
		<button type="button" className={`session${active ? " session--active" : ""}`} onClick={() => void actions.openSession(session.id)}>
			{showStatus ? (
				<span className="session__status">
					<BranchIcon size={11} stroke="var(--fg-4)" />
					<span className={`dot ${STATUS_DOT[session.status]}`} />
					<span className="session__status-word">{STATUS_WORD[session.status]}</span>
				</span>
			) : null}
			<span className="session__title">{session.title}</span>
			<span className="session__ago">{formatAgo(session.modified, now)}</span>
		</button>
	);
}

export function ProjectTree(): JSX.Element {
	const projects = useStore((s) => s.projects);
	const summaries = useStore((s) => s.summaries);
	const openProjects = useStore((s) => s.openProjects);
	const sessionId = useStore((s) => s.sessionId);
	const busy = useStore((s) => s.busy);
	const agentDir = useStore((s) => s.settings?.agentDir ?? "pi's agent directory");

	if (projects.length === 0) {
		return (
			<div className="rail__list">
				<Blank
					tight
					title={busy ? "READING" : "NO SESSIONS"}
					text={busy ? `Scanning ${agentDir}.` : `Nothing in ${agentDir}/sessions yet. Run pi once and reopen.`}
				/>
			</div>
		);
	}

	const now = Date.now();

	return (
		<div className="rail__list">
			{projects.map((project) => {
				const open = !!openProjects[project.id];
				const sessions = project.sessionIds.flatMap((id) => {
					const session = summaries[id];
					return session ? [session] : [];
				});

				return (
					<div className="project" key={project.id}>
						<button type="button" className="project__row" onClick={() => actions.toggleProject(project.id)} title={project.id}>
							<Chevron open={open} />
							<span className="project__name">{project.name}</span>
						</button>
						<button
							type="button"
							className="project__new"
							title={`Start a fresh pi in ${project.id}`}
							onClick={() => void actions.newSession(project.id)}
						>
							+
						</button>

						{open ? (
							<div style={{ display: "flex", flexDirection: "column" }}>
								{sessions.map((session) => (
									<SessionRow key={session.id} session={session} active={sessionId === session.id} now={now} />
								))}
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
