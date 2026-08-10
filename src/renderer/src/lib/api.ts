/**
 * The only place `window.api` is touched.
 *
 * Everything the renderer knows about pi arrives through here.
 */

import type { PiApi } from "@shared/ipc";

function bridge(): PiApi {
	const api = (window as unknown as { api?: PiApi }).api;
	if (!api) throw new Error("the preload bridge is missing — window.api is undefined");
	return api;
}

export const api: PiApi = {
	scan: () => bridge().scan(),
	openSession: (id) => bridge().openSession(id),
	settings: () => bridge().settings(),
	workflows: () => bridge().workflows(),
	revealAgentDir: () => bridge().revealAgentDir(),
	skills: (cwd) => bridge().skills(cwd),
	setSkillMode: (name, mode, cwd) => bridge().setSkillMode(name, mode, cwd),
	models: (cwd) => bridge().models(cwd),
	setDefaultModel: (provider, modelId) => bridge().setDefaultModel(provider, modelId),
	setDefaultThinkingLevel: (level) => bridge().setDefaultThinkingLevel(level),
	setAdvisorModel: (model) => bridge().setAdvisorModel(model),
	setActiveProfile: (name) => bridge().setActiveProfile(name),
	setRoleModel: (profile, role, ref) => bridge().setRoleModel(profile, role, ref),
	chooseDirectory: () => bridge().chooseDirectory(),
	branchOf: (cwd) => bridge().branchOf(cwd),
	startShell: (sessionId, cwd, cols, rows) => bridge().startShell(sessionId, cwd, cols, rows),
	writeShell: (sessionId, data) => bridge().writeShell(sessionId, data),
	resizeShell: (sessionId, cols, rows) => bridge().resizeShell(sessionId, cols, rows),
	onShellData: (listener) => bridge().onShellData(listener),
	onShellExit: (listener) => bridge().onShellExit(listener),
	startAgent: (draftId, cwd) => bridge().startAgent(draftId, cwd),
	resumeAgent: (sessionId) => bridge().resumeAgent(sessionId),
	promptAgent: (draftId, message) => bridge().promptAgent(draftId, message),
	abortAgent: (draftId) => bridge().abortAgent(draftId),
	setThinkingLevel: (draftId, level) => bridge().setThinkingLevel(draftId, level),
	onAgentSession: (listener) => bridge().onAgentSession(listener),
	onAgentStatus: (listener) => bridge().onAgentStatus(listener),
	onAgentNotice: (listener) => bridge().onAgentNotice(listener),
	onAgentCommands: (listener) => bridge().onAgentCommands(listener),
	onAgentThinking: (listener) => bridge().onAgentThinking(listener),
	onAgentExit: (listener) => bridge().onAgentExit(listener),
};
