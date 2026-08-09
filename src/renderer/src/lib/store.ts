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
import type {
	InspectorTab,
	PiCommand,
	PiModel,
	PiSettings,
	Preferences,
	Project,
	Session,
	SessionSummary,
	SkillList,
	SkillMode,
	Step,
	ThinkingLevel,
	WorkflowRun,
} from "@shared/model";
import { DEFAULT_PREFERENCES, errorMessage } from "@shared/model";
import { api } from "./api";
import type { Appearance } from "./theme";
import { nextTheme, prefersDark, resolveTheme } from "./theme";

export type MenuId = "view" | "model" | "effort" | "access" | "newdir" | "defmodel";

export type SettingsSection = "model" | "permissions" | "skills" | "workflows" | "about";

export interface AppState {
	readonly prefs: Preferences;
	/** macOS's appearance, watched by the window. Read only through `appearance`. */
	readonly systemDark: boolean;
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
	/** The new-chat page, which takes the centre pane in place of a transcript. */
	readonly newChat: boolean;
	/** Where a new chat would run. Empty when this machine has no projects yet. */
	readonly newCwd: string;
	/** That directory's branch — null while it is being read, or if it is no repo. */
	readonly newBranch: string | null;
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
	/**
	 * What each live pi will accept after a slash, keyed by that draft id.
	 *
	 * Keyed by the draft rather than the session because the commands arrive
	 * before pi has recorded a session id, and the draft id is the one handle
	 * that never changes underneath them.
	 */
	readonly commands: Readonly<Record<string, readonly PiCommand[]>>;
	/**
	 * The thinking levels each live pi's model supports, by draft id.
	 *
	 * Asked for once, so they describe the model pi started under. Empty for a
	 * session read off disk, where the slider is a report and not a control.
	 */
	readonly levels: Readonly<Record<string, readonly ThinkingLevel[]>>;
	/**
	 * The skills on disk, and the mode each is in. Null until first read.
	 *
	 * Project skills are found relative to a directory, so this belongs to one
	 * — it is not a property of the machine.
	 */
	readonly skills: SkillList | null;
	readonly skillsCwd: string;
	readonly skillsBusy: boolean;
	/**
	 * Every model pi is configured for. Null until asked, and asked at most once
	 * a run: it costs a pi process, and the answer describes the machine.
	 */
	readonly models: readonly PiModel[] | null;
	readonly modelsBusy: boolean;
}

