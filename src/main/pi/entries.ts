/**
 * pi's own session-file shape, typed from the records it writes.
 *
 * `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`, one JSON
 * object per line. Verified against pi 0.84.1, session `version: 3`.
 *
 * Everything here is `unknown`-tolerant on purpose: these files are written by
 * another program and a future pi may add fields or change one. Read them the
 * way you would read a network response.
 */

export interface SessionHeader {
	readonly type: "session";
	readonly version: number;
	readonly id: string;
	readonly timestamp: string;
	readonly cwd: string;
}

export interface SessionInfoEntry {
	readonly type: "session_info";
	readonly timestamp: string;
	readonly name: string;
}

export interface ModelChangeEntry {
	readonly type: "model_change";
	readonly timestamp: string;
	readonly provider: string;
	readonly modelId: string;
}

export interface ThinkingLevelEntry {
	readonly type: "thinking_level_change";
	readonly timestamp: string;
	readonly level: string;
}

export interface CompactionEntry {
	readonly type: "compaction";
	readonly timestamp: string;
	readonly summary: string;
}

/** `custom` carries structured data; `custom_message` carries prose. */
export interface CustomEntry {
	readonly type: "custom" | "custom_message";
	readonly customType: string;
	readonly timestamp: string;
	readonly data?: unknown;
	readonly content?: string;
	/** false means pi hides it from its own transcript. */
	readonly display?: boolean;
}

export interface ThinkingBlock {
	readonly type: "thinking";
	readonly thinking?: string;
	readonly text?: string;
}

export interface TextBlock {
	readonly type: "text";
	readonly text: string;
}

export interface ToolCallBlock {
	readonly type: "toolCall";
	readonly id: string;
	readonly name: string;
	readonly arguments?: Record<string, unknown>;
}

export type ContentBlock = ThinkingBlock | TextBlock | ToolCallBlock;

export interface AssistantUsage {
	readonly input?: number;
	readonly output?: number;
	readonly cacheRead?: number;
	readonly cacheWrite?: number;
	readonly reasoning?: number;
	readonly cost?: number;
}

export interface MessageEntry {
	readonly type: "message";
	readonly timestamp: string;
	readonly message: {
		readonly role: "user" | "assistant" | "toolResult";
		readonly content?: readonly ContentBlock[];
		readonly model?: string;
		readonly provider?: string;
		readonly stopReason?: string;
		readonly usage?: AssistantUsage;
		/** toolResult only. */
		readonly toolCallId?: string;
		readonly toolName?: string;
		readonly isError?: boolean | null;
		readonly details?: unknown;
	};
}

export type Entry =
	| SessionHeader
	| SessionInfoEntry
	| ModelChangeEntry
	| ThinkingLevelEntry
	| CompactionEntry
	| CustomEntry
	| MessageEntry
	| { readonly type: string; readonly timestamp?: string };

/** Parse one JSONL line. Returns null for blank lines and torn writes. */
export function parseEntry(line: string): Entry | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	try {
		const value: unknown = JSON.parse(trimmed);
		if (typeof value !== "object" || value === null) return null;
		if (typeof (value as { type?: unknown }).type !== "string") return null;
		return value as Entry;
	} catch {
		// pi appends as it goes; a session killed mid-write leaves a partial
		// final line. Skipping it is correct — the next pass will see it whole.
		return null;
	}
}

/** Parse a whole JSONL file, dropping blank and torn lines. */
export function parseEntries(text: string): Entry[] {
	const out: Entry[] = [];
	for (const line of text.split("\n")) {
		const entry = parseEntry(line);
		if (entry) out.push(entry);
	}
	return out;
}

export function isMessage(entry: Entry): entry is MessageEntry {
	return entry.type === "message";
}

export function isCustom(entry: Entry): entry is CustomEntry {
	return entry.type === "custom" || entry.type === "custom_message";
}

/** The text of a user or toolResult message, joined across its blocks. */
export function messageText(entry: MessageEntry): string {
	const blocks = entry.message.content ?? [];
	return blocks
		.filter((b): b is TextBlock => b.type === "text")
		.map((b) => b.text)
		.join("\n");
}

export function thinkingText(block: ThinkingBlock): string {
	return block.thinking ?? block.text ?? "";
}

export function stringArg(args: Record<string, unknown> | undefined, ...names: string[]): string {
	if (!args) return "";
	for (const name of names) {
		const value = args[name];
		if (typeof value === "string") return value;
	}
	return "";
}

export function numberArg(args: Record<string, unknown> | undefined, name: string): number {
	const value = args?.[name];
	return typeof value === "number" ? value : 0;
}

/** An ISO timestamp as epoch ms, or 0 when it is missing or unparsable. */
export function epochMs(timestamp: unknown): number {
	if (typeof timestamp !== "string") return 0;
	const value = Date.parse(timestamp);
	return Number.isFinite(value) ? value : 0;
}
