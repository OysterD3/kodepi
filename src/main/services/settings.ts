/**
 * pi's own settings, models and CLI location.
 *
 * Deliberately narrow: `auth.json` is never opened, and the permission patterns
 * are counted rather than copied — the UI needs to say how many rules are in
 * force, not what they are. What this app does write to `settings.json` goes
 * through `writeJson` below, which keeps every key it did not come for.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PiSettings, ThinkingLevel } from "@shared/model";
import { isThinkingLevel } from "@shared/model";
import { stringArg } from "../pi/entries";
import { agentDir, settingsPath } from "./agent-dir";

/**
 * The file as an object, for a write that must keep what is already there.
 *
 * A file that will not parse is refused rather than treated as empty: these are
 * pi's own settings, and rewriting one from `{}` would drop everything in it.
 */
export async function readForUpdate(path: string): Promise<Record<string, unknown>> {
	const body = await readJson(path);
	if (body) return body;
	if (existsSync(path)) throw new Error(`${path} is not readable as JSON — kodepi will not overwrite it`);
	return {};
}

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

/**
 * Replace a JSON file, keeping every key it already had.
 *
 * Through a temp file and a rename: these are pi's files, and a torn write
 * would read back as no settings at all.
 */
export async function writeJson(path: string, body: Record<string, unknown>): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
	await rename(temp, path);
}

function countList(value: unknown): number {
	return Array.isArray(value) ? value.length : 0;
}

const PI_PKG = "node_modules/@earendil-works/pi-coding-agent";

/** Global install layouts pi's own launcher script resolves through. */
function cliCandidates(): string[] {
	const home = homedir();
	return [
		join(home, ".npm-global/lib", PI_PKG, "package.json"),
		"/usr/local/lib/" + join(PI_PKG, "package.json"),
		"/opt/homebrew/lib/" + join(PI_PKG, "package.json"),
		join(home, ".bun/install/global", PI_PKG, "package.json"),
	];
}

/** Where a package manager leaves the `pi` command itself. */
function shimPaths(): string[] {
	const home = homedir();
	return [join(home, "Library/pnpm/bin/pi"), join(home, ".local/share/pnpm/bin/pi"), join(home, ".bun/bin/pi")];
}

/**
 * The version behind the `pi` command, read out of pnpm's own shim.
 *
 * A machine can hold several installs of the same package — this one holds two
 * copies of 0.84.1 — and only the shim says which one `pi` actually runs. It
 * spells the path relative to its own directory, so it is resolved from there.
 */
async function versionFromShim(): Promise<string | null> {
	for (const shim of shimPaths()) {
		let text: string;
		try {
			text = await readFile(shim, "utf8");
		} catch {
			continue;
		}
		const found = /\$basedir(?:_win)?(\/[^"]*\/@earendil-works\/pi-coding-agent)\//.exec(text);
		const pkg = found?.[1] ? await readJson(join(dirname(shim), found[1], "package.json")) : null;
		const version = pkg?.["version"];
		if (typeof version === "string") return version;
	}
	return null;
}

/**
 * The pnpm global store, which nests deeper than it used to.
 *
 * pnpm 5 kept the package at `global/5/node_modules/…`; pnpm 11 puts a hashed
 * install directory in between — `global/v11/<hash>/node_modules/…`. Both
 * depths are searched, newest layout first.
 */
async function versionFromStore(): Promise<string | null> {
	const home = homedir();
	for (const store of [join(home, "Library/pnpm/global"), join(home, ".local/share/pnpm/global")]) {
		let layouts: string[];
		try {
			layouts = (await readdir(store)).sort().reverse();
		} catch {
			continue;
		}

		for (const layout of layouts) {
			const flat = (await readJson(join(store, layout, PI_PKG, "package.json")))?.["version"];
			if (typeof flat === "string") return flat;

			let installs: string[];
			try {
				installs = await readdir(join(store, layout));
			} catch {
				continue;
			}
			for (const install of installs) {
				const nested = (await readJson(join(store, layout, install, PI_PKG, "package.json")))?.["version"];
				if (typeof nested === "string") return nested;
			}
		}
	}
	return null;
}

/**
 * pi's version, read from the package.json beside its CLI.
 *
 * Reading beats spawning: a packaged app does not inherit the login shell's
 * PATH, and spawning a CLI just to print a version is a poor trade.
 */
async function findPiVersion(): Promise<string | null> {
	// An explicit path, then the shim — both name one install rather than
	// whichever copy the filesystem happens to hand back first.
	const fromEnv = process.env["PI_CLI_PATH"];
	if (fromEnv) {
		const pkg = await readJson(fromEnv.endsWith("package.json") ? fromEnv : join(dirname(fromEnv), "package.json"));
		if (typeof pkg?.["version"] === "string") return pkg["version"];
	}

	const fromShim = await versionFromShim();
	if (fromShim) return fromShim;

	for (const candidate of cliCandidates()) {
		const pkg = await readJson(candidate);
		const version = pkg?.["version"];
		if (typeof version === "string") return version;
	}

	return versionFromStore();
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
 * Which model pi starts a new session on.
 *
 * `defaultProvider` and `defaultModel` are pi's own two keys, and pi resolves
 * them itself before any extension runs — so these are what a new chat begins
 * with. Nothing else in the file is touched, including the `models` block a
 * `/provider` command may keep there: switching that is its own business.
 *
 * This does not move a session already running. pi holds that model in memory,
 * and the panel that calls this says so.
 */
export async function setDefaultModel(provider: string, modelId: string): Promise<void> {
	if (!provider.trim() || !modelId.trim()) throw new Error("a model is named by both its provider and its id");

	const path = settingsPath();
	const settings = await readForUpdate(path);
	if (settings["defaultProvider"] === provider && settings["defaultModel"] === modelId) return;

	await writeJson(path, { ...settings, defaultProvider: provider, defaultModel: modelId });
}

/**
 * How hard pi thinks in a session it has just started.
 *
 * Written the same way and to the same file as the default model, and just as
 * narrowly. Which of the seven a model actually offers is the running pi's
 * answer, not this one's — so nothing is refused here that pi itself would take.
 */
export async function setDefaultThinkingLevel(level: ThinkingLevel): Promise<void> {
	if (!isThinkingLevel(level)) throw new Error(`pi has no "${String(level)}" thinking level`);

	const path = settingsPath();
	const settings = await readForUpdate(path);
	if (settings["defaultThinkingLevel"] === level) return;

	await writeJson(path, { ...settings, defaultThinkingLevel: level });
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
