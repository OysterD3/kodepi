/**
 * The contextBridge.
 *
 * The only place `ipcRenderer` is touched. It unwraps the `IpcResult` envelope
 * so a main-process failure arrives in the renderer as a real Error.
 *
 * This file must stay CommonJS — see `electron.vite.config.ts`.
 */

import { contextBridge, ipcRenderer } from "electron";
import type { IpcResult, PiApi } from "@shared/ipc";
import { CHANNELS } from "@shared/ipc";

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
	const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>;
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

/**
 * Subscribe to a main → renderer channel.
 *
 * The `IpcRendererEvent` is dropped rather than forwarded: it carries `sender`,
 * which would hand the renderer a way back into the main process.
 */
function on<A extends unknown[]>(channel: string, listener: (...args: A) => void): () => void {
	const wrapped = (_event: unknown, ...args: unknown[]): void => listener(...(args as A));
	ipcRenderer.on(channel, wrapped);
	return () => {
		ipcRenderer.removeListener(channel, wrapped);
	};
}

const api: PiApi = {
	scan: () => call(CHANNELS.scan),
	openSession: (sessionId) => call(CHANNELS.openSession, sessionId),
	settings: () => call(CHANNELS.settings),
	workflows: () => call(CHANNELS.workflows),
	revealAgentDir: () => call(CHANNELS.revealAgentDir),
	startShell: (sessionId, cwd, cols, rows) => call(CHANNELS.termStart, sessionId, cwd, cols, rows),
	writeShell: (sessionId, data) => call(CHANNELS.termWrite, sessionId, data),
	resizeShell: (sessionId, cols, rows) => call(CHANNELS.termResize, sessionId, cols, rows),
	onShellData: (listener) => on(CHANNELS.termData, listener),
	onShellExit: (listener) => on(CHANNELS.termExit, listener),
	startAgent: (draftId, cwd) => call(CHANNELS.agentStart, draftId, cwd),
	promptAgent: (draftId, message) => call(CHANNELS.agentPrompt, draftId, message),
	abortAgent: (draftId) => call(CHANNELS.agentAbort, draftId),
	onAgentSession: (listener) => on(CHANNELS.agentSession, listener),
	onAgentStatus: (listener) => on(CHANNELS.agentStatus, listener),
	onAgentNotice: (listener) => on(CHANNELS.agentNotice, listener),
};

contextBridge.exposeInMainWorld("api", api);
