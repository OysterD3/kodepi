/**
 * The domain model the renderer draws.
 *
 * This is not pi's wire shape. `main/pi/transcript.ts` is the pure projection
 * from pi's session entries into `Step[]`; the renderer never sees a raw entry.
 * Steps carry a stable `id` so a streaming row can be rewritten in place.
 *
 * Timestamps cross as epoch milliseconds and are formatted in the renderer.
 * Where the design asks for a number pi cannot supply, the type says so —
 * `Subagent.percent` is nullable, because an invented fraction would lie about
 * how far along the work is.
 */

/* ── projects and sessions ─────────────────────────────────────────────── */

export interface Project {
	/** The session's `cwd`, read from the file header — never the dirname. */
	readonly id: string;
	/** Directory basename, e.g. "checkout-web". */
	readonly name: string;
	/** Newest first. */
	readonly sessionIds: readonly string[];
}

/**
 * "new"     — nothing has run yet
 * "running" — a turn is in flight
 * "waiting" — parked on a user answer
 * "done"    — settled without error
 * "error"   — the last turn ended with an error
 *
 * A session read off disk is only ever "new", "done" or "error". "running" and
 * "waiting" need a live pi process.
 */
export type SessionStatus = "new" | "running" | "waiting" | "done" | "error";

/** What the rail needs. Cheap: the header line, the first user line, the mtime. */
export interface SessionSummary {
	readonly id: string;
	readonly title: string;
	readonly status: SessionStatus;
	/** Epoch ms of the last activity. */
	readonly modified: number;
}

/** Everything the centre pane and the inspector need for one open session. */
export interface Session {
	readonly id: string;
	readonly title: string;
	readonly cwd: string;
	readonly status: SessionStatus;
	readonly model: string;
	readonly provider: string;
	readonly thinkingLevel: ThinkingLevel;
	/** Sum of the turn durations pi recorded, in ms. 0 when it recorded none. */
	readonly elapsedMs: number;
	/** Epoch ms of the last activity. */
	readonly modified: number;
	/** One line of what the agent is doing now. Null unless a run is live. */
	readonly activity: string | null;
	readonly steps: readonly Step[];
	readonly files: readonly DiffFile[];
	readonly agents: readonly Subagent[];
	readonly terminal: readonly TerminalLine[];
	/** Current git branch of `cwd`, or null when it is not a repository. */
	readonly branch: string | null;
	readonly usage: SessionUsage | null;
}

export interface SessionUsage {
	/**
	 * What is in the context window right now — the prompt size of the last
	 * call pi recorded. Not the session total: pi's running totals count every
	 * cache read across the whole session and would dwarf any window.
	 */
	readonly contextTokens: number;
	/** Every token the session spent, cache reads included. */
	readonly totalTokens: number;
	/** A catalogue estimate from pi, not a bill. Label it as one. */
	readonly costUsd: number;
	/** Null when the model's window is unknown. */
	readonly contextWindow: number | null;
}

/* ── steps ─────────────────────────────────────────────────────────────── */

export type StepKind =
	| "user"
	| "text"
	| "think"
	| "read"
	| "edit"
	| "run"
	| "tool"
	| "spawn"
	| "advise"
	| "wf"
	| "question"
	| "done"
	| "compaction";

interface StepBase {
	/** Stable for the life of the session. React key and upsert key. */
	readonly id: string;
	readonly kind: StepKind;
}

export interface UserStep extends StepBase {
	readonly kind: "user";
	readonly text: string;
}

export interface TextStep extends StepBase {
	readonly kind: "text";
	readonly text: string;
	/** True while a live run is still writing this row. */
	readonly streaming: boolean;
}

export interface ThinkStep extends StepBase {
	readonly kind: "think";
	/** Header line, e.g. "Thinking". */
	readonly text: string;
	/** Secondary header, e.g. "3 blocks". Empty when unknown. */
	readonly meta: string;
	readonly body: readonly string[];
}

export interface ReadStep extends StepBase {
	readonly kind: "read";
	readonly file: string;
	/** e.g. "142 lines", or the error when the read failed. */
	readonly meta: string;
	readonly failed: boolean;
}

export interface EditStep extends StepBase {
	readonly kind: "edit";
	readonly file: string;
	readonly add: number;
	readonly del: number;
	readonly diff: readonly DiffLine[];
	readonly failed: boolean;
}

