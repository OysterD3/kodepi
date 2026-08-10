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
import type { ModelProfile, ModelRole, PiSettings, ThinkingLevel } from "@shared/model";
import { isThinkingLevel, parseRef } from "@shared/model";
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

/**
 * The same answer for the life of the app.
 *
 * Every settings write is followed by a read of the whole file, and the hunt
 * above walks pnpm's global store — a directory tree — to answer a question
 * whose answer cannot change while this process is running.
 */
let piVersion: Promise<string | null> | null = null;

function readPiVersion(): Promise<string | null> {
	piVersion ??= findPiVersion();
	return piVersion;
}

/**
 * The `models` block and its profiles, read the same way everywhere.
 *
 * The reader and the two writers have to agree on what a malformed block means,
 * or the panel offers a combination the write then refuses.
 */
function modelsBlock(settings: Record<string, unknown>): { models: Record<string, unknown>; providers: Record<string, unknown> } {
	const models = (settings["models"] as Record<string, unknown> | undefined) ?? {};
	return { models, providers: (models["providers"] as Record<string, unknown> | undefined) ?? {} };
}

/** One profile, or null when the file has none by that name. */
function profileOf(providers: Record<string, unknown>, name: string): Record<string, unknown> | null {
	const profile = providers[name];
	return typeof profile === "object" && profile !== null ? (profile as Record<string, unknown>) : null;
}

/**
 * The combinations the file defines, and which of them is in force.
 *
 * `models` is not pi's own block — the `/provider` extension keeps it — so
 * every part of it may be missing, and a missing part means no combinations
 * rather than an error. Values that are not strings are dropped: a role is a
 * model reference, and half of one would resolve to nothing.
 */
function readProfiles(settings: Record<string, unknown>): { active: string; profiles: ModelProfile[] } {
	const { models, providers } = modelsBlock(settings);

	const profiles: ModelProfile[] = [];
	for (const [name, block] of Object.entries(providers)) {
		if (typeof block !== "object" || block === null) continue;
		const roles: ModelRole[] = [];
		for (const [role, ref] of Object.entries(block as Record<string, unknown>)) {
			if (typeof ref === "string" && ref) roles.push({ name: role, ref });
		}
		profiles.push({ name, roles });
	}

	// An `active` naming a profile nobody defined is not one in force: pi would
	// read every role as a literal model, which is what having none means here.
	const active = stringArg(models, "active");
	return { active: profiles.some((profile) => profile.name === active) ? active : "", profiles };
}

export async function readSettings(): Promise<PiSettings> {
	const settings = (await readJson(settingsPath())) ?? {};
	const permissions = (settings["permissions"] as Record<string, unknown> | undefined) ?? {};
	const advisor = (settings["advisor"] as Record<string, unknown> | undefined) ?? {};
	const { active, profiles } = readProfiles(settings);

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
		modelProfile: active,
		modelProfiles: profiles,
		agentDir: agentDir(),
		piVersion: await readPiVersion(),
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
 * pi's own two keys, moved to whatever the `session` role names.
 *
 * This is the half of `/provider` that outlives the process. pi resolves
 * `defaultProvider` and `defaultModel` before any extension runs, so they
 * cannot be roles themselves and have to be written out.
 *
 * A reference this cannot read is refused rather than skipped: writing the rest
 * would leave the file saying a combination is in force while pi went on
 * starting every chat on the model the last one named.
 *
 * `withLevel` is for the switch, which is a whole set moving at once and the one
 * place a profile's `:level` pin may take the thinking level with it. Editing a
 * single role must not: the level is its own setting, with its own control.
 */
function withSession(settings: Record<string, unknown>, ref: string, withLevel: boolean): Record<string, unknown> {
	const { provider, id, level } = parseRef(ref);
	if (!provider || !id) throw new Error(`"${ref}" is not a model reference, so pi's own default model cannot be moved to it`);

	return { ...settings, defaultProvider: provider, defaultModel: id, ...(withLevel && level ? { defaultThinkingLevel: level } : {}) };
}

/**
 * Which combination is in force.
 *
 * What `/provider <name>` writes: the active profile, and pi's own two keys
 * from that profile's `session` role. A profile that defines no `session` moves
 * nothing else — `session` is the only reserved role, and nothing makes a
 * profile carry one.
 *
 * The running pi is not moved. It holds its model in memory, and this app has
 * no way to hand it another; the panel that calls this says so.
 */
export async function setActiveProfile(name: string): Promise<void> {
	if (!name.trim()) throw new Error("a combination is named before it can be used");

	const path = settingsPath();
	const settings = await readForUpdate(path);
	const { models, providers } = modelsBlock(settings);
	const profile = profileOf(providers, name);
	if (!profile) throw new Error(`pi's settings define no "${name}" combination`);

	const session = profile["session"];
	const next = { ...settings, models: { ...models, active: name } };

	await writeJson(path, typeof session === "string" ? withSession(next, session, true) : next);
}

/**
 * One model in one combination.
 *
 * Writing the `session` role of the combination in force moves pi's own two
 * keys with it, for the same reason switching a combination does: they are the
 * same setting said twice, and letting them drift would leave the file
 * disagreeing with itself until the next `/provider`.
 *
 * The thinking level is not one of those keys here. It has a control of its own
 * in the same panel, and choosing a model is not asking to undo it.
 */
export async function setRoleModel(profileName: string, role: string, ref: string): Promise<void> {
	if (!profileName.trim() || !role.trim() || !ref.trim()) throw new Error("a role is a combination, a name and a model");

	const path = settingsPath();
	const settings = await readForUpdate(path);
	const { models, providers } = modelsBlock(settings);
	// The panel only offers combinations that are in the file, so an absent one
	// means it changed underneath this window. Writing would invent a profile.
	const profile = profileOf(providers, profileName);
	if (!profile) throw new Error(`pi's settings define no "${profileName}" combination`);

	const next = {
		...settings,
		models: { ...models, providers: { ...providers, [profileName]: { ...profile, [role]: ref } } },
	};

	await writeJson(path, role === "session" && models["active"] === profileName ? withSession(next, ref, false) : next);
}

/**
 * Which model the advisor extension consults.
 *
 * `advisor.model` is a whole key of its own rather than one of pi's top-level
 * ones, so what is already inside it is kept — `enabled` is the extension's
 * kill switch, and dropping it here would silently switch the advisor back on.
 *
 * The value is not checked against the roles: pi resolves it with its own
 * `--model` rules, so a plain `provider/id` is as legal as a role name, and a
 * role this profile does not define is read as a literal reference.
 */
export async function setAdvisorModel(model: string): Promise<void> {
	if (!model.trim()) throw new Error("the advisor needs a model to consult");

	const path = settingsPath();
	const settings = await readForUpdate(path);
	const advisor = (settings["advisor"] as Record<string, unknown> | undefined) ?? {};
	if (advisor["model"] === model) return;

	await writeJson(path, { ...settings, advisor: { ...advisor, model } });
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
