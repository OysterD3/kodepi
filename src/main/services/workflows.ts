/**
 * pi's workflow-run store.
 *
 * `~/.pi/agent/workflow-runs` holds two kinds of record:
 *
 * - A run a session started gets its own directory. `wf-…/run.json` names the
 *   `sessionId` that started it — the only place pi writes that link — and
 *   `journal.jsonl` beside it records each phase as it opens and each agent as
 *   it finishes.
 * - A run started from a template outside a session is a flat `<uuid>.json`.
 *   It carries no session and never gets as far as agents.
 *
 * Both are read: the tab shows a session its own runs, and the settings pane
 * counts the store.
 */

import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subagent, WorkflowPhase, WorkflowRun, WorkflowStatus } from "@shared/model";
import { epochMs, numberArg, stringArg } from "../pi/entries";
import { workflowRunsDir } from "./agent-dir";
import { readJson } from "./settings";

function statusOf(state: unknown): WorkflowStatus {
	switch (state) {
		case "running":
			return "running";
		case "completed":
		case "done":
			return "done";
		case "cancelled":
		case "aborted":
		case "interrupted":
			return "cancelled";
		case "error":
		case "failed":
			return "error";
		default:
			return "created";
	}
}

function agentStatus(state: unknown): Subagent["status"] {
	return state === "done" ? "done" : state === "failed" ? "failed" : "running";
}

/**
 * The phase grid, from the run's journal.
 *
 * A `phase` line is written as pi opens the phase, an `agent` line once that
 * agent stops — so a running phase is a real phase with nothing under it yet,
 * and is kept. An agent names its own phase; the last phase opened is the
 * fallback for the few lines that do not.
 */
function readJournal(text: string): WorkflowPhase[] {
	const order: string[] = [];
	const byPhase = new Map<string, Subagent[]>();
	let current = "";

	const phaseFor = (title: string): Subagent[] => {
		if (!byPhase.has(title)) {
			order.push(title);
			byPhase.set(title, []);
		}
		return byPhase.get(title) ?? [];
	};

	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		let entry: Record<string, unknown>;
		try {
			entry = JSON.parse(line) as Record<string, unknown>;
		} catch {
			continue;
		}

		if (entry["kind"] === "phase") {
			current = stringArg(entry, "title") || current;
			if (current) phaseFor(current);
		} else if (entry["kind"] === "agent") {
			const index = numberArg(entry, "index");
			phaseFor(stringArg(entry, "phase") || current || "Phase 1").push({
				id: String(index || stringArg(entry, "key")),
				name: stringArg(entry, "label") || `agent ${index}`,
				task: "",
				status: agentStatus(entry["status"]),
				model: stringArg(entry, "model"),
				percent: null,
			});
		}
	}

	return order.map((name) => ({ name, agents: byPhase.get(name) ?? [] }));
}

async function readRunDir(name: string): Promise<WorkflowRun | null> {
	const dir = join(workflowRunsDir(), name);
	const run = await readJson(join(dir, "run.json"));
	if (!run) return null;

	const usage = (run["usage"] as Record<string, unknown> | undefined) ?? {};
	const journal = await readFile(join(dir, "journal.jsonl"), "utf8").catch(() => "");

	return {
		id: stringArg(run, "runId") || name,
		name: stringArg(run, "name") || "workflow",
		sessionId: stringArg(run, "sessionId"),
		cwd: stringArg(run, "cwd"),
		status: statusOf(run["status"]),
		updatedAt: numberArg(run, "endedAt") || numberArg(run, "startedAt"),
		agentCount: numberArg(run, "agentCount"),
		totalTokens: numberArg(usage, "totalTokens"),
		costUsd: numberArg(usage, "cost"),
		phases: readJournal(journal),
	};
}

async function readTemplateRun(file: string): Promise<WorkflowRun | null> {
	const run = await readJson(join(workflowRunsDir(), file));
	if (!run) return null;

	const totals = (run["totals"] as Record<string, unknown> | undefined) ?? {};
	return {
		id: stringArg(run, "id") || file.replace(/\.json$/, ""),
		name: stringArg(run, "templateId") || "workflow",
		sessionId: "",
		cwd: stringArg(run, "cwd"),
		status: statusOf(run["state"]),
		updatedAt: epochMs(run["updatedAt"]),
		agentCount: 0,
		totalTokens: numberArg(totals, "totalTokens"),
		costUsd: numberArg(totals, "cost"),
		phases: [],
	};
}

export async function readWorkflowRuns(): Promise<WorkflowRun[]> {
	let entries: Dirent[];
	try {
		entries = await readdir(workflowRunsDir(), { withFileTypes: true });
	} catch {
		return [];
	}

	const runs = await Promise.all(
		entries.map((entry) => (entry.isDirectory() ? readRunDir(entry.name) : entry.name.endsWith(".json") ? readTemplateRun(entry.name) : null)),
	);

	return runs.filter((r): r is WorkflowRun => r !== null).sort((a, b) => b.updatedAt - a.updatedAt);
}
