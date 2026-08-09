/**
 * An integration test against a real pi installation.
 *
 * Like `sessions.live.test.ts`, it skips itself when there is no agent
 * directory and asserts invariants only — never counts or names.
 */

import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { WorkflowRun } from "@shared/model";
import { workflowRunsDir } from "./agent-dir";
import { scanSessions } from "./sessions";
import { readWorkflowRuns } from "./workflows";

const hasStore = existsSync(workflowRunsDir());

describe.skipIf(!hasStore)("readWorkflowRuns, against the real workflow-run store", () => {
	let runs: WorkflowRun[];
	beforeAll(async () => {
		runs = await readWorkflowRuns();
	});

	it("gives every run a unique id, newest first", () => {
		const ids = runs.map((r) => r.id);
		expect(ids.every((id) => id !== "")).toBe(true);
		expect(new Set(ids).size).toBe(ids.length);

		const times = runs.map((r) => r.updatedAt);
		expect([...times].sort((a, b) => b - a)).toEqual(times);
	});

	it("binds a run to a session the scanner also found", async () => {
		const bound = runs.filter((r) => r.sessionId !== "");
		if (bound.length === 0) return; // Only template runs on this machine.

		const known = new Set((await scanSessions()).sessions.map((s) => s.id));
		// A session pi has since deleted keeps its runs, so this asserts that
		// the ids are the same id space, not that every run still has a session.
		expect(bound.some((run) => known.has(run.sessionId))).toBe(true);
	});

	it("reads a phase only with the agents that ran in it", () => {
		for (const run of runs) {
			for (const phase of run.phases) {
				expect(phase.name).not.toBe("");
				for (const agent of phase.agents) {
					expect(agent.id).not.toBe("");
					expect(agent.name).not.toBe("");
				}
			}
		}
	});
});
