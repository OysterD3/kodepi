import type { EditStep, ReadStep, RunStep, Step, ToolCallStep } from "@shared/model";
import { isToolStep } from "@shared/model";
import { plural } from "./format";

export type ToolStep = ReadStep | EditStep | RunStep | ToolCallStep;

export interface StepRow {
	readonly type: "step";
	readonly step: Step;
	readonly index: number;
}

export interface GroupRow {
	readonly type: "group";
	/** Stable key — the id of the first step in the run. */
	readonly key: string;
	readonly items: readonly ToolStep[];
	readonly index: number;
}

export type Row = StepRow | GroupRow;

/**
 * Collapse consecutive tool steps into one summary row.
 *
 * A run of one is left alone; the summary is only worth a row when it hides
 * more than it shows.
 *
 * Thinking is dropped before the merge rather than after it, so tool steps
 * that pi only separated by a thought still read as one run of work.
 */
export function buildRows(steps: readonly Step[], merge: boolean, showThinking: boolean): Row[] {
	const visible = showThinking ? steps : steps.filter((step) => step.kind !== "think");
	if (!merge) return visible.map((step, index) => ({ type: "step", step, index }));

	const rows: Row[] = [];
	let i = 0;
	while (i < visible.length) {
		const step = visible[i];
		if (!step) break;
		if (!isToolStep(step)) {
			rows.push({ type: "step", step, index: i });
			i += 1;
			continue;
		}
		let j = i;
		const group: ToolStep[] = [];
		while (j < visible.length) {
			const next = visible[j];
			if (!next || !isToolStep(next)) break;
			group.push(next);
			j += 1;
		}
		if (group.length > 1) {
			rows.push({ type: "group", key: group[0]!.id, items: group, index: i });
		} else if (group[0]) {
			rows.push({ type: "step", step: group[0], index: i });
		}
		i = j;
	}
	return rows;
}

export interface GroupSummary {
	readonly count: string;
	readonly text: string;
	readonly add: number;
	readonly del: number;
	readonly hasDiff: boolean;
}

export function summariseGroup(items: readonly ToolStep[]): GroupSummary {
	const reads = items.filter((s) => s.kind === "read").length;
	const edits = items.filter((s): s is EditStep => s.kind === "edit");
	const runs = items.filter((s) => s.kind === "run").length;
	const others = items.filter((s) => s.kind === "tool").length;

	const bits: string[] = [];
	if (reads) bits.push(`Read ${plural(reads, "file", "files")}`);
	if (edits.length) bits.push(`Edited ${plural(edits.length, "file", "files")}`);
	if (runs) bits.push(`Ran ${plural(runs, "command", "commands")}`);
	if (others) bits.push(`${plural(others, "search", "searches")}`);

	const add = edits.reduce((n, s) => n + s.add, 0);
	const del = edits.reduce((n, s) => n + s.del, 0);

	return {
		count: `${items.length} STEPS`,
		text: bits.join(" · "),
		add,
		del,
		hasDiff: add > 0 || del > 0,
	};
}
