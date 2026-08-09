import type { DiffLineKind, FileTotal, WorkflowStatus } from "@shared/model";

/* ── text ──────────────────────────────────────────────────────────────── */

export interface TextPart {
	readonly code: boolean;
	readonly text: string;
}

/** Split on backticks: odd segments are inline code. */
export function splitInlineCode(text: string): TextPart[] {
	const parts: TextPart[] = [];
	String(text ?? "")
		.split("`")
		.forEach((seg, i) => {
			if (seg) parts.push({ code: i % 2 === 1, text: seg });
		});
	return parts;
}

export function plural(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}

/* ── numbers, clocks and dates ─────────────────────────────────────────── */

export function formatTokens(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

/** A run clock, e.g. "6.6s" or "4m 41s". Empty when nothing was recorded. */
export function formatDuration(milliseconds: number): string {
	if (milliseconds <= 0) return "";
	const seconds = milliseconds / 1000;
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return `${m}m ${String(s).padStart(2, "0")}s`;
}

/** A glance at how old something is, not a timestamp. */
export function formatAgo(modified: number, now: number = Date.now()): string {
	const seconds = Math.max(0, Math.round((now - modified) / 1000));
	if (seconds < 90) return "now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d`;
	return `${Math.round(days / 30)}mo`;
}

export function formatDateTime(epoch: number): string {
	return epoch ? new Date(epoch).toLocaleString() : "";
}

export function signedAdd(n: number): string {
	return `+${n}`;
}

export function signedDel(n: number): string {
	return `−${n}`;
}

/** Last path segment. `node:path` is not available in a sandboxed renderer. */
export function basename(path: string): string {
	const parts = path.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

/* ── diffs ─────────────────────────────────────────────────────────────── */

export function diffSign(kind: DiffLineKind): string {
	if (kind === "add") return "+";
	if (kind === "del") return "−";
	return " ";
}

/* ── files ─────────────────────────────────────────────────────────────── */

const EXT_TINTS: Record<string, string> = {
	ts: "#60a5fa",
	tsx: "#38bdf8",
	js: "#fbbf24",
	jsx: "#fbbf24",
	mjs: "#fbbf24",
	json: "#fbbf24",
	css: "#a78bfa",
	md: "#a1a1a1",
};

export interface ExtBadge {
	readonly ext: string;
	readonly tint: string;
}

export function fileExt(path: string): ExtBadge {
	const name = path.split("/").pop() ?? "";
	const ext = name.includes(".") ? (name.split(".").pop() ?? "") : "";
	return { ext: (ext || "?").slice(0, 3).toUpperCase(), tint: EXT_TINTS[ext] ?? "#8a8a8a" };
}

export interface TreeRow {
	readonly key: string;
	/** The key of the folder row above this one, empty at the top. */
	readonly parent: string;
	readonly folder: boolean;
	readonly name: string;
	readonly depth: number;
	/** Empty on a folder row: only a file carries a count. */
	readonly add: string;
	readonly del: string;
	readonly ext: string;
	readonly tint: string;
}

/**
 * Path segments, without the empty one a leading "/" leaves behind.
 *
 * The reducer makes paths relative to the session cwd, but a file edited
 * outside it stays absolute, and a nameless root folder is not a folder.
 */
function segments(path: string): string[] {
	return path.split("/").filter(Boolean);
}

/** Flatten a file list into folder + file rows. A folder is emitted once, before what it holds. */
export function buildTree(files: readonly FileTotal[]): TreeRow[] {
	const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

	const rows: TreeRow[] = [];
	const seen = new Set<string>();
	for (const file of sorted) {
		const segs = segments(file.path);
		segs.slice(0, -1).forEach((seg, i) => {
			const key = segs.slice(0, i + 1).join("/");
			if (seen.has(key)) return;
			seen.add(key);
			rows.push({ key, parent: segs.slice(0, i).join("/"), folder: true, name: seg, depth: i, add: "", del: "", ext: "", tint: "" });
		});
		rows.push({
			key: file.path,
			parent: segs.slice(0, -1).join("/"),
			folder: false,
			name: segs[segs.length - 1] ?? file.path,
			depth: segs.length - 1,
			add: signedAdd(file.add),
			del: signedDel(file.del),
			...fileExt(file.path),
		});
	}
	return rows;
}

/**
 * Drop every row under a collapsed folder.
 *
 * Matching is on the parent key, not on the path text: a file kept absolute
 * reads "/etc/hosts" while its folder row is "etc", so a prefix test would
 * hide the wrong rows. `buildTree` emits a folder before its contents, so one
 * pass is enough to carry the hidden state down a branch.
 */
export function visibleRows(rows: readonly TreeRow[], collapsed: ReadonlySet<string>): TreeRow[] {
	const hidden = new Set<string>();
	return rows.filter((row) => {
		if (row.parent && hidden.has(row.parent)) {
			if (row.folder) hidden.add(row.key);
			return false;
		}
		if (row.folder && collapsed.has(row.key)) hidden.add(row.key);
		return true;
	});
}

export function treePad(depth: number): string {
	return `${12 + depth * 18}px`;
}

/* ── models and workflows ──────────────────────────────────────────────── */

export function modelTint(model: string): string {
	if (model.startsWith("opus")) return "var(--violet)";
	if (model.startsWith("haiku")) return "var(--fg-2)";
	return "var(--accent)";
}

export const WORKFLOW_STATUS_COLOR: Record<WorkflowStatus, string> = {
	running: "var(--info)",
	done: "var(--ok)",
	cancelled: "var(--warn)",
	error: "var(--bad)",
	created: "var(--fg-4)",
};
