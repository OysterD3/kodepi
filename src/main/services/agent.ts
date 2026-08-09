/**
 * A live pi, driven over its RPC mode.
 *
 * `pi --mode rpc` speaks JSONL on stdin and stdout: commands in, agent events
 * out. It records the session to pi's own agent directory exactly as an
 * interactive run would, so the transcript this app draws from a live session
 * is the same recording it would read back later — the reducer is shared, and
 * there is no second, parallel model of what happened.
 *
 * pi is started through the user's login shell so it resolves on their PATH,
 * with the profile a packaged app does not otherwise inherit.
 */

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import type { WebContents } from "electron";
import { CHANNELS } from "@shared/ipc";
import type { CommandSource, PiCommand, PiModel, Session, ThinkingLevel } from "@shared/model";
import { isThinkingLevel } from "@shared/model";
import { parseEntries } from "../pi/entries";
import { reduceSession } from "../pi/transcript";
import { currentBranch } from "./git";
import { contextWindows } from "./settings";
import { shellEnv } from "./terminal";

interface Agent {
	readonly pi: ChildProcessWithoutNullStreams;
	target: WebContents;
	/** pi's own session file, once it has told us where it writes. */
	file: string;
	/** Set while a prompt is in flight, so the composer can say so. */
	running: boolean;
	/**
	 * The level pi is on now, which the recording may not have caught up with:
	 * pi does not write an entry when the level changes between turns.
	 */
	level: ThinkingLevel | null;
	/** What the model pi started under supports. Empty until pi has answered. */
	levels: ThinkingLevel[];
	/** Coalesces the reads a burst of events would otherwise cause. */
	timer: NodeJS.Timeout | null;
}

/** Keyed by the draft id the renderer made before pi had a session of its own. */
const agents = new Map<string, Agent>();

/** Events that mean the recording on disk has moved on. */
const CHANGED = new Set(["entry_appended", "message_end", "tool_execution_end", "turn_end", "compaction_end", "agent_settled"]);

/** The path is pi's, not ours, so it goes through the login shell quoted. */
function quote(path: string): string {
	return `'${path.replaceAll("'", "'\\''")}'`;
}

function shellCommand(sessionFile: string): { file: string; args: string[] } {
	const file = process.env["SHELL"] || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
	// `--session` continues the recording in place: same session id, same file,
	// and the whole history back in pi's context.
	const resume = sessionFile ? ` --session ${quote(sessionFile)}` : "";
	return { file, args: ["-lc", `exec pi --mode rpc${resume}`] };
}

function send(agent: Agent, channel: string, ...args: unknown[]): void {
	if (!agent.target.isDestroyed()) agent.target.send(channel, ...args);
}

/**
 * Read what pi has written so far and hand the renderer a whole session.
 *
 * Re-reducing the file rather than folding events into a running transcript
 * keeps one code path for live and recorded sessions: a live turn cannot drift
 * from what reopening the session would show.
 */
async function pushSession(draftId: string, agent: Agent): Promise<void> {
	if (!agent.file || !existsSync(agent.file)) return;

	const reduced = reduceSession(parseEntries(await readFile(agent.file, "utf8")));
	const [branch, windows] = await Promise.all([currentBranch(reduced.cwd), contextWindows()]);

	const session: Session = {
		id: reduced.id,
		title: reduced.title,
		cwd: reduced.cwd,
		status: agent.running ? "running" : reduced.status,
		model: reduced.model,
		provider: reduced.provider,
		// The live pi is the authority here, not the recording: a level set
		// between turns is not written down until a turn records it.
		thinkingLevel: agent.level ?? reduced.thinkingLevel,
		elapsedMs: reduced.elapsedMs,
		modified: reduced.modifiedAt || Date.now(),
		activity: agent.running ? "Working" : null,
		steps: reduced.steps,
		files: reduced.files,
		agents: reduced.agents,
		terminal: reduced.terminal,
		branch,
		usage: reduced.usage ? { ...reduced.usage, contextWindow: windows.get(reduced.model) ?? null } : null,
	};

	send(agent, CHANNELS.agentSession, draftId, session);
}

/** One read per burst of events, rather than one per event. */
function scheduleRead(draftId: string, agent: Agent): void {
	if (agent.timer) return;
	agent.timer = setTimeout(() => {
		agent.timer = null;
		void pushSession(draftId, agent);
	}, 120);
}

const SOURCES = new Set<string>(["extension", "prompt", "skill"]);

/**
 * pi's command list, narrowed to what the composer's menu draws.
 *
 * Read defensively from what pi sends rather than from what its docs describe:
 * the scope arrives inside `sourceInfo`, not as a `location` beside the name.
 */
function parseCommands(data: unknown): PiCommand[] {
	const list = (data as { commands?: unknown } | null)?.commands;
	if (!Array.isArray(list)) return [];

	const commands: PiCommand[] = [];
	for (const entry of list as Record<string, unknown>[]) {
		const name = entry["name"];
		const source = entry["source"];
		if (typeof name !== "string" || typeof source !== "string" || !SOURCES.has(source)) continue;
		const info = (entry["sourceInfo"] as Record<string, unknown> | undefined) ?? {};
		commands.push({
			name,
			description: typeof entry["description"] === "string" ? entry["description"] : "",
			source: source as CommandSource,
			scope: typeof info["scope"] === "string" ? info["scope"] : "",
		});
	}
	return commands;
}

