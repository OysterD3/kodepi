/**
 * The whole renderer state, and every action that changes it.
 *
 * One module-level snapshot, replaced on write, read through
 * `useSyncExternalStore`. Transient text — the composer, the palette query —
 * stays in the component that owns it: a store write notifies every mounted
 * subscriber, and a long transcript mounts hundreds.
 *
 * Steps are upserted by `id`, so a streaming row will be rewritten in place
 * rather than appended once a live pi process feeds this seam. Today the steps
 * arrive in one batch from the session reducer.
 */

import { useSyncExternalStore } from "react";
import type { InspectorTab, PiSettings, Preferences, Project, Session, SessionSummary, Step, Theme, WorkflowRun } from "@shared/model";
import { DEFAULT_PREFERENCES, errorMessage } from "@shared/model";
import { api } from "./api";

export type MenuId = "view" | "model" | "effort" | "access";

export type SettingsSection = "model" | "permissions" | "workflows" | "about";

export interface AppState {
	readonly prefs: Preferences;
	readonly projects: readonly Project[];
	readonly summaries: Readonly<Record<string, SessionSummary>>;
	/** Loaded transcripts, keyed by session id. */
	readonly sessions: Readonly<Record<string, Session>>;
	readonly sessionId: string | null;
	readonly settings: PiSettings | null;
	readonly workflows: readonly WorkflowRun[];
	readonly workflowId: string | null;
	/** True while the first scan or a session load is in flight. */
	readonly busy: boolean;
	/** Set only when the rail itself could not be read. Blanks the centre pane. */
	readonly error: string | null;
	/** A one-off failure from a button, shown beside the button that caused it. */
	readonly notice: string | null;
	readonly openProjects: Readonly<Record<string, boolean>>;
	readonly tab: InspectorTab;
	readonly menu: MenuId | null;
	readonly palette: boolean;
	readonly settingsOpen: boolean;
	readonly settingsSection: SettingsSection;
	readonly fileIdx: number;
	/** Step id → disclosure open. */
	readonly openSteps: Readonly<Record<string, boolean>>;
	/** Merged-tool-group key → disclosure open. */
	readonly openGroups: Readonly<Record<string, boolean>>;
	/**
	 * Session id → the draft id its live pi is keyed by in the main process.
	 *
	 * A session started here is named by the renderer before pi has recorded
	 * one, and pi's own id replaces it as soon as the recording appears. The
	 * draft id stays the handle for prompting it.
	 */
	readonly live: Readonly<Record<string, string>>;
}

let state: AppState = {
	prefs: DEFAULT_PREFERENCES,
	projects: [],
	summaries: {},
	sessions: {},
	sessionId: null,
	settings: null,
	workflows: [],
	workflowId: null,
	busy: true,
	error: null,
	notice: null,
	openProjects: {},
	tab: "diff",
	menu: null,
	palette: false,
	settingsOpen: false,
	settingsSection: "model",
	fileIdx: 0,
	openSteps: {},
	openGroups: {},
	live: {},
};

const listeners = new Set<() => void>();

/** Names the sessions this window started, so their ids never collide with pi's. */
let drafts = 0;

/** The session a live pi is currently filling, by the draft id it was started under. */
function keyOf(draftId: string): string | null {
	for (const [sessionId, draft] of Object.entries(state.live)) {
		if (draft === draftId) return sessionId;
	}
	return null;
}

