/**
 * The bridge between the two processes.
 *
 * The renderer never touches `ipcRenderer`. Every call goes through
 * `window.api`, which the preload builds from this list.
 */

import type { PiSettings, Project, Session, SessionSummary, WorkflowRun } from "./model";

export const CHANNELS = {
	scan: "pi:scan",
	openSession: "pi:open-session",
	settings: "pi:settings",
	workflows: "pi:workflows",
	revealAgentDir: "pi:reveal-agent-dir",
	termStart: "term:start",
	termWrite: "term:write",
	termResize: "term:resize",
	/** Main → renderer. The only traffic in this app that is not a reply. */
	termData: "term:data",
	termExit: "term:exit",
	agentStart: "agent:start",
	agentPrompt: "agent:prompt",
	agentAbort: "agent:abort",
	/** Main → renderer: the session as pi has recorded it so far. */
	agentSession: "agent:session",
	agentStatus: "agent:status",
	agentNotice: "agent:notice",
} as const;

export interface ScanResult {
	readonly projects: readonly Project[];
	readonly sessions: readonly SessionSummary[];
}

/**
 * Main-process failures cross the bridge as data, not as a rejected promise
 * with a mangled stack. The preload turns `ok: false` back into an Error.
 */
export type IpcResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

export interface PiApi {
	/** Projects and session summaries for the rail. Cheap; no transcripts. */
	scan(): Promise<ScanResult>;
	/** Reduce one session in full. */
	openSession(sessionId: string): Promise<Session>;
	settings(): Promise<PiSettings>;
	workflows(): Promise<readonly WorkflowRun[]>;
	/** Show pi's agent directory in the file manager. */
	revealAgentDir(): Promise<void>;

	/* ── the session's shell ─────────────────────────────────────────────── */

	/** Start the shell for a session, or do nothing if it already runs. */
	startShell(sessionId: string, cwd: string, cols: number, rows: number): Promise<void>;
	/** Keystrokes, straight through to the pty. */
	writeShell(sessionId: string, data: string): Promise<void>;
	resizeShell(sessionId: string, cols: number, rows: number): Promise<void>;
	/** Both return the unsubscribe function. */
	onShellData(listener: (sessionId: string, data: string) => void): () => void;
	onShellExit(listener: (sessionId: string, exitCode: number) => void): () => void;

	/* ── a live pi ───────────────────────────────────────────────────────── */

	/** Start `pi --mode rpc` in a directory. `draftId` names it until pi has a session id. */
	startAgent(draftId: string, cwd: string): Promise<void>;
	promptAgent(draftId: string, message: string): Promise<void>;
	abortAgent(draftId: string): Promise<void>;
	/** The whole session, re-read from pi's own recording, as it grows. */
	onAgentSession(listener: (draftId: string, session: Session) => void): () => void;
	onAgentStatus(listener: (draftId: string, running: boolean) => void): () => void;
	onAgentNotice(listener: (draftId: string, text: string) => void): () => void;
}
