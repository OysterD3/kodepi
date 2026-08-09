/**
 * The session scanner.
 *
 * `~/.pi/agent/sessions` is tens of megabytes here, so the rail is built from
 * the head and tail of each file — the header line, the first user message and
 * the last turn's stop reason. A session is reduced in full only when it is
 * opened.
 *
 * The directory names are a lossy encoding of the cwd (every separator becomes
 * a dash, and one of them decodes to `----`), so the cwd is always read from
 * the header line inside the file.
 */

import { type FileHandle, open, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Project, SessionStatus, SessionSummary } from "@shared/model";
import { isMessage, messageText, parseEntries } from "../pi/entries";
import { sessionTitle, statusFromStopReason } from "../pi/transcript";
import { sessionsDir } from "./agent-dir";

const HEAD_BYTES = 64 * 1024;
const TAIL_BYTES = 16 * 1024;

export interface ScannedSession extends SessionSummary {
	readonly cwd: string;
	readonly file: string;
}

async function readSlice(handle: FileHandle, position: number, length: number): Promise<string> {
	const buffer = Buffer.alloc(length);
	const { bytesRead } = await handle.read(buffer, 0, length, position);
	return buffer.subarray(0, bytesRead).toString("utf8");
}

/** Whole lines only: a slice boundary cuts a line in half. */
function completeLines(chunk: string, dropFirst: boolean): string {
	const lines = chunk.split("\n");
	if (dropFirst) lines.shift();
	else lines.pop();
	return lines.join("\n");
}

async function scanFile(path: string): Promise<ScannedSession | null> {
	const handle = await open(path, "r");
	try {
		const { size, mtimeMs } = await handle.stat();
		if (size === 0) return null;

		let id = "";
		let cwd = "";
		let name = "";
		let firstUser = "";

		for (const entry of parseEntries(completeLines(await readSlice(handle, 0, Math.min(HEAD_BYTES, size)), false))) {
			if (entry.type === "session") {
				const header = entry as { id?: string; cwd?: string };
				id = header.id ?? "";
				cwd = header.cwd ?? "";
			} else if (entry.type === "session_info") {
				name = (entry as { name?: string }).name ?? name;
			} else if (!firstUser && isMessage(entry) && entry.message.role === "user") {
				firstUser = messageText(entry).trim();
			}
		}

		if (!id || !cwd) return null;

		// The last turn's stop reason decides done vs error. Reading the tail
		// keeps that honest without parsing the whole file — and a rename is
		// appended, so the tail is also where a late `session_info` lands.
		let status: SessionStatus = firstUser ? "done" : "new";
		const start = Math.max(0, size - TAIL_BYTES);
		for (const entry of parseEntries(completeLines(await readSlice(handle, start, Math.min(TAIL_BYTES, size)), start > 0))) {
			if (entry.type === "session_info") name = (entry as { name?: string }).name ?? name;
			else if (isMessage(entry) && entry.message.role === "assistant") status = statusFromStopReason(entry.message.stopReason);
		}

		return { id, cwd, file: path, title: sessionTitle(name, firstUser), status, modified: mtimeMs };
	} finally {
		await handle.close();
	}
}

export interface Scan {
	readonly projects: Project[];
	readonly sessions: ScannedSession[];
}

export async function scanSessions(): Promise<Scan> {
	const root = sessionsDir();

	let dirs: string[];
	try {
		dirs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
	} catch {
		// No agent directory yet — an empty rail is the correct answer.
		return { projects: [], sessions: [] };
	}

	const files: string[] = [];
	await Promise.all(
		dirs.map(async (dir) => {
			try {
				for (const name of await readdir(join(root, dir))) {
					if (name.endsWith(".jsonl")) files.push(join(root, dir, name));
				}
			} catch {
				// A directory that vanished mid-scan is not an error worth raising.
			}
		}),
	);

	const scanned = await Promise.all(
		files.map(async (file) => {
			try {
				return await scanFile(file);
			} catch {
				return null;
			}
		}),
	);

	const sessions = scanned.filter((s): s is ScannedSession => s !== null).sort((a, b) => b.modified - a.modified);

	const byCwd = new Map<string, ScannedSession[]>();
	for (const session of sessions) {
		const list = byCwd.get(session.cwd) ?? [];
		list.push(session);
		byCwd.set(session.cwd, list);
	}

	// `sessions` is newest first, so each project's first entry is its newest.
	const projects: Project[] = [...byCwd.entries()]
		.map(([cwd, list]) => ({
			id: cwd,
			name: basename(cwd) || cwd,
			sessionIds: list.map((s) => s.id),
			newest: list[0]?.modified ?? 0,
		}))
		.sort((a, b) => b.newest - a.newest)
		.map(({ newest: _newest, ...project }) => project);

	return { projects, sessions };
}
