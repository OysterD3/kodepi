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
import type { WebContents } from "electron";
import { CHANNELS } from "@shared/ipc";
import type { Session } from "@shared/model";
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
	/** Coalesces the reads a burst of events would otherwise cause. */
	timer: NodeJS.Timeout | null;
}

/** Keyed by the draft id the renderer made before pi had a session of its own. */
const agents = new Map<string, Agent>();

/** Events that mean the recording on disk has moved on. */
const CHANGED = new Set(["entry_appended", "message_end", "tool_execution_end", "turn_end", "compaction_end", "agent_settled"]);

function shellCommand(): { file: string; args: string[] } {
	const file = process.env["SHELL"] || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");
	return { file, args: ["-lc", "exec pi --mode rpc"] };
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
		thinkingLevel: reduced.thinkingLevel,
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

function handleEvent(draftId: string, agent: Agent, event: Record<string, unknown>): void {
	const type = event["type"];

	if (type === "response" && event["command"] === "get_state") {
		const data = (event["data"] as Record<string, unknown> | undefined) ?? {};
		if (typeof data["sessionFile"] === "string") agent.file = data["sessionFile"];
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

export function startAgent(target: WebContents, draftId: string, cwd: string): void {
	if (agents.has(draftId)) return;

	// A project in the rail is a directory some session once ran in, and it can
	// be gone. Starting pi in the home directory instead would look like it
	// worked and write a session nobody asked for.
	if (!cwd || !existsSync(cwd)) throw new Error(`that project's directory is gone: ${cwd}`);

	const { file, args } = shellCommand();
	const pi = spawn(file, args, { cwd, env: shellEnv() });
	const agent: Agent = { pi, target, file: "", running: false, timer: null };
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
	});

	// Where pi writes decides what the transcript reads.
	pi.stdin.write(`${JSON.stringify({ type: "get_state", id: "state" })}\n`);
}

export function promptAgent(draftId: string, message: string): void {
	const agent = agents.get(draftId);
	if (!agent) throw new Error("that session has no live pi");
	// A prompt sent mid-turn is a steer; pi rejects it otherwise.
	const command = agent.running ? { type: "prompt", message, streamingBehavior: "steer" } : { type: "prompt", message };
	agent.pi.stdin.write(`${JSON.stringify(command)}\n`);
}

export function abortAgent(draftId: string): void {
	agents.get(draftId)?.pi.stdin.write(`${JSON.stringify({ type: "abort" })}\n`);
}

export function killAgents(): void {
	for (const agent of agents.values()) agent.pi.kill();
	agents.clear();
}