export interface RunStep extends StepBase {
	readonly kind: "run";
	readonly cmd: string;
	readonly out: readonly TerminalLine[];
	readonly failed: boolean;
}

/**
 * Any other tool call — grep, find, ls, lsp_diagnostics, web_fetch.
 *
 * The design has no card for these. They render as a READ row with the tool's
 * own name, which is honest and keeps them inside the merged tool group.
 */
export interface ToolCallStep extends StepBase {
	readonly kind: "tool";
	/** Upper-case label for the eyebrow, e.g. "GREP". */
	readonly name: string;
	/** The main argument — a pattern, a path. Empty when there is none. */
	readonly target: string;
	readonly meta: string;
	readonly failed: boolean;
}

/** One or more delegations started together. */
export interface SpawnStep extends StepBase {
	readonly kind: "spawn";
	readonly text: string;
	readonly agents: readonly Subagent[];
}

/** An advisor consult. */
export interface AdviseStep extends StepBase {
	readonly kind: "advise";
	readonly text: string;
	readonly body: readonly string[];
}

/** A workflow run started from this turn. */
export interface WfStep extends StepBase {
	readonly kind: "wf";
	/** Empty when pi's result line carried no id — a call that never started. */
	readonly runId: string;
	/** Shown when the run's own record is missing from workflow-runs/. */
	readonly name: string;
	/** pi refused the call. `error` then holds what it said. */
	readonly failed: boolean;
	readonly error: string;
}

export interface QuestionOption {
	readonly name: string;
	/** Keyboard label, "1".."9". */
	readonly key: string;
}

export interface QuestionStep extends StepBase {
	readonly kind: "question";
	readonly text: string;
	readonly meta: string;
	readonly options: readonly QuestionOption[];
	readonly answer: string | null;
}

/** One file's totals within a turn. */
export interface FileTotal {
	readonly path: string;
	readonly add: number;
	readonly del: number;
}

/** End-of-turn summary card. */
export interface DoneStep extends StepBase {
	readonly kind: "done";
	readonly add: number;
	readonly del: number;
	/** Duration of this turn in ms. 0 when pi recorded none. */
	readonly durationMs: number;
	/** The files this turn touched. The reducer already counted them. */
	readonly files: readonly FileTotal[];
}

/** pi compacted the context here. */
export interface CompactionStep extends StepBase {
	readonly kind: "compaction";
	readonly summary: string;
}

export type Step =
	| UserStep
	| TextStep
	| ThinkStep
	| ReadStep
	| EditStep
	| RunStep
	| ToolCallStep
	| SpawnStep
	| AdviseStep
	| WfStep
	| QuestionStep
	| DoneStep
	| CompactionStep;

/** `Omit` collapses a union to its shared keys; this keeps every member. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A step before the store assigns its id. */
export type StepDraft = DistributiveOmit<Step, "id">;

/** The rows "merge tool calls" collapses into one summary line. */
export function isToolStep(step: Step): step is ReadStep | EditStep | RunStep | ToolCallStep {
	return step.kind === "read" || step.kind === "edit" || step.kind === "run" || step.kind === "tool";
}

/* ── diffs ─────────────────────────────────────────────────────────────── */

/**
 * `hdr` heads a file; the rest are body lines.
 *
 * There are no line numbers: pi records the text an edit replaced, not where
 * in the file it sat.
 */
export type DiffLineKind = "hdr" | "add" | "del" | "ctx";

export interface DiffLine {
	readonly kind: DiffLineKind;
	/** Content without the leading +/-/space marker. */
	readonly text: string;
}

export interface DiffFile {
	readonly path: string;
	readonly add: number;
	readonly del: number;
	readonly hunks: readonly DiffLine[];
}

/* ── terminal ──────────────────────────────────────────────────────────── */

export type TerminalLineKind = "cmd" | "out" | "pass" | "err" | "dim";

export interface TerminalLine {
	readonly kind: TerminalLineKind;
	readonly text: string;
}

/* ── subagents and workflows ───────────────────────────────────────────── */

export type SubagentStatus = "running" | "done" | "failed";

export interface Subagent {
	readonly id: string;
	readonly name: string;
	readonly task: string;
	readonly status: SubagentStatus;
	readonly model: string;
	/**
	 * 0..100, or null when pi reports no fraction. A plain delegation has no
	 * progress signal, so the bar stays empty rather than inventing one.
	 */
	readonly percent: number | null;
}

