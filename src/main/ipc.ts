/**
 * One handler per channel.
 *
 * Reading is the bulk of it: the scan records which file each session lives in,
 * so opening one does not walk the directory again. The two handlers that write
 * — a skill's mode and the default model — touch named keys in pi's own
 * settings and keep everything else in the file.
 */

import { readFile } from "node:fs/promises";
import { BrowserWindow, type OpenDialogOptions, type WebContents, dialog, ipcMain, shell } from "electron";
import type { IpcResult, ScanResult } from "@shared/ipc";
import { CHANNELS } from "@shared/ipc";
import type { Session, SessionSummary, SkillMode, ThinkingLevel } from "@shared/model";
import { errorMessage } from "@shared/model";
import { parseEntries } from "./pi/entries";
import { reduceSession } from "./pi/transcript";
import { abortAgent, listModels, promptAgent, setThinkingLevel, startAgent } from "./services/agent";
import { agentDir } from "./services/agent-dir";
import { currentBranch } from "./services/git";
import { type ScannedSession, scanSessions } from "./services/sessions";
import { contextWindows, readSettings, setDefaultModel, setDefaultThinkingLevel } from "./services/settings";
import { readSkills, setSkillMode } from "./services/skills";
import { resizeShell, startShell, writeShell } from "./services/terminal";
import { readWorkflowRuns } from "./services/workflows";

/** Session id → the file it lives in, refreshed on every scan. */
const files = new Map<string, ScannedSession>();

function summary(session: ScannedSession): SessionSummary {
	return { id: session.id, title: session.title, status: session.status, modified: session.modified };
}

async function handleScan(): Promise<ScanResult> {
	const { projects, sessions } = await scanSessions();
	files.clear();
	for (const session of sessions) files.set(session.id, session);
	return { projects, sessions: sessions.map(summary) };
}

async function handleOpenSession(sessionId: string): Promise<Session> {
	const scanned = files.get(sessionId);
	if (!scanned) throw new Error(`unknown session: ${sessionId}`);

	// The branch and the model catalogue depend only on the cwd, which the scan
	// already knows — so start them before the file read rather than after it.
	// `currentBranch` spawns git, which costs more than reading the session.
	const branchP = currentBranch(scanned.cwd);
	const windowsP = contextWindows();

	const reduced = reduceSession(parseEntries(await readFile(scanned.file, "utf8")));
	const [branch, windows] = await Promise.all([branchP, windowsP]);

	return {
		id: reduced.id || scanned.id,
		title: reduced.title,
		cwd: reduced.cwd || scanned.cwd,
		status: reduced.status,
		model: reduced.model,
		provider: reduced.provider,
		thinkingLevel: reduced.thinkingLevel,
		elapsedMs: reduced.elapsedMs,
		modified: reduced.modifiedAt || scanned.modified,
		// Nothing is live until a pi process is attached.
		activity: null,
		steps: reduced.steps,
		files: reduced.files,
		agents: reduced.agents,
		terminal: reduced.terminal,
		branch,
		usage: reduced.usage ? { ...reduced.usage, contextWindow: windows.get(reduced.model) ?? null } : null,
	};
}

function register<T>(channel: string, handler: (...args: never[]) => Promise<T>): void {
	ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
		try {
			return { ok: true, value: await handler(...(args as never[])) };
		} catch (error) {
			return { ok: false, error: errorMessage(error) };
		}
	});
}

/** Same envelope, but the handler is told which window asked. */
function registerFromWindow(channel: string, handler: (sender: WebContents, ...args: never[]) => void): void {
	ipcMain.handle(channel, (event, ...args): IpcResult<void> => {
		try {
			handler(event.sender, ...(args as never[]));
			return { ok: true, value: undefined };
		} catch (error) {
			return { ok: false, error: errorMessage(error) };
		}
	});
}

export function registerIpc(): void {
	register(CHANNELS.scan, handleScan);
	register(CHANNELS.openSession, (sessionId: string) => handleOpenSession(sessionId));
	register(CHANNELS.settings, readSettings);
	register(CHANNELS.workflows, readWorkflowRuns);
	register(CHANNELS.revealAgentDir, async () => {
		shell.showItemInFolder(agentDir());
	});

	register(CHANNELS.skills, (cwd: string) => readSkills(cwd));
	register(CHANNELS.setSkillMode, (name: string, mode: SkillMode, cwd: string) => setSkillMode(name, mode, cwd));

	register(CHANNELS.models, (cwd: string) => listModels(cwd));
	register(CHANNELS.setDefaultModel, (provider: string, modelId: string) => setDefaultModel(provider, modelId));
	register(CHANNELS.setDefaultThinking, (level: ThinkingLevel) => setDefaultThinkingLevel(level));

	// Where a new chat should run. The chooser is the only way to name a
	// directory pi has never run in — the rail only knows the ones it has.
	register(CHANNELS.chooseDirectory, async (): Promise<string | null> => {
		const options: OpenDialogOptions = { title: "Choose a directory for the new chat", properties: ["openDirectory", "createDirectory"] };
		const parent = BrowserWindow.getFocusedWindow();
		const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
		return result.canceled ? null : (result.filePaths[0] ?? null);
	});

	register(CHANNELS.branchOf, (cwd: string) => currentBranch(cwd));

	// The shell writes back to whichever window asked for it.
	registerFromWindow(CHANNELS.termStart, (sender, sessionId: string, cwd: string, cols: number, rows: number) =>
		startShell(sender, sessionId, cwd, cols, rows),
	);
	registerFromWindow(CHANNELS.termWrite, (_sender, sessionId: string, data: string) => writeShell(sessionId, data));
	registerFromWindow(CHANNELS.termResize, (_sender, sessionId: string, cols: number, rows: number) => resizeShell(sessionId, cols, rows));

	registerFromWindow(CHANNELS.agentStart, (sender, draftId: string, cwd: string) => startAgent(sender, draftId, cwd));

	// The renderer knows a session by its id; where it is recorded is the scan's
	// business, and it is the scan that has the path.
	registerFromWindow(CHANNELS.agentResume, (sender, sessionId: string) => {
		const scanned = files.get(sessionId);
		if (!scanned) throw new Error(`unknown session: ${sessionId}`);
		startAgent(sender, sessionId, scanned.cwd, scanned.file);
	});
	registerFromWindow(CHANNELS.agentPrompt, (_sender, draftId: string, message: string) => promptAgent(draftId, message));
	registerFromWindow(CHANNELS.agentAbort, (_sender, draftId: string) => abortAgent(draftId));
	registerFromWindow(CHANNELS.agentSetThinking, (_sender, draftId: string, level: ThinkingLevel) => setThinkingLevel(draftId, level));
}
