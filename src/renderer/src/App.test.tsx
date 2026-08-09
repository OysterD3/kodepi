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
import type { PiSettings, Project, Session, SessionSummary, WorkflowRun } from "@shared/model";

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
	// There is no pty under `react-dom/server`; the terminal tab is asserted on
	// its markup, not on a shell.
	startShell: async () => undefined,
	writeShell: async () => undefined,
	resizeShell: async () => undefined,
	onShellData: () => () => undefined,
	onShellExit: () => () => undefined,
	// No pi is spawned under the test bridge; a started session stays empty.
	startAgent: async () => undefined,
	promptAgent: async () => undefined,
	abortAgent: async () => undefined,
	onAgentSession: () => () => undefined,
	onAgentStatus: () => () => undefined,
	onAgentNotice: () => () => undefined,
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
const { actions, getState } = await import("./lib/store");

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