function set(patch: Partial<AppState>): void {
	state = { ...state, ...patch };
	for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

export function useStore<T>(select: (s: AppState) => T): T {
	return useSyncExternalStore(
		subscribe,
		() => select(state),
		() => select(state),
	);
}

export function getState(): AppState {
	return state;
}

/** The open session, or null while the rail is still loading. */
export function currentSession(s: AppState = state): Session | null {
	return s.sessionId ? (s.sessions[s.sessionId] ?? null) : null;
}

/**
 * The runs the open session started.
 *
 * pi names the session in `workflow-runs/<runId>/run.json`; a run started from
 * a template outside a session has no session id and belongs to none.
 */
export function sessionWorkflows(runs: readonly WorkflowRun[], sessionId: string | null): WorkflowRun[] {
	return sessionId ? runs.filter((run) => run.sessionId === sessionId) : [];
}

/**
 * Stable empties for selectors.
 *
 * `useSyncExternalStore` compares snapshots by identity, so a selector that
 * allocates `[]` on a miss re-renders for ever.
 */
export const NO_FILES: Session["files"] = [];
export const NO_AGENTS: Session["agents"] = [];
export const NO_STEPS: Session["steps"] = [];

/* ── the seam a live pi will write through ─────────────────────────────── */

/**
 * Insert a step, or replace the one that already carries this id.
 *
 * pi rewrites a streaming assistant message many times; upserting keeps that
 * one transcript row instead of growing the list.
 */
export function upsertStep(sessionId: string, step: Step): void {
	const session = state.sessions[sessionId];
	if (!session) return;
	const at = session.steps.findIndex((s) => s.id === step.id);
	const steps = at === -1 ? [...session.steps, step] : session.steps.with(at, step);
	set({ sessions: { ...state.sessions, [sessionId]: { ...session, steps } } });
}

export function setSessionState(sessionId: string, patch: Partial<Session>): void {
	const session = state.sessions[sessionId];
	if (!session) return;
	set({ sessions: { ...state.sessions, [sessionId]: { ...session, ...patch } } });
}

/* ── actions ───────────────────────────────────────────────────────────── */

function setPrefs(patch: Partial<Preferences>): void {
	set({ prefs: { ...state.prefs, ...patch } });
}

export const actions = {
	/** Read pi's agent directory and open the newest session. */
	async load(): Promise<void> {
		set({ busy: true, error: null, notice: null });

		// The scan is the only load the rail cannot do without. Settings and
		// workflows fill their own corners, so a failure in either must not
		// blank the pane.
		const [scan, settings, workflows] = await Promise.all([
			api.scan().catch((error: unknown) => ({ failed: errorMessage(error) }) as const),
			api.settings().catch(() => null),
			api.workflows().catch(() => []),
		]);

		if ("failed" in scan) {
			set({ busy: false, error: scan.failed });
			return;
		}

		const summaries: Record<string, SessionSummary> = {};
		for (const session of scan.sessions) summaries[session.id] = session;

		// Every project starts open: the rail is a list of sessions, and a
		// closed project is one more click between the reader and the session.
		const openProjects: Record<string, boolean> = {};
		for (const project of scan.projects) openProjects[project.id] = true;

		set({
			projects: scan.projects,
			summaries,
			settings,
			workflows,
			workflowId: workflows[0]?.id ?? null,
			openProjects,
			busy: false,
		});

		const newest = scan.sessions[0];
		if (newest) await actions.openSession(newest.id);
	},

	async openSession(sessionId: string): Promise<void> {
		// Step ids are only unique within a session, so disclosure state has to
		// go with the session it belongs to. Clearing the error matters on the
		// cached path too: the pane shows it in front of a loaded transcript.
		set({ sessionId, palette: false, menu: null, fileIdx: 0, error: null, openSteps: {}, openGroups: {} });

		if (state.sessions[sessionId]) {
			actions.pickTabFor(sessionId);
			return;
		}

		set({ busy: true });
		try {
			const session = await api.openSession(sessionId);
			set({ sessions: { ...state.sessions, [sessionId]: session }, busy: false });
			actions.pickTabFor(sessionId);
		} catch (error) {
			set({ busy: false, error: errorMessage(error) });
		}
	},

	/** The design opens whichever tab has something to show. */
	pickTabFor(sessionId: string): void {
		const session = state.sessions[sessionId];
		if (session) set({ tab: session.agents.length ? "agents" : "diff" });
	},

	toggleTheme(): void {
		const theme: Theme = state.prefs.theme === "night" ? "day" : "night";
		setPrefs({ theme });
	},

	toggleInspector(): void {
		setPrefs({ inspectorOpen: !state.prefs.inspectorOpen });
	},

	toggleWide(): void {
		setPrefs({ inspectorWide: !state.prefs.inspectorWide });
	},

	toggleMerge(): void {
		setPrefs({ mergeToolCalls: !state.prefs.mergeToolCalls });
	},

	toggleThinking(): void {
		setPrefs({ showThinking: !state.prefs.showThinking });
	},

	setTab(tab: InspectorTab): void {
		set({ tab });
	},

	openTab(tab: InspectorTab): void {
		setPrefs({ inspectorOpen: true });
		set({ tab });
	},

	toggleMenu(menu: MenuId): void {
		set({ menu: state.menu === menu ? null : menu });
	},

	closeMenus(): void {
		set({ menu: null });
	},

	toggleProject(id: string): void {
		set({ openProjects: { ...state.openProjects, [id]: !state.openProjects[id] } });
	},

	setFileIdx(fileIdx: number): void {
		set({ fileIdx });
	},

	toggleStep(stepId: string): void {
		set({ openSteps: { ...state.openSteps, [stepId]: !state.openSteps[stepId] } });
	},

	toggleGroup(key: string): void {
		set({ openGroups: { ...state.openGroups, [key]: !state.openGroups[key] } });
	},

	openPalette(): void {
		set({ palette: true });
	},

	closePalette(): void {
		set({ palette: false });
	},

	openSettings(): void {
		set({ settingsOpen: true });
	},

	closeSettings(): void {
		set({ settingsOpen: false, notice: null });
	},

	setSettingsSection(settingsSection: SettingsSection): void {
		set({ settingsSection });
	},

	selectWorkflow(workflowId: string): void {
		setPrefs({ inspectorOpen: true });
		set({ workflowId, tab: "flow", menu: null });
	},

	/**
	 * Start a fresh pi in a project's directory.
	 *
	 * The session shows up empty and selected straight away; pi replaces it
	 * with its own recording — id, title and all — as soon as it has one.
	 */
	async newSession(cwd: string): Promise<void> {
		const draftId = `draft-${++drafts}`;
		const before = state;
		const draft: Session = {
			id: draftId,
			title: "New session",
			cwd,
			status: "new",
			model: state.settings?.defaultModel ?? "",
			provider: state.settings?.defaultProvider ?? "",
			thinkingLevel: state.settings?.defaultThinkingLevel ?? "medium",
			elapsedMs: 0,
			modified: Date.now(),
			activity: "Starting pi",
			steps: [],
			files: [],
			agents: [],
			terminal: [],
			branch: "",
			usage: null,
		};

		set({
			sessions: { ...state.sessions, [draftId]: draft },
			summaries: { ...state.summaries, [draftId]: { id: draftId, title: draft.title, status: "new", modified: draft.modified } },
			projects: state.projects.map((p) => (p.id === cwd ? { ...p, sessionIds: [draftId, ...p.sessionIds] } : p)),
			openProjects: { ...state.openProjects, [cwd]: true },
			live: { ...state.live, [draftId]: draftId },
			sessionId: draftId,
			openSteps: {},
			openGroups: {},
			fileIdx: 0,
			error: null,
			notice: null,
		});

		try {
			await api.startAgent(draftId, cwd);
		} catch (error) {
			// pi never started, so the row it was going to fill has to go back.
			set({
				sessions: before.sessions,
				summaries: before.summaries,
				projects: before.projects,
				live: before.live,
				sessionId: before.sessionId,
				notice: errorMessage(error),
			});
		}
	},

	/** Send the composer's text to the session's own pi. */
	async prompt(sessionId: string, message: string): Promise<void> {
		const draftId = state.live[sessionId];
		if (!draftId) return;
		try {
			await api.promptAgent(draftId, message);
		} catch (error) {
			set({ notice: errorMessage(error) });
		}
	},

	/** pi's recording, as it grows. It arrives under pi's own session id. */
	receiveSession(draftId: string, session: Session): void {
		const previous = keyOf(draftId) ?? draftId;
		const sessions = { ...state.sessions };
		if (previous !== session.id) delete sessions[previous];
		sessions[session.id] = session;

		const summaries = { ...state.summaries };
		if (previous !== session.id) delete summaries[previous];
		summaries[session.id] = { id: session.id, title: session.title, status: session.status, modified: session.modified };

		set({
			sessions,
			summaries,
			// The rail row keeps its place in the project it was started in.
			projects: state.projects.map((p) => ({ ...p, sessionIds: p.sessionIds.map((id) => (id === previous ? session.id : id)) })),
			live: { ...state.live, [session.id]: draftId },
			sessionId: state.sessionId === previous ? session.id : state.sessionId,
		});
	},

	/** pi started or stopped working, before its recording catches up. */
	receiveStatus(draftId: string, running: boolean): void {
		const sessionId = keyOf(draftId);
		const session = sessionId ? state.sessions[sessionId] : null;
		if (!sessionId || !session) return;
		set({
			sessions: {
				...state.sessions,
				[sessionId]: { ...session, activity: running ? "Working" : null, status: running ? "running" : session.status },
			},
		});
	},

	notice(text: string): void {
		set({ notice: text || null });
	},

	showDiff(): void {
		setPrefs({ inspectorOpen: true, inspectorWide: true });
		set({ tab: "diff" });
	},

	revealAgentDir(): void {
		void api.revealAgentDir().catch((error: unknown) => set({ notice: errorMessage(error) }));
	},
};