export type WorkflowStatus = "created" | "running" | "done" | "cancelled" | "error";

export interface WorkflowRun {
	readonly id: string;
	/** The workflow's own name, e.g. "review-and-ship". */
	readonly name: string;
	/** The session that started the run. Empty for a run pi started outside one. */
	readonly sessionId: string;
	readonly cwd: string;
	readonly status: WorkflowStatus;
	readonly updatedAt: number;
	readonly agentCount: number;
	readonly totalTokens: number;
	readonly costUsd: number;
	/** Empty until the run starts agents: pi writes a phase only as it opens. */
	readonly phases: readonly WorkflowPhase[];
}

export interface WorkflowPhase {
	readonly name: string;
	readonly agents: readonly Subagent[];
}

/* ── commands ──────────────────────────────────────────────────────────── */

/**
 * What can be typed after a slash, as pi's `get_commands` reports it.
 *
 * pi leaves its own TUI commands (`/settings`, `/hotkeys`) out of that list on
 * purpose: they are handled by the terminal interface and would not run over
 * RPC. So this list is everything a slash can name here, and nothing else.
 */
export type CommandSource = "extension" | "prompt" | "skill";

export interface PiCommand {
	/** No leading slash. A skill keeps pi's own `skill:` prefix — that is what runs. */
	readonly name: string;
	readonly description: string;
	readonly source: CommandSource;
	/** "user", "project" or "temporary". Empty when pi recorded none. */
	readonly scope: string;
}

/* ── skills ────────────────────────────────────────────────────────────── */

/**
 * What a skill costs the prompt, and what it takes to reach it.
 *
 * The first four are the `skill-loading` extension's own, in the order they
 * cost from most to least, and they live in its preferences file. "off" is not
 * one of them and must never be written there — that extension drops a mode it
 * does not know, and the skill falls back to being fully listed.
 *
 * "off" is pi core's, and a different file: an `!<name>` entry in the `skills`
 * array of `settings.json` stops pi loading the skill at all, so it is in no
 * prompt and has no `/skill:` command either.
 */
export const LOADING_MODES = ["preload", "name", "brief", "command"] as const;
export type LoadingMode = (typeof LOADING_MODES)[number];

export const SKILL_MODES = [...LOADING_MODES, "off"] as const;
export type SkillMode = (typeof SKILL_MODES)[number];

export function isLoadingMode(value: unknown): value is LoadingMode {
	return typeof value === "string" && (LOADING_MODES as readonly string[]).includes(value);
}

export const SKILL_MODE_LABEL: Record<SkillMode, string> = {
	preload: "Preloaded",
	name: "On",
	brief: "Name only",
	command: "When asked",
	off: "Off",
};

export const SKILL_MODE_HELP: Record<SkillMode, string> = {
	preload: "Listed, and its whole body is already in the prompt. Costs the most, saves a round trip.",
	name: "Name, description and path. pi's own default, and what a skill costs unless you say otherwise.",
	brief: "Name and path, without the description — most of what an entry costs. For a skill whose name says enough.",
	command: "Hidden from the prompt and costs nothing. You can still run it yourself with /skill:<name>.",
	off: "Not loaded at all: no prompt entry, and no /skill: command either.",
};

export function isSkillMode(value: unknown): value is SkillMode {
	return typeof value === "string" && (SKILL_MODES as readonly string[]).includes(value);
}

export interface Skill {
	/** As pi names it — no `skill:` prefix, which is the command's, not the skill's. */
	readonly name: string;
	readonly description: string;
	/** The SKILL.md it was read from. */
	readonly path: string;
	/** "user" or "project". */
	readonly scope: string;
	readonly mode: SkillMode;
	/** True when no rule names this skill and it fell back to the default. */
	readonly inherited: boolean;
}

export interface SkillList {
	readonly skills: readonly Skill[];
	/** The mode for anything no rule matches. */
	readonly fallback: SkillMode;
	/** False when the whole skill-loading extension is switched off. */
	readonly enabled: boolean;
	/** Where the modes are kept, so the panel can say. */
	readonly store: string;
}

/* ── settings and preferences ──────────────────────────────────────────── */

