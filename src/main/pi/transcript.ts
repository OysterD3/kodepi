/**
 * pi session entries → the transcript the renderer draws.
 *
 * A pure function over recorded output, so it can be tested against real
 * session files. It never touches the filesystem, and it formats nothing:
 * durations and timestamps cross as numbers.
 *
 * Verified against pi 0.84.1 (`session.version: 3`).
 */

import type {
	DiffFile,
	DiffLine,
	FileTotal,
	SessionStatus,
	SessionUsage,
	Step,
	StepDraft,
	Subagent,
	TerminalLine,
	ThinkingLevel,
} from "@shared/model";
import { isThinkingLevel } from "@shared/model";
import { diffEdits, diffWrite, previewLines, readEditPairs } from "./diff";
import {
	type ContentBlock,
	type Entry,
	type MessageEntry,
	type ToolCallBlock,
	epochMs,
	isCustom,
	isMessage,
	messageText,
	numberArg,
	stringArg,
	thinkingText,
} from "./entries";

/** Output lines kept per command, and in the terminal pane overall. */
const RUN_OUTPUT_LINES = 12;
const TERMINAL_LINES = 400;

/** The rail shows one line; anything longer is noise. */
const TITLE_CHARS = 80;

export interface Reduced {
	readonly id: string;
	readonly cwd: string;
	readonly title: string;
	readonly status: SessionStatus;
	readonly model: string;
	readonly provider: string;
	readonly thinkingLevel: ThinkingLevel;
	readonly steps: Step[];
	readonly files: DiffFile[];
	readonly agents: Subagent[];
	readonly terminal: TerminalLine[];
	readonly usage: SessionUsage | null;
	readonly modifiedAt: number;
	/** Sum of the turn durations pi recorded, in ms. */
	readonly elapsedMs: number;
}

/* ── policies the rail scanner shares ──────────────────────────────────── */

export function firstLine(text: string): string {
	return text.split("\n", 1)[0] ?? "";
}

/** pi's own name for the session, else its opening prompt. */
export function sessionTitle(name: string, firstUserText: string): string {
	if (name) return name;
	const line = firstLine(firstUserText).trim();
	return line ? line.slice(0, TITLE_CHARS) : "New session";
}

export function statusFromStopReason(reason: string | undefined): SessionStatus {
	return reason === "error" || reason === "aborted" ? "error" : "done";
}

/* ── helpers ───────────────────────────────────────────────────────────── */

function countLines(text: string): number {
	return text ? text.split("\n").length : 0;
}

function paragraphs(text: string): string[] {
	return text
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter(Boolean);
}

/**
 * pi records absolute paths. The transcript reads better relative to the
 * session's own directory, and the file tree cannot indent a home directory
 * it was never asked to show.
 */
export function relativise(path: string, cwd: string): string {
	if (!path) return path;
	if (cwd && path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1);
	if (path === cwd) return path.split("/").pop() ?? path;
	return path;
}

/**
 * pi writes the run id two ways: `(id: wf-…)` when a workflow starts in the
 * background, and `"name" (wf-…) finished` when it ran to completion. Both
 * ids start `wf-`, so match that rather than the sentence around it.
 */
export function workflowRunId(text: string): string {
	return /\b(wf-[\w-]+)/.exec(text)?.[1] ?? /id:\s*([\w-]+)/i.exec(text)?.[1] ?? "";
}

/* ── the reducer ───────────────────────────────────────────────────────── */

