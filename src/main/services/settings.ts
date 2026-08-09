/**
 * pi's own settings, models and CLI location.
 *
 * Read-only, and deliberately narrow: `auth.json` is never opened, and the
 * permission patterns are counted rather than copied — the UI needs to say how
 * many rules are in force, not what they are.
 */

import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PiSettings, ThinkingLevel } from "@shared/model";
import { isThinkingLevel } from "@shared/model";
import { stringArg } from "../pi/entries";
import { agentDir, settingsPath } from "./agent-dir";

/** Read a JSON object, or null when it is missing or malformed. */
export async function readJson(path: string): Promise<Record<string, unknown> | null> {
	try {
		const text = await readFile(path, "utf8");
		const value: unknown = JSON.parse(text);
		return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function countList(value: unknown): number {
	return Array.isArray(value) ? value.length : 0;
}

/** Global install layouts pi's own launcher script resolves through. */
function cliCandidates(): string[] {
	const home = homedir();
	const fromEnv = process.env["PI_CLI_PATH"];
	return [
		...(fromEnv ? [fromEnv] : []),
		join(home, "Library/pnpm/global/5/node_modules/@earendil-works/pi-coding-agent/package.json"),
		join(home, ".local/share/pnpm/global/5/node_modules/@earendil-works/pi-coding-agent/package.json"),
		join(home, ".npm-global/lib/node_modules/@earendil-works/pi-coding-agent/package.json"),
		"/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/package.json",
		"/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/package.json",
		join(home, ".bun/install/global/node_modules/@earendil-works/pi-coding-agent/package.json"),
	];
}

/**
 * pi's version, read from the package.json beside its CLI.
 *
 * Reading beats spawning: a packaged app does not inherit the login shell's
 * PATH, and spawning a CLI just to print a version is a poor trade.
 */
async function findPiVersion(): Promise<string | null> {
	for (const candidate of cliCandidates()) {
		const path = candidate.endsWith("package.json") ? candidate : join(dirname(candidate), "package.json");
		const pkg = await readJson(path);
		const version = pkg?.["version"];
		if (typeof version === "string") return version;
	}
	// The pnpm global store nests the real package under a hashed directory.
	const store = join(homedir(), "Library/pnpm/global");
	try {
		for (const version of await readdir(store)) {
			const pkg = await readJson(join(store, version, "node_modules/@earendil-works/pi-coding-agent/package.json"));
			const found = pkg?.["version"];
			if (typeof found === "string") return found;
		}
	} catch {
		// No pnpm global store on this machine.
	}
	return null;
}

export async function readSettings(): Promise<PiSettings> {
	const settings = (await readJson(settingsPath())) ?? {};
	const permissions = (settings["permissions"] as Record<string, unknown> | undefined) ?? {};
	const advisor = (settings["advisor"] as Record<string, unknown> | undefined) ?? {};

	const level = settings["defaultThinkingLevel"];
	const thinking: ThinkingLevel = typeof level === "string" && isThinkingLevel(level) ? level : "medium";

	return {
		defaultProvider: stringArg(settings, "defaultProvider"),
		defaultModel: stringArg(settings, "defaultModel"),
		defaultThinkingLevel: thinking,
		permissionMode: stringArg(permissions, "defaultMode") || "auto",
		allowRules: countList(permissions["allow"]),
		denyRules: countList(permissions["deny"]),
		askRules: countList(permissions["ask"]),
		advisorModel: stringArg(advisor, "model") || null,
		agentDir: agentDir(),
		piVersion: await findPiVersion(),
	};
}

/**
 * Context window per model id.
 *
 * pi keeps these in two files: `models-store.json` is its cached catalogue for
 * every model a provider offers, and `models.json` holds the user's own
 * overrides. The catalogue is read first so an override wins.
 *
 * A model in neither file has no window, and the meter then draws no bar
 * rather than a percentage of a number nobody stated.
 */
export async function contextWindows(): Promise<Map<string, number>> {
	const out = new Map<string, number>();

	// models-store.json: { provider: { models: [{ id, contextWindow }] } }
	const store = await readJson(join(agentDir(), "models-store.json"));
	for (const provider of Object.values(store ?? {})) {
		const models = (provider as { models?: unknown })?.models;
		if (!Array.isArray(models)) continue;
		for (const model of models) {
			if (typeof model !== "object" || model === null) continue;
			const { id, contextWindow } = model as { id?: unknown; contextWindow?: unknown };
			if (typeof id === "string" && typeof contextWindow === "number") out.set(id, contextWindow);
		}
	}

	// models.json: { providers: { name: { modelOverrides: { id: { contextWindow } } } } }
	const overrides = await readJson(join(agentDir(), "models.json"));
	const providers = overrides?.["providers"];
	if (typeof providers === "object" && providers !== null) {
		for (const provider of Object.values(providers as Record<string, unknown>)) {
			const byModel = (provider as { modelOverrides?: unknown })?.modelOverrides;
			if (typeof byModel !== "object" || byModel === null) continue;
			for (const [modelId, override] of Object.entries(byModel as Record<string, unknown>)) {
				const window = (override as { contextWindow?: unknown })?.contextWindow;
				if (typeof window === "number") out.set(modelId, window);
			}
		}
	}

	return out;
}