/** pi's own seven levels. The design drew six. */
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export function isThinkingLevel(value: string): value is ThinkingLevel {
	return (THINKING_LEVELS as readonly string[]).includes(value);
}

/**
 * One model pi is configured for.
 *
 * A model is named by its provider *and* its id: two providers can offer the
 * same id — this machine has `deepseek-v4-flash` under both `deepseek` and
 * `opencode-go` — so the id alone does not say who bills for it.
 */
export interface PiModel {
	readonly id: string;
	/** The provider's display name for it, or the id when it gives none. */
	readonly name: string;
	readonly provider: string;
	/** Whether the model has thinking levels beyond "off". */
	readonly reasoning: boolean;
	/** Null when the model states no context window. */
	readonly contextWindow: number | null;
}

/** `provider/id` — how pi's own `--model` flag and settings name a model. */
export function modelRef(provider: string, id: string): string {
	return provider && id ? `${provider}/${id}` : "";
}

/**
 * A model named by the job it does rather than by who serves it.
 *
 * `models.providers.<profile>` in pi's settings maps names of the user's own
 * choosing — `session`, `frontier`, `fast`, `cheap` — onto real references, and
 * `/provider` moves the whole profile at once. Settings that name a role follow
 * that switch; settings that name a model stay behind on the old provider.
 */
export interface ModelRole {
	readonly name: string;
	/** What the profile maps it to: `provider/id`, and maybe `:level`. */
	readonly ref: string;
}

/** One combination: a model for every job, under a name of the user's choosing. */
export interface ModelProfile {
	readonly name: string;
	readonly roles: readonly ModelRole[];
}

/**
 * A model reference back into its parts.
 *
 * The provider is what stands before the *first* slash, because an id may hold
 * slashes of its own — OpenRouter's are `deepseek/deepseek-chat`. The trailing
 * `:level` is only a level when pi has one by that name, which is what leaves
 * an id like `deepseek-chat:free` alone.
 */
export function parseRef(ref: string): { provider: string; id: string; level: ThinkingLevel | null } {
	const slash = ref.indexOf("/");
	if (slash < 1) return { provider: "", id: "", level: null };

	const provider = ref.slice(0, slash);
	const rest = ref.slice(slash + 1);
	const colon = rest.lastIndexOf(":");
	const tail = colon > 0 ? rest.slice(colon + 1) : "";

	return isThinkingLevel(tail)
		? { provider, id: rest.slice(0, colon), level: tail }
		: { provider, id: rest, level: null };
}

/** The roles of the profile in force, or none when no profile is. */
export function activeRoles(settings: Pick<PiSettings, "modelProfile" | "modelProfiles"> | null): readonly ModelRole[] {
	return settings?.modelProfiles.find((profile) => profile.name === settings.modelProfile)?.roles ?? [];
}

export interface PiSettings {
	readonly defaultProvider: string;
	readonly defaultModel: string;
	readonly defaultThinkingLevel: ThinkingLevel;
	readonly permissionMode: string;
	/** Counts only — the patterns themselves are the user's business. */
	readonly allowRules: number;
	readonly denyRules: number;
	readonly askRules: number;
	/** settings.advisor.model, or null when the advisor is not configured. */
	readonly advisorModel: string | null;
	/** Which profile of `models.providers` is in force. Empty when none is. */
	readonly modelProfile: string;
	/** Every profile the file defines, in the order it lists them. */
	readonly modelProfiles: readonly ModelProfile[];
	readonly agentDir: string;
	/** pi's version, or null when its CLI was not found. */
	readonly piVersion: string | null;
}

/** `auto` is macOS's own appearance; the other two override it. */
export type Theme = "night" | "day" | "auto";

export type InspectorTab = "diff" | "agents" | "term" | "flow";

export interface Preferences {
	readonly theme: Theme;
	readonly inspectorOpen: boolean;
	readonly inspectorWide: boolean;
	/** Collapse consecutive tool rows into one summary line. */
	readonly mergeToolCalls: boolean;
	/** Show pi's reasoning rows. Off: the transcript is what pi did, not what it weighed. */
	readonly showThinking: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
	theme: "auto",
	inspectorOpen: true,
	inspectorWide: false,
	mergeToolCalls: true,
	showThinking: false,
};

/* ── errors ────────────────────────────────────────────────────────────── */

/** Both processes turn a caught value into a sentence the same way. */
export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
