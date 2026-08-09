/**
 * The reducer is tested against a real pi session.
 *
 * `__fixtures__/session.jsonl` is a copy of one of this machine's own
 * recordings — it is the only way to be sure the projection survives what pi
 * actually writes. Replace it with any other session file; the assertions are
 * about shape, not about its contents.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type Entry, parseEntries, parseEntry } from "./entries";
import { reduceSession, relativise, workflowRunId } from "./transcript";

function load(): Entry[] {
	return parseEntries(readFileSync(join(__dirname, "__fixtures__/session.jsonl"), "utf8"));
}

const entries = load();
const reduced = reduceSession(entries);

describe("reduceSession, over a real recording", () => {
	it("reads the identity off the header line, not the directory name", () => {
		expect(reduced.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(reduced.cwd.startsWith("/")).toBe(true);
	});

	it("produces steps with unique ids", () => {
		expect(reduced.steps.length).toBeGreaterThan(0);
		expect(new Set(reduced.steps.map((s) => s.id)).size).toBe(reduced.steps.length);
	});

	it("keeps the transcript in file order, starting with a user turn", () => {
		expect(reduced.steps[0]?.kind).toBe("user");
	});

	it("maps pi's tools onto the design's cards", () => {
		const kinds = new Set(reduced.steps.map((s) => s.kind));
		expect(kinds.has("read")).toBe(true);
		expect(kinds.has("edit")).toBe(true);
		expect(kinds.has("run")).toBe(true);
	});

	it("computes real add and delete counts from the edit arguments", () => {
		const edits = reduced.steps.filter((s) => s.kind === "edit");
		expect(edits.length).toBeGreaterThan(0);
		expect(edits.some((s) => s.kind === "edit" && s.add + s.del > 0)).toBe(true);
	});

	it("aggregates every edited file into the diff list, once each", () => {
		expect(reduced.files.length).toBeGreaterThan(0);
		expect(new Set(reduced.files.map((f) => f.path)).size).toBe(reduced.files.length);
		for (const file of reduced.files) {
			expect(file.hunks[0]?.kind).toBe("hdr");
			expect(file.add + file.del).toBeGreaterThan(0);
		}
	});

	it("records every command in the terminal pane, newest last", () => {
		expect(reduced.terminal.some((l) => l.kind === "cmd")).toBe(true);
	});

	it("settles on a status and a model", () => {
		expect(["done", "error"]).toContain(reduced.status);
		expect(reduced.model).not.toBe("");
		expect(reduced.provider).not.toBe("");
	});

	it("titles the session from its first user turn when pi named none", () => {
		expect(reduced.title.length).toBeGreaterThan(0);
		expect(reduced.title.length).toBeLessThanOrEqual(80);
	});
});

describe("reduceSession, edge cases", () => {
	it("returns an empty transcript for an empty file", () => {
		const empty = reduceSession([]);
		expect(empty.steps).toEqual([]);
		expect(empty.status).toBe("new");
		expect(empty.title).toBe("New session");
	});

	it("skips a torn final line rather than throwing", () => {
		expect(parseEntry('{"type":"mess')).toBeNull();
		expect(parseEntry("")).toBeNull();
	});

	it("marks a turn that ended in an error", () => {
		const failed = reduceSession([
			{ type: "message", timestamp: "", message: { role: "user", content: [{ type: "text", text: "go" }] } },
			{ type: "message", timestamp: "", message: { role: "assistant", stopReason: "error", content: [] } },
		]);
		expect(failed.status).toBe("error");
	});
});

describe("workflowRunId", () => {
	it("reads the id pi writes when a run starts in the background", () => {
		expect(workflowRunId('Workflow "probe" started in the background (id: wf-0msdd9qe9-1).')).toBe("wf-0msdd9qe9-1");
	});

	it("reads the id pi writes when a run has finished", () => {
		expect(workflowRunId('Workflow "model-probe" (wf-0msdczrc2-2) finished: 3 agents, 4 turns.')).toBe("wf-0msdczrc2-2");
	});

	it("is empty when the result carries no id at all", () => {
		expect(workflowRunId("workflow script does not compile: SyntaxError")).toBe("");
	});
});

describe("relativise", () => {
	it("drops the session directory pi records on every path", () => {
		expect(relativise("/code/app/src/lib/money.ts", "/code/app")).toBe("src/lib/money.ts");
	});

	it("leaves a path outside the session alone", () => {
		expect(relativise("/etc/hosts", "/code/app")).toBe("/etc/hosts");
	});

	it("tolerates an empty path or an unknown cwd", () => {
		expect(relativise("", "/code/app")).toBe("");
		expect(relativise("/code/app/x.ts", "")).toBe("/code/app/x.ts");
	});
});

describe("usage", () => {
	it("reports the last prompt as the context, not the session's running total", () => {
		const call = (input: number, cacheRead: number) =>
			({ type: "message", timestamp: "", message: { role: "assistant", content: [], usage: { input, cacheRead } } }) as Entry;

		const reduced = reduceSession([
			call(1000, 0),
			call(4000, 1000),
			{
				type: "custom",
				customType: "usage",
				timestamp: "",
				data: { usage: { total: { input: 5000, output: 200, cacheRead: 1000, cost: 0.5 } } },
			} as Entry,
		]);

		expect(reduced.usage?.contextTokens).toBe(5000);
		expect(reduced.usage?.totalTokens).toBe(6200);
	});

	it("keeps the last real figure when a provider reports nothing", () => {
		const withUsage = { type: "message", timestamp: "", message: { role: "assistant", content: [], usage: { input: 900, cacheRead: 0 } } } as Entry;
		const without = { type: "message", timestamp: "", message: { role: "assistant", content: [] } } as Entry;
		const usage = { type: "custom", customType: "usage", timestamp: "", data: { usage: { total: { input: 900 } } } } as Entry;

		expect(reduceSession([withUsage, without, usage]).usage?.contextTokens).toBe(900);
	});
});

describe("a workflow call pi refused", () => {
	it("is marked failed and keeps what pi said, with no run to open", () => {
		const reduced = reduceSession([
			{
				type: "message",
				timestamp: "",
				message: { role: "assistant", content: [{ type: "toolCall", id: "c1", name: "workflow", arguments: { script: "..." } }] },
			} as Entry,
			{
				type: "message",
				timestamp: "",
				message: {
					role: "toolResult",
					toolCallId: "c1",
					isError: true,
					content: [{ type: "text", text: "workflow script does not compile: SyntaxError" }],
				},
			} as Entry,
		]);

		const step = reduced.steps.find((s) => s.kind === "wf");
		expect(step).toMatchObject({ failed: true, runId: "", error: "workflow script does not compile: SyntaxError" });
	});
});