/** pi's answer to `get_available_models`, narrowed to what the picker draws. */
export function parseModels(data: unknown): PiModel[] {
	const list = (data as { models?: unknown } | null)?.models;
	if (!Array.isArray(list)) return [];

	const models: PiModel[] = [];
	for (const entry of list as Record<string, unknown>[]) {
		const id = entry["id"];
		const provider = entry["provider"];
		if (typeof id !== "string" || typeof provider !== "string" || !id || !provider) continue;
		const name = entry["name"];
		const window = entry["contextWindow"];
		models.push({
			id,
			provider,
			name: typeof name === "string" && name ? name : id,
			reasoning: entry["reasoning"] === true,
			contextWindow: typeof window === "number" ? window : null,
		});
	}
	return models;
}

/** Long enough for a cold start on a slow machine; this answered in 1.6s here. */
const MODELS_TIMEOUT = 20_000;

/**
 * Every model pi is configured for, from a pi started only to be asked.
 *
 * Reading the catalogue off disk would cost nothing, and it would be wrong:
 * `models-store.json` holds what pi cached per provider, so a provider that
 * arrives with a package is missing from it. pi itself is the only complete
 * answer, and it gives one in under two seconds.
 *
 * Started in a directory pi already runs in, because starting one makes the
 * session directory for its cwd — and an unfamiliar directory would leave a new
 * empty one behind for a question that has nothing to do with it.
 */
export function listModels(cwd: string): Promise<readonly PiModel[]> {
	const { file, args } = shellCommand("");
	const pi = spawn(file, args, { cwd: cwd && existsSync(cwd) ? cwd : homedir(), env: shellEnv() });

	return new Promise((resolve, reject) => {
		let buffer = "";
		let settled = false;
		const finish = (act: () => void): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			pi.kill();
			act();
		};
		const timer = setTimeout(() => finish(() => reject(new Error("pi did not answer with its models"))), MODELS_TIMEOUT);

		pi.stdout.setEncoding("utf8");
		pi.stdout.on("data", (chunk: string) => {
			buffer = readJsonl(chunk, buffer, (line) => {
				let event: Record<string, unknown>;
				try {
					event = JSON.parse(line) as Record<string, unknown>;
				} catch {
					return;
				}
				if (event["type"] !== "response" || event["command"] !== "get_available_models") return;
				finish(() => (event["success"] === false ? reject(new Error(String(event["error"] ?? "pi refused to list its models"))) : resolve(parseModels(event["data"]))));
			});
		});

		pi.on("error", (error) => finish(() => reject(error)));
		// A login shell that cannot find pi ends here, which is the common failure.
		pi.on("exit", () => finish(() => reject(new Error("pi stopped before it listed its models"))));

		pi.stdin.write(`${JSON.stringify({ type: "get_available_models", id: "models" })}\n`);
	});
}

/** What the chip's slider is allowed to draw, and where it stands. */
function sendThinking(draftId: string, agent: Agent): void {
	send(agent, CHANNELS.agentThinking, draftId, agent.level, agent.levels);
}