let state: AppState = {
	prefs: DEFAULT_PREFERENCES,
	systemDark: prefersDark(),
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
	newChat: false,
	newCwd: "",
	newBranch: null,
	settingsOpen: false,
	settingsSection: "model",
	fileIdx: 0,
	openSteps: {},
	openGroups: {},
	live: {},
	commands: {},
	levels: {},
	skills: null,
	skillsCwd: "",
	skillsBusy: false,
	models: null,
	modelsBusy: false,
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

/**
 * The appearance actually painted.
 *
 * Everything that has to repaint on a theme change reads this rather than the
 * preference: under `auto` the preference never changes, and the system does.
 */
export function appearance(s: AppState = state): Appearance {
	return resolveTheme(s.prefs.theme, s.systemDark);
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
export const NO_COMMANDS: readonly PiCommand[] = [];
export const NO_LEVELS: readonly ThinkingLevel[] = [];

/**
 * The directory the skills panel is about: whatever is open, or wherever a new
 * chat would run. Project skills are relative to it.
 */
export function skillsFor(s: AppState = state): string {
	return currentSession(s)?.cwd || s.newCwd || s.projects[0]?.id || "";
}

/**
 * The levels the open session's pi will take.
 *
 * Empty for a session read off disk, and empty until pi has answered — in both
 * cases the slider reports rather than sets.
 */
export function sessionLevels(s: AppState = state): readonly ThinkingLevel[] {
	const draftId = s.sessionId ? s.live[s.sessionId] : null;
	return (draftId ? s.levels[draftId] : null) ?? NO_LEVELS;
}

/**
 * What the open session's pi will accept after a slash.
 *
 * Empty for a session read off disk: there is no pi to run a command, and
 * offering one would be a button that does nothing.
 */
export function sessionCommands(s: AppState = state): readonly PiCommand[] {
	const draftId = s.sessionId ? s.live[s.sessionId] : null;
	return (draftId ? s.commands[draftId] : null) ?? NO_COMMANDS;
}

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

/** A settings panel that reads something outside the store asks for it on arrival. */
function loadSection(section: SettingsSection): void {
	if (section === "skills") void actions.loadSkills();
	if (section === "model") void actions.loadModels();
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
		set({ sessionId, palette: false, newChat: false, menu: null, fileIdx: 0, error: null, openSteps: {}, openGroups: {} });

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

	/** auto → night → day → auto. `auto` is macOS's own appearance. */
	cycleTheme(): void {
		setPrefs({ theme: nextTheme(state.prefs.theme) });
	},

	/** macOS switched appearance. Only `auto` cares. */
	receiveAppearance(systemDark: boolean): void {
		if (systemDark !== state.systemDark) set({ systemDark });
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

	/**
	 * Open the new-chat page.
	 *
	 * It opens on the directory you are already working in, because that is
	 * almost always the answer; the chip and the folder button change it.
	 */
	async openNewChat(): Promise<void> {
		const cwd = currentSession()?.cwd || state.projects[0]?.id || "";
		set({ newChat: true, menu: null, palette: false, notice: null });
		await actions.setNewCwd(cwd);
	},

	closeNewChat(): void {
		set({ newChat: false, menu: null });
	},

	async setNewCwd(cwd: string): Promise<void> {
		set({ newCwd: cwd, newBranch: null, menu: null });
		if (!cwd) return;
		const branch = await api.branchOf(cwd).catch(() => null);
		// A slow answer for a directory the user has already moved off is stale.
		if (state.newCwd === cwd) set({ newBranch: branch });
	},

	/** The native chooser, for a directory pi has never run in. */
	async chooseNewCwd(): Promise<void> {
		set({ menu: null });
		try {
			const cwd = await api.chooseDirectory();
			if (cwd) await actions.setNewCwd(cwd);
		} catch (error) {
			set({ notice: errorMessage(error) });
		}
	},

	/**
	 * Start the chat, and send its first message.
	 *
	 * The page stays put if pi will not start: `newSession` puts the reason in
	 * the notice and rolls back, and the typed message is worth keeping.
	 */
	async startNewChat(message: string): Promise<void> {
		const cwd = state.newCwd;
		if (!cwd) return;

		const before = state.sessionId;
		await actions.newSession(cwd);

		const sessionId = state.sessionId;
		if (!sessionId || sessionId === before || !state.live[sessionId]) return;

		set({ newChat: false });
		if (message) await actions.prompt(sessionId, message);
	},

	openSettings(settingsSection: SettingsSection = state.settingsSection): void {
		set({ settingsOpen: true, settingsSection, menu: null });
		loadSection(settingsSection);
	},

	/**
	 * Ask pi what models it is configured for, once.
	 *
	 * A pi has to be started to answer, so the list is kept for the run. It
	 * describes the machine's providers, which do not change while the app is
	 * open — and a failure leaves the panel reporting what settings.json says.
	 */
	async loadModels(): Promise<void> {
		if (state.modelsBusy || state.models) return;

		set({ modelsBusy: true });
		try {
			const models = await api.models(skillsFor());
			set({ models, modelsBusy: false });
		} catch (error) {
			set({ modelsBusy: false, notice: errorMessage(error) });
		}
	},

	/**
	 * Choose the model a new session starts on.
	 *
	 * Settings are read back rather than patched here, so the panel shows what
	 * the file says and not what this app asked for.
	 */
	async setDefaultModel(provider: string, modelId: string): Promise<void> {
		// Shut the list at once. The write is pi's file, not this window's, and
		// waiting for it would leave the menu hanging open on a click.
		set({ menu: null });
		try {
			await api.setDefaultModel(provider, modelId);
			set({ settings: await api.settings() });
		} catch (error) {
			set({ notice: errorMessage(error) });
		}
	},

	/**
	 * How hard pi thinks in a session it has not started yet.
	 *
	 * Not the same setting as the composer's slider: that one moves a running
	 * pi and dies with it. This one is a line in pi's settings file.
	 */
	async setDefaultThinkingLevel(level: ThinkingLevel): Promise<void> {
		try {
			await api.setDefaultThinkingLevel(level);
			set({ settings: await api.settings() });
		} catch (error) {
			set({ notice: errorMessage(error) });
		}
	},

	/** Read the skill directories, unless this directory is already read. */
	async loadSkills(force = false): Promise<void> {
		const cwd = skillsFor();
		if (state.skillsBusy) return;
		if (!force && state.skills && state.skillsCwd === cwd) return;

		set({ skillsBusy: true, skillsCwd: cwd });
		try {
			const skills = await api.skills(cwd);
			set({ skills, skillsBusy: false });
		} catch (error) {
			set({ skillsBusy: false, notice: errorMessage(error) });
		}
	},

	/**
	 * Change what a skill costs the prompt.
	 *
	 * This writes pi's own skill-loading preferences, so the list is read back
	 * rather than patched here: the file takes globs, and the mode a skill ends
	 * up in is that extension's answer, not this app's guess.
	 */
	async setSkillMode(name: string, mode: SkillMode): Promise<void> {
		try {
			await api.setSkillMode(name, mode, state.skillsCwd);
			await actions.loadSkills(true);
		} catch (error) {
			set({ notice: errorMessage(error) });
		}
	},

	closeSettings(): void {
		set({ settingsOpen: false, notice: null });
	},

	setSettingsSection(settingsSection: SettingsSection): void {
		set({ settingsSection });
		// Reached by the nav as well as by opening the sheet on a section, and a
		// panel that never asked for its data draws an empty one.
		loadSection(settingsSection);
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

	/**
	 * Attach a pi to a session that was read off disk.
	 *
	 * pi keeps the session's id and appends to the same recording, so nothing
	 * has to be moved: the row, the transcript and the id all stay put, and the
	 * session simply becomes live.
	 */
	async resumeSession(sessionId: string): Promise<void> {
		if (state.live[sessionId]) return;
		const before = state.live;
		set({ live: { ...state.live, [sessionId]: sessionId }, notice: null });
		try {
			await api.resumeAgent(sessionId);
		} catch (error) {
			set({ live: before, notice: errorMessage(error) });
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

		// The draft's own key has to go with it. `keyOf` walks this map and
		// returns the first key that names this pi, so a leftover draft key
		// would answer for every later event and point at a session that has
		// already been deleted.
		const live = { ...state.live };
		if (previous !== session.id) delete live[previous];
		live[session.id] = draftId;

		set({
			sessions,
			summaries,
			// The rail row keeps its place in the project it was started in.
			projects: state.projects.map((p) => ({ ...p, sessionIds: p.sessionIds.map((id) => (id === previous ? session.id : id)) })),
			live,
			sessionId: state.sessionId === previous ? session.id : state.sessionId,
		});
	},

	/** What this pi loaded: its extensions, prompt templates and skills. */
	receiveCommands(draftId: string, commands: readonly PiCommand[]): void {
		set({ commands: { ...state.commands, [draftId]: commands } });
	},

	/**
	 * Ask the session's pi to think harder, or less hard.
	 *
	 * The chip moves first so the slider follows the hand that drags it; pi's
	 * own `thinking_level_changed` is the confirmation, and a refusal puts the
	 * chip back where pi says it belongs.
	 */
	setThinkingLevel(sessionId: string, level: ThinkingLevel): void {
		const draftId = state.live[sessionId];
		if (!draftId) return;
		setSessionState(sessionId, { thinkingLevel: level });
		void api.setThinkingLevel(draftId, level).catch((error: unknown) => set({ notice: errorMessage(error) }));
	},

	/** Where the live pi's thinking level stands, and what its model allows. */
	receiveThinking(draftId: string, level: ThinkingLevel | null, levels: readonly ThinkingLevel[]): void {
		set({ levels: { ...state.levels, [draftId]: levels } });
		const sessionId = keyOf(draftId);
		if (sessionId && level) setSessionState(sessionId, { thinkingLevel: level });
	},

	/**
	 * pi's process ended.
	 *
	 * The session goes back to being a recording, which is the truth and also
	 * puts "Continue this session" back in front of the user. Leaving it live
	 * would strand the composer on a pi that cannot be sent to — the login
	 * shell exits well after the spawn that started it reported success.
	 */
	receiveExit(draftId: string): void {
		const sessionId = keyOf(draftId);
		if (!sessionId) return;
		const live = { ...state.live };
		delete live[sessionId];
		set({ live });
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
