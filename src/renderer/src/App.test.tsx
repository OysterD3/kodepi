/**
 * Render smoke tests.
 *
 * There is no jsdom here: components are rendered with `react-dom/server` and
 * asserted on their markup. That catches what actually breaks in this app — a
 * crash on an empty session, a missing class the CSS keys off, an empty state
 * that never appears.
 *
 * The bridge is stubbed. What it returns is checked for real in
 * `src/main/pi/transcript.test.ts`, against a genuine pi recording.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PiApi } from "@shared/ipc";
import type { PiCommand, PiModel, PiSettings, Project, Session, SessionSummary, ThinkingLevel, WorkflowRun } from "@shared/model";
import { THINKING_LEVELS } from "@shared/model";

const project: Project = { id: "/code/checkout-web", name: "checkout-web", sessionIds: ["s1", "s2"] };

const summaries: SessionSummary[] = [
	{ id: "s1", title: "Fix cart total rounding drift", status: "done", modified: Date.now() },
	{ id: "s2", title: "A turn that failed", status: "error", modified: Date.now() - 172_800_000 },
];

const session: Session = {
	id: "s1",
	title: "Fix cart total rounding drift",
	cwd: project.id,
	status: "done",
	model: "gpt-5.6-sol",
	provider: "openai-codex",
	thinkingLevel: "max",
	elapsedMs: 281_000,
	modified: Date.now(),
	activity: null,
	branch: "fix/cart-rounding",
	usage: { contextTokens: 68_000, totalTokens: 125_000, costUsd: 0.36, contextWindow: 272_000 },
	steps: [
		{ id: "s0", kind: "user", text: "Cart totals drift by a cent." },
		{ id: "s1", kind: "think", text: "Thinking", meta: "2 blocks", body: ["one", "two"] },
		{ id: "s2", kind: "read", file: "src/lib/money.ts", meta: "88 lines", failed: false },
		{ id: "s3", kind: "edit", file: "src/lib/money.ts", add: 2, del: 1, diff: [{ kind: "add", text: "x" }], failed: false },
		{ id: "s4", kind: "run", cmd: "pnpm vitest", failed: false, out: [{ kind: "out", text: "ok" }] },
		{ id: "s5", kind: "tool", name: "GREP", target: "toFixed", meta: "", failed: false },
		{ id: "s6", kind: "advise", text: "Consulted", body: ["advice"] },
		{ id: "s7", kind: "wf", runId: "wf-1", name: "ship-it", failed: false, error: "" },
		{ id: "s8", kind: "question", text: "Which locale?", meta: "", options: [{ name: "en-US only", key: "1" }], answer: "en-US only" },
		{ id: "s9", kind: "compaction", summary: "## Project state" },
		{ id: "s10", kind: "text", text: "Money is now `minor units`.", streaming: false },
		{ id: "s11", kind: "done", add: 2, del: 1, durationMs: 281_000, files: [{ path: "src/lib/money.ts", add: 2, del: 1 }] },
	],
	files: [
		{
			path: "src/lib/money.ts",
			add: 2,
			del: 1,
			hunks: [
				{ kind: "hdr", text: "@@ src/lib/money.ts @@" },
				{ kind: "add", text: "const x = 1;" },
			],
		},
	],
	agents: [],
	terminal: [{ kind: "cmd", text: "pnpm vitest" }],
};

const settings: PiSettings = {
	defaultProvider: "openai-codex",
	defaultModel: "gpt-5.6-sol",
	defaultThinkingLevel: "max",
	permissionMode: "auto",
	allowRules: 12,
	denyRules: 13,
	askRules: 0,
	advisorModel: "frontier",
	agentDir: "/home/me/.pi/agent",
	piVersion: "0.84.1",
};

/** Two providers offering one id, which is why a model is named by both. */
const models: PiModel[] = [
	{ id: "gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "openai-codex", reasoning: true, contextWindow: 272000 },
	{ id: "claude-opus-5", name: "Claude Opus 5", provider: "anthropic", reasoning: true, contextWindow: 1000000 },
	{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "deepseek", reasoning: true, contextWindow: 1000000 },
	{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash (2x usage)", provider: "opencode-go", reasoning: true, contextWindow: 1000000 },
];

const workflows: WorkflowRun[] = [
	{ id: "wf-1", name: "review-and-ship", sessionId: "s1", cwd: project.id, status: "cancelled", updatedAt: 2, agentCount: 0, totalTokens: 0, costUsd: 0, phases: [] },
	// A template run pi started outside any session: it belongs to no session.
	{ id: "tpl-1", name: "nightly", sessionId: "", cwd: project.id, status: "done", updatedAt: 1, agentCount: 0, totalTokens: 0, costUsd: 0, phases: [] },
];

const stub: PiApi = {
	scan: async () => ({ projects: [project], sessions: summaries }),
	openSession: async () => session,
	settings: async () => settings,
	workflows: async () => workflows,
	revealAgentDir: async () => undefined,
	skills: async () => ({ skills: [], fallback: "name" as const, enabled: true, store: "/home/me/.config/pi/skill-loading.json" }),
	setSkillMode: async () => undefined,
	models: async () => models,
	setDefaultModel: async () => undefined,
	setDefaultThinkingLevel: async () => undefined,
	// No native dialog under the test bridge; the directory is set directly.
	chooseDirectory: async () => null,
	branchOf: async () => "main",
	// There is no pty under `react-dom/server`; the terminal tab is asserted on
	// its markup, not on a shell.
	startShell: async () => undefined,
	writeShell: async () => undefined,
	resizeShell: async () => undefined,
	onShellData: () => () => undefined,
	onShellExit: () => () => undefined,
	// No pi is spawned under the test bridge; a started session stays empty.
	startAgent: async () => undefined,
	resumeAgent: async () => undefined,
	promptAgent: async () => undefined,
	abortAgent: async () => undefined,
	setThinkingLevel: async () => undefined,
	onAgentSession: () => () => undefined,
	onAgentStatus: () => () => undefined,
	onAgentNotice: () => () => undefined,
	onAgentCommands: () => () => undefined,
	onAgentThinking: () => () => undefined,
	onAgentExit: () => () => undefined,
};

function useBridge(api: Partial<PiApi>): void {
	(globalThis as { window?: unknown }).window = { api: { ...stub, ...api } };
}

beforeAll(() => {
	useBridge({});
});

// Imported after the stub exists: lib/api.ts reads window at call time, but
// this keeps the order obvious.
const { App } = await import("./App");
const { actions, appearance, currentSession, getState, sessionCommands, sessionLevels } = await import("./lib/store");

function render(): string {
	return renderToStaticMarkup(<App />);
}

beforeEach(async () => {
	useBridge({});
	actions.closePalette();
	actions.closeSettings();
	await actions.load();
});

describe("App", () => {
	it("draws the shell and the rail once the scan lands", () => {
		const html = render();
		expect(html).toContain("titlebar");
		expect(html).toContain("checkout-web");
		expect(html).toContain("Fix cart total rounding drift");
	});

	it("never emits a NaN or an undefined width", () => {
		const html = render();
		expect(html).not.toMatch(/NaN/);
		expect(html).not.toMatch(/width:\s*undefined/);
	});

	it("renders every step kind the reducer can produce", () => {
		// The tool rows are inside a merged group until merging is off, and
		// thinking is not drawn at all until it is asked for.
		actions.toggleMerge();
		actions.toggleThinking();
		const html = render();
		actions.toggleThinking();
		actions.toggleMerge();
		for (const label of ["YOU", "THINKING", "READ", "EDIT", "RUN", "GREP", "ADVISOR", "QUESTION", "COMPACTED"]) {
			expect(html).toContain(label);
		}
	});

	it("leaves pi's thinking out of the transcript until it is switched on", () => {
		expect(render()).not.toContain("THINKING");
		actions.toggleThinking();
		expect(render()).toContain("THINKING");
		actions.toggleThinking();
	});

	it("folds a command's output away, and says how much is there", () => {
		// The tool rows are inside a merged group until merging is off.
		actions.toggleMerge();
		const html = render();
		actions.toggleMerge();
		expect(html).toContain("1 line");
		expect(html).not.toContain("run__body");
	});

	it("reports what pi recorded, and says what it cannot change", () => {
		const html = render();
		expect(html).toContain("gpt-5.6-sol");
		expect(html).toContain("Max effort");
		expect(html).toContain("fix/cart-rounding");
		expect(html).toContain("This session was read from disk");
	});

	it("starts a live session from a project, and opens the composer for it", async () => {
		await actions.newSession(project.id);
		const html = render();

		expect(getState().sessionId).toMatch(/^draft-/);
		expect(html).toContain("New session");
		expect(html).toContain("Ask pi.");
		expect(html).not.toContain("This session was read from disk");

		// pi's own recording replaces the placeholder, id and all.
		const draftId = getState().sessionId ?? "";
		actions.receiveSession(draftId, { ...session, id: "live-1", title: "Live one", cwd: project.id });
		expect(getState().sessionId).toBe("live-1");
		expect(getState().sessions["draft-1"]).toBeUndefined();
		expect(getState().live["live-1"]).toBe(draftId);
		expect(render()).toContain("Ask pi.");

		await actions.load();
	});

	it("keeps a live session's slash commands when pi renames the session", async () => {
		const usage: PiCommand = { name: "usage", description: "Show what this session has cost", source: "extension", scope: "user" };

		await actions.newSession(project.id);
		const draftId = getState().sessionId ?? "";
		// They arrive before pi has a session id of its own, and must survive it.
		actions.receiveCommands(draftId, [usage]);
		expect(sessionCommands(getState())).toEqual([usage]);

		actions.receiveSession(draftId, { ...session, id: "live-2", cwd: project.id });
		expect(sessionCommands(getState())).toEqual([usage]);

		// A session read off disk has no pi, so it can run nothing.
		await actions.load();
		expect(sessionCommands(getState())).toEqual([]);
	});

	it("keeps talking to the same pi after it has renamed the session", async () => {
		await actions.newSession(project.id);
		const draftId = getState().sessionId ?? "";
		actions.receiveSession(draftId, { ...session, id: "live-3", cwd: project.id });

		// The draft's own key must not survive the rename: `keyOf` walks this
		// map, and a leftover would answer for every later event and name a
		// session that has been deleted.
		expect(getState().live[draftId]).toBeUndefined();
		expect(getState().live["live-3"]).toBe(draftId);

		// So pi's own reports still land on the session it renamed.
		actions.receiveThinking(draftId, "low", ["off", "low", "high"]);
		expect(currentSession(getState())?.thinkingLevel).toBe("low");
		actions.receiveStatus(draftId, true);
		expect(currentSession(getState())?.activity).toBe("Working");

		// And when pi goes, the session is a recording again rather than a
		// composer pointed at a process that is not there.
		actions.receiveExit(draftId);
		expect(getState().live["live-3"]).toBeUndefined();
		expect(render()).toContain("Continue this session");

		await actions.load();
	});

	it("sets the thinking level on a live pi, and lets pi settle where it lands", async () => {
		const sent: [string, ThinkingLevel][] = [];
		const offered: ThinkingLevel[] = ["off", "low", "medium", "high"];
		useBridge({
			setThinkingLevel: async (draftId, level) => {
				sent.push([draftId, level]);
			},
		});

		await actions.newSession(project.id);
		const sessionId = getState().sessionId ?? "";

		// The slider stays a report until pi says what its model will take.
		expect(sessionLevels(getState())).toEqual([]);
		actions.receiveThinking(sessionId, "medium", offered);
		expect(sessionLevels(getState())).toEqual(offered);
		expect(currentSession(getState())?.thinkingLevel).toBe("medium");

		// The chip moves first, so the slider follows the hand that drags it.
		actions.setThinkingLevel(sessionId, "high");
		expect(currentSession(getState())?.thinkingLevel).toBe("high");
		expect(sent).toEqual([[sessionId, "high"]]);

		// pi is the authority: what it reports back wins, refusal or not.
		actions.receiveThinking(sessionId, "medium", offered);
		expect(currentSession(getState())?.thinkingLevel).toBe("medium");

		// A session read off disk has no pi, so there is nothing to set.
		useBridge({});
		await actions.load();
		expect(sessionLevels(getState())).toEqual([]);
	});

	// Only s1, and only ever made live — there is no way to detach a pi, so a
	// second session would be left live for every test after this one.
	it("continues a session that was read off disk, keeping its id", async () => {
		// The way in is offered, and the composer stays shut until it is taken.
		expect(getState().sessionId).toBe("s1");
		expect(render()).toContain("Continue this session");
		expect(getState().live["s1"]).toBeUndefined();

		// pi would not start, so the row stays a recording and says why.
		useBridge({ resumeAgent: () => Promise.reject(new Error("that project's directory is gone")) });
		await actions.resumeSession("s1");
		expect(getState().live["s1"]).toBeUndefined();
		expect(render()).toContain("that project&#x27;s directory is gone");

		const asked: string[] = [];
		useBridge({
			resumeAgent: async (sessionId) => {
				asked.push(sessionId);
			},
		});
		await actions.resumeSession("s1");

		// pi keeps the session's own id, so it is its own handle and nothing
		// has to be renamed the way a fresh draft is.
		expect(asked).toEqual(["s1"]);
		expect(getState().live["s1"]).toBe("s1");

		const html = render();
		expect(html).toContain("Ask pi.");
		expect(html).not.toContain("Continue this session");

		useBridge({});
	});

	it("shows the real context meter and labels the cost as an estimate", () => {
		const html = render();
		expect(html).toContain("Context");
		expect(html).toContain("68.0k / 272.0k");
		expect(html).toContain("pi&#x27;s own estimate, not a bill");
	});

	it("summarises a finished turn from the files the reducer counted", () => {
		const html = render();
		expect(html).toContain("CHANGED FILES (1)");
		expect(html).toContain("4m 41s");
	});

	it("lists the changed files with the honest note about line numbers", () => {
		actions.setTab("diff");
		const html = render();
		expect(html).toContain("src/lib/money.ts");
		expect(html).toContain("these hunks carry no file line numbers");
	});

	it("shows the no-subagents empty state rather than an empty list", () => {
		actions.setTab("agents");
		expect(render()).toContain("NO SUBAGENTS");
	});

	it("gives the terminal tab a host for the shell to draw into", () => {
		actions.setTab("term");
		expect(render()).toContain("term__host");
	});

	it("lists only the runs the open session started", () => {
		actions.setTab("flow");
		const html = render();
		expect(html).toContain("review-and-ship");
		expect(html).not.toContain("nightly");
		expect(html).toContain("NO PHASES RECORDED");
	});

	it("follows the macOS appearance until the user overrides it", () => {
		// Starts on the system, and repaints when the system changes.
		expect(getState().prefs.theme).toBe("auto");
		actions.receiveAppearance(false);
		expect(appearance(getState())).toBe("day");
		actions.receiveAppearance(true);
		expect(appearance(getState())).toBe("night");

		// An override ignores macOS entirely.
		actions.cycleTheme();
		expect(getState().prefs.theme).toBe("night");
		actions.receiveAppearance(false);
		expect(appearance(getState())).toBe("night");

		// night → day → auto, and the system has the say again.
		actions.cycleTheme();
		actions.cycleTheme();
		expect(getState().prefs.theme).toBe("auto");
		expect(appearance(getState())).toBe("day");

		actions.receiveAppearance(true);
	});

	it("opens the new-chat page on the directory you are already in", async () => {
		await actions.openNewChat();
		const html = render();

		expect(getState().newCwd).toBe(project.id);
		expect(getState().newBranch).toBe("main");
		expect(html).toContain("What should we build?");
		expect(html).toContain("checkout-web");
		// No git writes: the box is drawn, and it is off and disabled.
		expect(html).toContain("worktree");
		expect(html).toContain("disabled");
		expect(html).not.toContain("composer__resume");

		actions.closeNewChat();
		expect(render()).not.toContain("What should we build?");
	});

	it("keeps the new-chat page, and the typed message, when pi will not start", async () => {
		const sent: string[] = [];
		useBridge({
			startAgent: () => Promise.reject(new Error("that project's directory is gone")),
			promptAgent: async (_draftId, message) => {
				sent.push(message);
			},
		});

		await actions.openSession("s1");
		const before = getState().sessionId;
		await actions.openNewChat();
		await actions.startNewChat("build the thing");

		// The page stays up so the message is not lost, and — the point — the
		// message is never sent to whichever session was open before.
		expect(getState().newChat).toBe(true);
		expect(sent).toEqual([]);
		expect(getState().sessionId).toBe(before);
		expect(render()).toContain("that project&#x27;s directory is gone");

		actions.closeNewChat();
		useBridge({});
		await actions.load();
	});

	it("collapses the inspector to the icon strip", () => {
		actions.toggleInspector();
		expect(render()).toContain("railstrip");
		actions.toggleInspector();
		expect(render()).not.toContain("railstrip");
	});

	it("renders the palette and the settings sheet on demand", () => {
		actions.openPalette();
		expect(render()).toContain("Jump to a session…");
		actions.closePalette();

		actions.openSettings();
		const html = render();
		expect(html).toContain("Settings");
		expect(html).toContain("Permissions");
	});

	it("offers pi's models, named by provider and id together", async () => {
		// The nav reaches this panel too, not only opening the sheet on it.
		actions.openSettings("about");
		actions.setSettingsSection("model");
		await actions.loadModels();

		// Shut, it reports what is set and lists nothing.
		expect(render()).not.toContain("Claude Opus 5");

		actions.toggleMenu("defmodel");
		const html = render();
		// Each row says the literal string settings.json holds, so the panel and
		// the file can never look like they disagree.
		expect(html).toContain("openai-codex/gpt-5.6-sol");
		expect(html).toContain("Claude Opus 5");
		// One id, two providers: only the pair says who bills for it, so only
		// the pair may be written.
		expect(html).toContain('data-model="deepseek/deepseek-v4-flash"');
		expect(html).toContain('data-model="opencode-go/deepseek-v4-flash"');
		// The configured one, and only that one, is marked.
		expect(html.match(/modelrow modelrow--on/g)?.length).toBe(1);
		// Each model's brand mark, read from the id rather than from whoever
		// resells it: both DeepSeek rows carry DeepSeek, not OpenCode.
		expect(html.match(/<title>DeepSeek<\/title>/g)?.length).toBe(3);
		expect(html).toContain("<title>Claude</title>");
		// The heading takes the provider's own mark, which no model of theirs
		// carries. The title is the package's own spelling, not ours.
		expect(html).toContain("<title>opencode</title>");

		actions.closeMenus();
	});

	it("draws the same thinking groove in settings as on the chat panel", async () => {
		actions.openSettings("model");
		const panel = render();
		// The settings one writes pi's file, so it is always writable — no live
		// pi is involved, and all seven levels are on the groove.
		expect(panel).toContain("effort__slider");
		expect(panel).toContain('aria-label="Thinking level"');
		expect(panel).toContain("Max effort");
		expect(panel.match(/effort__tick/g)?.length).toBe(THINKING_LEVELS.length);

		// The chip on the chat panel draws the same control from the same module.
		actions.closeSettings();
		actions.toggleMenu("effort");
		const chip = render();
		expect(chip).toContain("effort__slider");
		expect(chip.match(/effort__tick/g)?.length).toBe(THINKING_LEVELS.length);
		actions.closeMenus();
	});

	it("asks pi for its models once a run", async () => {
		await actions.loadModels();

		// Answering costs a pi process, so a second visit must not spawn one.
		useBridge({
			models: () => {
				throw new Error("asked pi a second time");
			},
		});
		actions.setSettingsSection("model");
		await actions.loadModels();
		expect(getState().notice).toBeNull();

		useBridge({});
	});

	it("keeps showing a configured model pi no longer lists", async () => {
		useBridge({ settings: async () => ({ ...settings, defaultProvider: "retired", defaultModel: "old-one" }) });
		await actions.load();

		actions.openSettings("model");
		await actions.loadModels();
		actions.toggleMenu("defmodel");

		// Without a row of its own the panel would look as though nothing were
		// configured, while pi's settings said otherwise.
		const html = render();
		expect(html).toContain('data-model="retired/old-one"');
		expect(html).toContain("set in pi&#x27;s settings");
		// No brand is known for it, and the blank keeps the row lined up.
		expect(html).toContain("brand brand--none");

		actions.closeMenus();

		useBridge({});
		await actions.load();
	});

	it("merges tool rows, and un-merges when the setting is off", () => {
		expect(render()).toContain("STEPS");
		actions.toggleMerge();
		expect(render()).not.toContain("STEPS");
		actions.toggleMerge();
	});

	it("survives a bridge that fails, and offers a retry", async () => {
		useBridge({ scan: () => Promise.reject(new Error("no agent dir")) });
		await actions.load();
		const html = render();
		expect(html).toContain("Could not read pi&#x27;s sessions");
		expect(html).toContain("no agent dir");
	});

	it("clears a stale failure when the user returns to a loaded session", async () => {
		useBridge({ openSession: (id) => (id === "s2" ? Promise.reject(new Error("unknown session: s2")) : Promise.resolve(session)) });
		await actions.openSession("s2");
		expect(render()).toContain("unknown session: s2");

		// s1 is already cached, so this takes the early-return path.
		await actions.openSession("s1");
		const html = render();
		expect(html).not.toContain("unknown session: s2");
		expect(html).toContain("CHANGED FILES (1)");
	});

	it("does not carry a step's expanded state into the next session", async () => {
		// Step ids restart at s0 in every session, so they must not persist.
		actions.toggleThinking();
		actions.toggleStep("s1");
		expect(render()).toContain("THINKING");
		await actions.openSession("s2");
		await actions.openSession("s1");
		expect(getState().openSteps).toEqual({});
		actions.toggleThinking();
	});

	it("keeps the rail when only settings or workflows fail", async () => {
		useBridge({ settings: () => Promise.reject(new Error("no settings")), workflows: () => Promise.reject(new Error("no runs")) });
		await actions.load();
		const html = render();
		expect(html).not.toContain("Could not read pi&#x27;s sessions");
		expect(html).toContain("Fix cart total rounding drift");
	});

	it("opens every project, not just the newest one", async () => {
		// Each project owns one session, so the second one's title is in the
		// markup only when the second project is open.
		const newest: Project = { ...project, sessionIds: ["s1"] };
		const older: Project = { id: "/code/billing", name: "billing", sessionIds: ["s2"] };
		useBridge({ scan: async () => ({ projects: [newest, older], sessions: summaries }) });
		await actions.load();

		expect(render()).toContain("A turn that failed");

		useBridge({});
		await actions.load();
	});
});