function handleEvent(draftId: string, agent: Agent, event: Record<string, unknown>): void {
	const type = event["type"];

	// pi announces this rather than recording it, so nothing in the transcript
	// would ever show it.
	if (type === "thinking_level_changed") {
		const level = event["level"];
		if (typeof level === "string" && isThinkingLevel(level)) {
			agent.level = level;
			sendThinking(draftId, agent);
		}
		return;
	}

	if (type === "response" && event["command"] === "get_available_thinking_levels") {
		const levels = (event["data"] as { levels?: unknown } | null)?.levels;
		// Fetched once. They describe the model pi started under.
		if (Array.isArray(levels)) agent.levels = levels.filter((level): level is ThinkingLevel => typeof level === "string" && isThinkingLevel(level));
		sendThinking(draftId, agent);
		return;
	}

	// pi took the level, or refused it. Either way the renderer guessed, and
	// this is what settles it.
	if (type === "response" && event["command"] === "set_thinking_level") {
		if (event["success"] !== true) {
			const error = event["error"];
			send(agent, CHANNELS.agentNotice, draftId, typeof error === "string" ? error : "pi would not take that thinking level.");
		}
		sendThinking(draftId, agent);
		return;
	}

	if (type === "response" && event["command"] === "get_commands") {
		send(agent, CHANNELS.agentCommands, draftId, parseCommands(event["data"]));
		return;
	}

	if (type === "response" && event["command"] === "get_state") {
		const data = (event["data"] as Record<string, unknown> | undefined) ?? {};
		if (typeof data["sessionFile"] === "string") agent.file = data["sessionFile"];
		const level = data["thinkingLevel"];
		if (typeof level === "string" && isThinkingLevel(level)) agent.level = level;
		sendThinking(draftId, agent);
		scheduleRead(draftId, agent);
		return;
	}

	// A dialog blocks pi until it is answered. Nothing in this app can answer
	// one yet, so they are dismissed rather than left to hang, and said so.
	if (type === "extension_ui_request") {
		const method = event["method"];
		if (method === "select" || method === "confirm" || method === "input" || method === "editor") {
			agent.pi.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: event["id"], cancelled: true })}\n`);
			send(agent, CHANNELS.agentNotice, draftId, `pi asked for input (${String(method)}) — kodepi dismissed it.`);
		}
		return;
	}

	if (type === "agent_start") {
		agent.running = true;
		send(agent, CHANNELS.agentStatus, draftId, true);
	} else if (type === "agent_settled") {
		agent.running = false;
		send(agent, CHANNELS.agentStatus, draftId, false);
	}

	if (typeof type === "string" && CHANGED.has(type)) scheduleRead(draftId, agent);
}

/** Split pi's stdout on LF only: its own docs warn that a line reader is wrong here. */
function readJsonl(chunk: string, buffer: string, onLine: (line: string) => void): string {
	let rest = buffer + chunk;
	for (;;) {
		const at = rest.indexOf("\n");
		if (at === -1) return rest;
		const line = rest.slice(0, at).replace(/\r$/, "");
		rest = rest.slice(at + 1);
		if (line.trim()) onLine(line);
	}
}

/**
 * Start a pi for a session.
 *
 * With `sessionFile`, pi picks up a recording that already exists — one the pi
 * CLI wrote, or an earlier run of this app — and keeps appending to it. Without
 * one, pi starts a session of its own.
 */
export function startAgent(target: WebContents, draftId: string, cwd: string, sessionFile = ""): void {
	if (agents.has(draftId)) return;

	// A project in the rail is a directory some session once ran in, and it can
	// be gone. Starting pi in the home directory instead would look like it
	// worked and write a session nobody asked for.
	if (!cwd || !existsSync(cwd)) throw new Error(`that project's directory is gone: ${cwd}`);
	if (sessionFile && !existsSync(sessionFile)) throw new Error(`that session's recording is gone: ${sessionFile}`);

	const { file, args } = shellCommand(sessionFile);
	const pi = spawn(file, args, { cwd, env: shellEnv() });
	// Known up front when resuming, so the transcript can be re-read before pi
	// has answered anything.
	const agent: Agent = { pi, target, file: sessionFile, running: false, level: null, levels: [], timer: null };
	agents.set(draftId, agent);

	let buffer = "";
	pi.stdout.setEncoding("utf8");
	pi.stdout.on("data", (chunk: string) => {
		buffer = readJsonl(chunk, buffer, (line) => {
			try {
				handleEvent(draftId, agent, JSON.parse(line) as Record<string, unknown>);
			} catch {
				// pi writes only JSON here; anything else is a startup banner.
			}
		});
	});

	// pi's own errors are worth showing rather than swallowing.
	pi.stderr.setEncoding("utf8");
	pi.stderr.on("data", (text: string) => send(agent, CHANNELS.agentNotice, draftId, text.trim().slice(0, 400)));

	pi.on("exit", (code) => {
		agents.delete(draftId);
		send(agent, CHANNELS.agentStatus, draftId, false);
		if (code) send(agent, CHANNELS.agentNotice, draftId, `pi exited with ${code}.`);
		// The spawn succeeded, so nothing has failed yet as far as the renderer
		// knows. Without this the composer stays open on a pi that is gone —
		// including the common case of a login shell that could not find pi.
		send(agent, CHANNELS.agentExit, draftId);
	});

	// Where pi writes decides what the transcript reads.
	pi.stdin.write(`${JSON.stringify({ type: "get_state", id: "state" })}\n`);

	// What a slash can name. pi loads its extensions, prompt templates and
	// skills before it reads stdin, so asking once at startup is enough.
	pi.stdin.write(`${JSON.stringify({ type: "get_commands", id: "commands" })}\n`);

	// Which levels the slider may offer. A model without reasoning answers with
	// "off" alone, and the slider must not pretend otherwise.
	pi.stdin.write(`${JSON.stringify({ type: "get_available_thinking_levels", id: "levels" })}\n`);
}

export function promptAgent(draftId: string, message: string): void {
	const agent = agents.get(draftId);
	if (!agent) throw new Error("that session has no live pi");
	// A prompt sent mid-turn is a steer; pi rejects it otherwise.
	const command = agent.running ? { type: "prompt", message, streamingBehavior: "steer" } : { type: "prompt", message };
	agent.pi.stdin.write(`${JSON.stringify(command)}\n`);
}

export function setThinkingLevel(draftId: string, level: ThinkingLevel): void {
	const agent = agents.get(draftId);
	if (!agent) throw new Error("that session has no live pi");
	agent.pi.stdin.write(`${JSON.stringify({ type: "set_thinking_level", level, id: "level" })}\n`);
}

export function abortAgent(draftId: string): void {
	agents.get(draftId)?.pi.stdin.write(`${JSON.stringify({ type: "abort" })}\n`);
}

export function killAgents(): void {
	for (const agent of agents.values()) agent.pi.kill();
	agents.clear();
}
