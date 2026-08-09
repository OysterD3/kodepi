/**
 * Diffs for pi's `edit` and `write` tool calls.
 *
 * pi's edit result carries no patch. The call carries
 * `arguments.edits[] = { oldText, newText }`, so the diff has to be computed
 * from those pairs. There are no absolute line numbers to be had either: pi
 * records the replaced text, not where in the file it sits.
 */

import type { DiffLine } from "@shared/model";

export interface EditPair {
	readonly oldText: string;
	readonly newText: string;
}

function lines(text: string): string[] {
	if (text === "") return [];
	const out = text.split("\n");
	// A trailing newline produces an empty last element that is not a line.
	if (out.length > 1 && out[out.length - 1] === "") out.pop();
	return out;
}

/**
 * Longest common subsequence over lines.
 *
 * Guarded by area: an edit that replaces a whole large file would otherwise
 * cost O(n·m) cells. Past the guard the pair is reported as a plain
 * delete-then-add block, which is what a full rewrite is anyway. Real edits
 * come nowhere near it — the largest table measured on a real session was 200
 * cells.
 */
const MAX_LCS_CELLS = 1_000_000;

function lcsLengths(a: readonly string[], b: readonly string[]): Uint32Array {
	const w = b.length + 1;
	const table = new Uint32Array((a.length + 1) * w);
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			table[i * w + j] =
				a[i] === b[j] ? (table[(i + 1) * w + j + 1] ?? 0) + 1 : Math.max(table[(i + 1) * w + j] ?? 0, table[i * w + j + 1] ?? 0);
		}
	}
	return table;
}

/** Line diff of one replacement, appended to `out`. */
function appendDiff(out: DiffLine[], oldText: string, newText: string): void {
	const a = lines(oldText);
	const b = lines(newText);

	if ((a.length + 1) * (b.length + 1) > MAX_LCS_CELLS) {
		for (const text of a) out.push({ kind: "del", text });
		for (const text of b) out.push({ kind: "add", text });
		return;
	}

	const w = b.length + 1;
	const table = lcsLengths(a, b);
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			out.push({ kind: "ctx", text: a[i] ?? "" });
			i++;
			j++;
		} else if ((table[(i + 1) * w + j] ?? 0) >= (table[i * w + j + 1] ?? 0)) {
			out.push({ kind: "del", text: a[i] ?? "" });
			i++;
		} else {
			out.push({ kind: "add", text: b[j] ?? "" });
			j++;
		}
	}
	while (i < a.length) out.push({ kind: "del", text: a[i++] ?? "" });
	while (j < b.length) out.push({ kind: "add", text: b[j++] ?? "" });
}

export function diffLines(oldText: string, newText: string): DiffLine[] {
	const out: DiffLine[] = [];
	appendDiff(out, oldText, newText);
	return out;
}

export interface EditDiff {
	readonly lines: DiffLine[];
	readonly add: number;
	readonly del: number;
}

function tally(lines: readonly DiffLine[]): EditDiff {
	let add = 0;
	let del = 0;
	for (const line of lines) {
		if (line.kind === "add") add++;
		else if (line.kind === "del") del++;
	}
	return { lines: [...lines], add, del };
}

/** Every replacement in one `edit` call, in order. */
export function diffEdits(edits: readonly EditPair[]): EditDiff {
	const all: DiffLine[] = [];
	for (const edit of edits) appendDiff(all, edit.oldText, edit.newText);
	return tally(all);
}

/** A `write` call replaces the whole file, so every line is an addition. */
export function diffWrite(content: string): EditDiff {
	const all = lines(content).map<DiffLine>((text) => ({ kind: "add", text }));
	return { lines: all, add: all.length, del: 0 };
}

/** Read `arguments.edits` off a tool call, tolerating a shape we did not expect. */
export function readEditPairs(args: Record<string, unknown> | undefined): EditPair[] {
	const raw = args?.["edits"];
	if (!Array.isArray(raw)) return [];
	const pairs: EditPair[] = [];
	for (const item of raw) {
		if (typeof item !== "object" || item === null) continue;
		const { oldText, newText } = item as { oldText?: unknown; newText?: unknown };
		pairs.push({
			oldText: typeof oldText === "string" ? oldText : "",
			newText: typeof newText === "string" ? newText : "",
		});
	}
	return pairs;
}

/** Trim a diff for the inline preview under an EDIT card. */
export function previewLines(all: readonly DiffLine[], limit = 40): DiffLine[] {
	if (all.length <= limit) return [...all];
	return [...all.slice(0, limit), { kind: "ctx", text: `… ${all.length - limit} more lines` }];
}
