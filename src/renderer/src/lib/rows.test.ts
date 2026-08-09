import { describe, expect, it } from "vitest";
import type { Step } from "@shared/model";
import { buildRows, summariseGroup } from "./rows";

const steps: Step[] = [
	{ id: "0", kind: "user", text: "go" },
	{ id: "1", kind: "read", file: "a.ts", meta: "10 lines", failed: false },
	{ id: "2", kind: "edit", file: "a.ts", add: 4, del: 1, diff: [], failed: false },
	{ id: "3", kind: "run", cmd: "pnpm test", failed: false, out: [] },
	{ id: "4", kind: "text", text: "done", streaming: false },
	{ id: "5", kind: "read", file: "b.ts", meta: "", failed: false },
];

describe("buildRows", () => {
	it("collapses a run of tool steps into one group", () => {
		const rows = buildRows(steps, true, true);
		expect(rows.map((r) => r.type)).toEqual(["step", "group", "step", "step"]);
		const group = rows[1];
		expect(group?.type === "group" && group.items).toHaveLength(3);
	});

	it("keys the group on its first step so it survives a re-render", () => {
		const group = buildRows(steps, true, true)[1];
		expect(group?.type === "group" && group.key).toBe("1");
	});

	it("leaves a lone tool step ungrouped", () => {
		const rows = buildRows(steps, true, true);
		expect(rows[3]).toMatchObject({ type: "step" });
	});

	it("returns one row per step when merging is off", () => {
		expect(buildRows(steps, false, true)).toHaveLength(steps.length);
	});

	it("handles an empty transcript", () => {
		expect(buildRows([], true, true)).toEqual([]);
	});

	it("drops thinking, and joins the work it was standing between", () => {
		const thought: Step[] = [
			{ id: "0", kind: "read", file: "a.ts", meta: "", failed: false },
			{ id: "1", kind: "think", text: "Thinking", meta: "", body: [] },
			{ id: "2", kind: "read", file: "b.ts", meta: "", failed: false },
		];
		expect(buildRows(thought, true, true).map((r) => r.type)).toEqual(["step", "step", "step"]);

		const hidden = buildRows(thought, true, false);
		expect(hidden.map((r) => r.type)).toEqual(["group"]);
		expect(hidden[0]?.type === "group" && hidden[0].items).toHaveLength(2);
	});
});

describe("summariseGroup", () => {
	it("names each kind and totals the edits", () => {
		const group = buildRows(steps, true, true)[1];
		if (group?.type !== "group") throw new Error("expected a group");
		expect(summariseGroup(group.items)).toEqual({
			count: "3 STEPS",
			text: "Read 1 file · Edited 1 file · Ran 1 command",
			add: 4,
			del: 1,
			hasDiff: true,
		});
	});

	it("hides the diff totals when nothing was edited", () => {
		const reads: Step[] = [
			{ id: "a", kind: "read", file: "a.ts", meta: "", failed: false },
			{ id: "b", kind: "read", file: "b.ts", meta: "", failed: false },
		];
		const group = buildRows(reads, true, true)[0];
		if (group?.type !== "group") throw new Error("expected a group");
		expect(summariseGroup(group.items)).toMatchObject({ text: "Read 2 files", hasDiff: false });
	});
});