export function reduceSession(entries: readonly Entry[]): Reduced {
	// Results arrive after their calls, so index them first and emit in one pass.
	const results = new Map<string, MessageEntry>();
	for (const entry of entries) {
		if (!isMessage(entry)) continue;
		const { role, toolCallId } = entry.message;
		if (role === "toolResult" && toolCallId) results.set(toolCallId, entry);
	}

	const steps: Step[] = [];
	const terminal: TerminalLine[] = [];
	const agents: Subagent[] = [];
	const fileTotals = new Map<string, { add: number; del: number; lines: DiffLine[] }>();

	let id = "";
	let cwd = "";
	let name = "";
	let model = "";
	let provider = "";
	let thinkingLevel: ThinkingLevel = "medium";
	let usage: SessionUsage | null = null;
	let modifiedAt = 0;
	let elapsedMs = 0;
	let status: SessionStatus = "new";
	let firstUserText = "";
	/** Prompt size of the last call that reported one — the live context. */
	let contextTokens = 0;

	// Files touched since the last user turn, for the end-of-turn summary card.
	let turn = new Map<string, FileTotal>();

	let n = 0;
	const push = (draft: StepDraft): void => {
		steps.push({ ...draft, id: `s${n++}` } as Step);
	};

	const pushTerminal = (line: TerminalLine): void => {
		terminal.push(line);
		if (terminal.length > TERMINAL_LINES) terminal.shift();
	};

	const resultText = (call: ToolCallBlock): { text: string; failed: boolean } => {
		const result = results.get(call.id);
		if (!result) return { text: "", failed: false };
		return { text: messageText(result), failed: result.message.isError === true };
	};

	const recordFile = (path: string, add: number, del: number, lines: readonly DiffLine[]): void => {
		const file = fileTotals.get(path) ?? { add: 0, del: 0, lines: [{ kind: "hdr", text: `@@ ${path} @@` }] };
		file.add += add;
		file.del += del;
		for (const line of lines) file.lines.push(line);
		fileTotals.set(path, file);

		const row = turn.get(path) ?? { path, add: 0, del: 0 };
		turn.set(path, { path, add: row.add + add, del: row.del + del });
	};

	const emitToolCall = (call: ToolCallBlock): void => {
		const args = call.arguments;
		const { text, failed } = resultText(call);

		switch (call.name) {
			case "read": {
				const file = relativise(stringArg(args, "path"), cwd);
				push({ kind: "read", file, meta: failed ? firstLine(text) : `${countLines(text)} lines`, failed });
				return;
			}
			case "edit":
			case "write": {
				const file = relativise(stringArg(args, "path"), cwd);
				const diff = call.name === "edit" ? diffEdits(readEditPairs(args)) : diffWrite(stringArg(args, "content"));
				if (!failed) recordFile(file, diff.add, diff.del, diff.lines);
				push({ kind: "edit", file, add: diff.add, del: diff.del, diff: previewLines(diff.lines), failed });
				return;
			}
			case "bash":
			case "bash_output": {
				const cmd = stringArg(args, "command") || call.name;
				const out = text ? text.split("\n", RUN_OUTPUT_LINES) : [];
				const lines: TerminalLine[] = out.map((line) => ({ kind: failed ? "err" : "out", text: line }));
				push({ kind: "run", cmd, out: lines, failed });
				pushTerminal({ kind: "cmd", text: cmd });
				for (const line of lines) pushTerminal(line);
				return;
			}
			case "task": {
				const agent: Subagent = {
					id: call.id,
					name: stringArg(args, "subagent_type") || "task",
					task: stringArg(args, "description") || firstLine(stringArg(args, "prompt")),
					status: results.has(call.id) ? (failed ? "failed" : "done") : "running",
					model: "",
					// A delegation reports no fraction. The bar stays empty.
					percent: null,
				};
				agents.push(agent);
				push({ kind: "spawn", text: agent.task, agents: [agent] });
				return;
			}
			case "advisor": {
				const body = paragraphs(text);
				push({ kind: "advise", text: firstLine(body[0] ?? "") || "Consulted the advisor", body });
				return;
			}
			case "workflow": {
				push({
					kind: "wf",
					name: /"([^"]+)"/.exec(text)?.[1] ?? "workflow",
					runId: failed ? "" : workflowRunId(text),
					failed,
					// A refused call never started a run; say what pi said instead.
					error: failed ? firstLine(text) : "",
				});
				return;
			}
			case "ask_user": {
				const questions = Array.isArray(args?.["questions"]) ? (args["questions"] as unknown[]) : [];
				const first = questions[0];
				const asked = typeof first === "object" && first !== null ? (first as { question?: unknown; options?: unknown }) : {};
				const options = Array.isArray(asked.options) ? asked.options : [];
				push({
					kind: "question",
					text: typeof asked.question === "string" ? asked.question : "",
					meta: questions.length > 1 ? `${questions.length} questions` : "",
					options: options.map((option, i) => {
						const label = typeof option === "object" && option !== null ? (option as { label?: unknown }).label : option;
						return { name: typeof label === "string" ? label : String(label), key: String(i + 1) };
					}),
					// pi records the reply as the tool result, so it is already settled.
					answer: text ? firstLine(text) : null,
				});
				return;
			}
			default: {
				push({
					kind: "tool",
					name: call.name.toUpperCase(),
					target: relativise(stringArg(args, "pattern", "path", "query", "url"), cwd),
					meta: failed ? firstLine(text) : "",
					failed,
				});
			}
		}
	};

	for (const entry of entries) {
		modifiedAt = Math.max(modifiedAt, epochMs(entry.timestamp));

		switch (entry.type) {
			case "session": {
				const header = entry as { id?: string; cwd?: string };
				id = header.id ?? "";
				cwd = header.cwd ?? "";
				continue;
			}
			case "session_info": {
				name = (entry as { name?: string }).name ?? name;
				continue;
			}
			case "model_change": {
				const change = entry as { provider?: string; modelId?: string };
				provider = change.provider ?? provider;
				model = change.modelId ?? model;
				continue;
			}
			case "thinking_level_change": {
				const level = (entry as { level?: string }).level;
				if (level && isThinkingLevel(level)) thinkingLevel = level;
				continue;
			}
			case "compaction": {
				push({ kind: "compaction", summary: (entry as { summary?: string }).summary ?? "" });
				continue;
			}
			default:
				break;
		}

		if (isCustom(entry)) {
			if (entry.customType === "turn-duration") {
				const durationMs = numberArg(entry.data as Record<string, unknown> | undefined, "durationMs");
				elapsedMs += durationMs;
				const files = [...turn.values()];
				push({
					kind: "done",
					durationMs,
					files,
					add: files.reduce((sum, f) => sum + f.add, 0),
					del: files.reduce((sum, f) => sum + f.del, 0),
				});
				turn = new Map();
			} else if (entry.customType === "usage") {
				usage = readUsage(entry.data) ?? usage;
			}
			continue;
		}

		if (!isMessage(entry)) continue;
		const { role, content, stopReason } = entry.message;

		if (role === "user") {
			const text = messageText(entry);
			if (!text) continue;
			if (!firstUserText) firstUserText = text;
			push({ kind: "user", text });
			status = "done";
			turn = new Map();
			continue;
		}

		if (role !== "assistant") continue;

		if (entry.message.model) model = entry.message.model;
		if (entry.message.provider) provider = entry.message.provider;
		if (stopReason) status = statusFromStopReason(stopReason);

		// Some providers report no usage at all; keep the last figure that was
		// real rather than resetting the meter to zero.
		const call = entry.message.usage;
		const prompt = (call?.input ?? 0) + (call?.cacheRead ?? 0);
		if (prompt > 0) contextTokens = prompt;

		const thinking: string[] = [];
		for (const block of content ?? []) {
			if (block.type !== "thinking") continue;
			const text = thinkingText(block).trim();
			if (text) thinking.push(text);
		}
		if (thinking.length) {
			push({
				kind: "think",
				text: "Thinking",
				meta: thinking.length === 1 ? "1 block" : `${thinking.length} blocks`,
				body: thinking.flatMap(paragraphs),
			});
		}

		for (const block of content ?? ([] as readonly ContentBlock[])) {
			if (block.type === "text" && block.text.trim()) push({ kind: "text", text: block.text, streaming: false });
			else if (block.type === "toolCall") emitToolCall(block);
		}
	}

	const files: DiffFile[] = [...fileTotals.entries()].map(([path, file]) => ({
		path,
		add: file.add,
		del: file.del,
		hunks: file.lines,
	}));

	return {
		id,
		cwd,
		title: sessionTitle(name, firstUserText),
		status,
		model,
		provider,
		thinkingLevel,
		steps,
		files,
		agents,
		terminal,
		usage: usage ? { ...usage, contextTokens } : null,
		modifiedAt,
		elapsedMs,
	};
}

/** pi's `custom` usage entry: `{ usage: { total: { … } } }`. */
function readUsage(data: unknown): SessionUsage | null {
	if (typeof data !== "object" || data === null) return null;
	const wrapper = (data as { usage?: unknown }).usage;
	if (typeof wrapper !== "object" || wrapper === null) return null;
	const total = (wrapper as { total?: unknown }).total;
	if (typeof total !== "object" || total === null) return null;

	const t = total as Record<string, unknown>;
	return {
		// pi's own running totals for the whole session, cache reads included.
		totalTokens: numberArg(t, "input") + numberArg(t, "output") + numberArg(t, "cacheRead") + numberArg(t, "cacheWrite"),
		costUsd: numberArg(t, "cost"),
		// Both are filled in by the caller, which knows the model catalogue.
		contextTokens: 0,
		contextWindow: null,
	};
}
