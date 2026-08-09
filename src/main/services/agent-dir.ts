import { homedir } from "node:os";
import { join } from "node:path";

/** pi's own environment variable, with pi's own default. */
export function agentDir(): string {
	const override = process.env["PI_CODING_AGENT_DIR"];
	return override && override.trim() ? override : join(homedir(), ".pi", "agent");
}

export function sessionsDir(): string {
	return join(agentDir(), "sessions");
}

export function workflowRunsDir(): string {
	return join(agentDir(), "workflow-runs");
}

export function settingsPath(): string {
	return join(agentDir(), "settings.json");
}
