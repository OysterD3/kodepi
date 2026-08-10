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
	skills: (cwd) => call(CHANNELS.skills, cwd),
	setSkillMode: (name, mode, cwd) => call(CHANNELS.setSkillMode, name, mode, cwd),
	models: (cwd) => call(CHANNELS.models, cwd),
	setDefaultModel: (provider, modelId) => call(CHANNELS.setDefaultModel, provider, modelId),
	setDefaultThinkingLevel: (level) => call(CHANNELS.setDefaultThinking, level),
	setAdvisorModel: (model) => call(CHANNELS.setAdvisorModel, model),
	setActiveProfile: (name) => call(CHANNELS.setActiveProfile, name),
	setRoleModel: (profile, role, ref) => call(CHANNELS.setRoleModel, profile, role, ref),
	chooseDirectory: () => call(CHANNELS.chooseDirectory),
	branchOf: (cwd) => call(CHANNELS.branchOf, cwd),
	startShell: (sessionId, cwd, cols, rows) => call(CHANNELS.termStart, sessionId, cwd, cols, rows),
	writeShell: (sessionId, data) => call(CHANNELS.termWrite, sessionId, data),
	resizeShell: (sessionId, cols, rows) => call(CHANNELS.termResize, sessionId, cols, rows),
	onShellData: (listener) => on(CHANNELS.termData, listener),
	onShellExit: (listener) => on(CHANNELS.termExit, listener),
	startAgent: (draftId, cwd) => call(CHANNELS.agentStart, draftId, cwd),
	resumeAgent: (sessionId) => call(CHANNELS.agentResume, sessionId),
	promptAgent: (draftId, message) => call(CHANNELS.agentPrompt, draftId, message),
	abortAgent: (draftId) => call(CHANNELS.agentAbort, draftId),
	setThinkingLevel: (draftId, level) => call(CHANNELS.agentSetThinking, draftId, level),
	onAgentSession: (listener) => on(CHANNELS.agentSession, listener),
	onAgentStatus: (listener) => on(CHANNELS.agentStatus, listener),
	onAgentNotice: (listener) => on(CHANNELS.agentNotice, listener),
	onAgentCommands: (listener) => on(CHANNELS.agentCommands, listener),
	onAgentThinking: (listener) => on(CHANNELS.agentThinking, listener),
	onAgentExit: (listener) => on(CHANNELS.agentExit, listener),
};

contextBridge.exposeInMainWorld("api", api);
