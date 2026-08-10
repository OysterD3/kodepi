/**
 * The bridge between the two processes.
 *
 * The renderer never touches `ipcRenderer`. Every call goes through
 * `window.api`, which the preload builds from this list.
 */

import type { PiCommand, PiModel, PiSettings, Project, Session, SessionSummary, SkillList, SkillMode, ThinkingLevel, WorkflowRun } from "./model";

export const CHANNELS = {
	scan: "pi:scan",
	openSession: "pi:open-session",
	settings: "pi:settings",
	workflows: "pi:workflows",
	revealAgentDir: "pi:reveal-agent-dir",
	skills: "pi:skills",
	setSkillMode: "pi:set-skill-mode",
	models: "pi:models",
	setDefaultModel: "pi:set-default-model",
	setDefaultThinking: "pi:set-default-thinking",
	setAdvisorModel: "pi:set-advisor-model",
	setActiveProfile: "pi:set-active-profile",
	setRoleModel: "pi:set-role-model",
	chooseDirectory: "app:choose-directory",
	branchOf: "git:branch",
	termStart: "term:start",
	termWrite: "term:write",
	termResize: "term:resize",
	/** Main → renderer. The only traffic in this app that is not a reply. */
	termData: "term:data",
	termExit: "term:exit",
	agentStart: "agent:start",
	agentResume: "agent:resume",
	agentPrompt: "agent:prompt",
	agentAbort: "agent:abort",
	agentSetThinking: "agent:set-thinking",
	/** Main → renderer: the session as pi has recorded it so far. */
	agentSession: "agent:session",
	agentStatus: "agent:status",
	agentNotice: "agent:notice",
	/** Main → renderer: what a slash can name, asked for once at startup. */
	agentCommands: "agent:commands",
	/** Main → renderer: where the live pi's thinking level stands, and its choices. */
	agentThinking: "agent:thinking",
	/** Main → renderer: that pi is gone, so the session is a recording again. */
	agentExit: "agent:exit",
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
	/** The skills reachable from a directory, and the mode each is in. */
	skills(cwd: string): Promise<SkillList>;
	/**
	 * Set one skill's mode. `off` is an exclusion in pi's settings.json; the
	 * rest are the skill-loading extension's own preferences.
	 */
	setSkillMode(name: string, mode: SkillMode, cwd: string): Promise<void>;
	/**
	 * Every model pi is configured for. Asked of a pi started for the question,
	 * because the catalogue on disk misses providers a package contributes.
	 */
	models(cwd: string): Promise<readonly PiModel[]>;
	/** The model a new session starts on — pi's own `defaultProvider`/`defaultModel`. */
	setDefaultModel(provider: string, modelId: string): Promise<void>;
	/** How hard pi thinks in a session it has just started. */
	setDefaultThinkingLevel(level: ThinkingLevel): Promise<void>;
	/** The model the advisor extension consults — a role name, or a reference. */
	setAdvisorModel(model: string): Promise<void>;
	/** Put a combination in force, and pi's own keys on its `session` role. */
	setActiveProfile(name: string): Promise<void>;
	/** Point one role of one combination at a model. `ref` is `provider/id[:level]`. */
	setRoleModel(profile: string, role: string, ref: string): Promise<void>;
	/** The native folder chooser. Null when the user backed out. */
	chooseDirectory(): Promise<string | null>;
	/** The git branch of any directory, or null when it is not a repository. */
	branchOf(cwd: string): Promise<string | null>;

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
	/**
	 * Attach a pi to a session already on disk — one the pi CLI recorded, or an
	 * earlier run of this app. It keeps its id, its history and its file.
	 */
	resumeAgent(sessionId: string): Promise<void>;
	promptAgent(draftId: string, message: string): Promise<void>;
	abortAgent(draftId: string): Promise<void>;
	/** The live pi's own level. It lasts as long as the process, not the file. */
	setThinkingLevel(draftId: string, level: ThinkingLevel): Promise<void>;
	/** The whole session, re-read from pi's own recording, as it grows. */
	onAgentSession(listener: (draftId: string, session: Session) => void): () => void;
	onAgentStatus(listener: (draftId: string, running: boolean) => void): () => void;
	onAgentNotice(listener: (draftId: string, text: string) => void): () => void;
	/** The commands that pi loaded — extensions, prompt templates and skills. */
	onAgentCommands(listener: (draftId: string, commands: readonly PiCommand[]) => void): () => void;
	/** `levels` is what the model supports; `level` is null until pi has said. */
	onAgentThinking(listener: (draftId: string, level: ThinkingLevel | null, levels: readonly ThinkingLevel[]) => void): () => void;
	/** pi's process ended, however it ended. Nothing can be sent to it again. */
	onAgentExit(listener: (draftId: string) => void): () => void;
}
