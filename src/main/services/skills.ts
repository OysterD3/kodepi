/**
 * Skills, read off disk, and the per-skill modes that decide what each costs.
 *
 * Two different things live here, and they come from different places:
 *
 *   the list   the skill directories pi searches. Walked here rather than
 *              asked of pi, so the panel is instant and works with nothing
 *              running. See ROOTS for what that does and does not cover.
 *   the modes  `~/.config/pi/skill-loading.json`, owned by pi's `skill-loading`
 *              extension. Not `agent/settings.json` — that file is tracked, and
 *              the extension keeps these out of it on purpose.
 *
 * The mode resolution mirrors that extension's `select.ts` exactly: an exact
 * name, then the longest glob by literal characters, then the default. Getting
 * that order wrong would show a skill as advertised when it is hidden.
 */

import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, parse } from "node:path";
import type { LoadingMode, Skill, SkillList, SkillMode } from "@shared/model";
import { isLoadingMode, isSkillMode } from "@shared/model";
import { agentDir, settingsPath } from "./agent-dir";
import { readForUpdate, writeJson } from "./settings";

/** How deep a skill may be nested inside a root before we stop looking. */
const MAX_DEPTH = 4;

const DEFAULT_MODE: LoadingMode = "name";

/**
 * `<XDG_CONFIG_HOME or ~/.config>/pi/skill-loading.json`.
 *
 * The extension honours `XDG_CONFIG_HOME` and falls back to `~/.config` on
 * every platform, macOS included. A missing file means every default.
 */
export function storePath(): string {
	const xdg = process.env["XDG_CONFIG_HOME"]?.trim();
	return join(xdg && xdg.length > 0 ? xdg : join(homedir(), ".config"), "pi", "skill-loading.json");
}

async function readJson(path: string): Promise<Record<string, unknown>> {
	try {
		const value: unknown = JSON.parse(await readFile(path, "utf8"));
		return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
	} catch {
		// Missing or malformed reads as defaults: this is a preferences file.
		return {};
	}
}

/* ── mode resolution, mirroring the extension's select.ts ──────────────── */

function globToRegExp(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^${escaped.split("*").join(".*")}$`);
}

/** A pattern's specificity: how much of it is literal. */
function literalLength(pattern: string): number {
	return pattern.split("*").join("").length;
}

export function modeFor(name: string, rules: Record<string, LoadingMode>, fallback: LoadingMode): { mode: LoadingMode; inherited: boolean } {
	const exact = rules[name];
	if (exact) return { mode: exact, inherited: false };

	let best: { mode: LoadingMode; length: number } | undefined;
	for (const [pattern, mode] of Object.entries(rules)) {
		if (!pattern.includes("*") || !globToRegExp(pattern).test(name)) continue;
		const length = literalLength(pattern);
		// `>` not `>=`, so two equally specific patterns resolve by order, not
		// by whichever the object happened to list first.
		if (!best || length > best.length) best = { mode, length };
	}

	return best ? { mode: best.mode, inherited: false } : { mode: fallback, inherited: true };
}

/* ── off: pi core's own exclusions ─────────────────────────────────────── */

/**
 * The `skills` array in a settings.json, read for its exclusions.
 *
 * pi's resource arrays take `!pattern` to exclude and `-path` to force-exclude
 * an exact path. An excluded skill is not loaded at all — no prompt entry and
 * no `/skill:` command — which is the only true off pi has.
 *
 * Both scopes are read because either can exclude, but only the global one is
 * ever written: a project's settings.json belongs to that repository.
 */
async function exclusionsIn(path: string): Promise<string[]> {
	const raw = await readJson(path);
	const list = raw["skills"];
	if (!Array.isArray(list)) return [];
	return list.filter((entry): entry is string => typeof entry === "string" && (entry.startsWith("!") || entry.startsWith("-")));
}

async function exclusions(cwd: string): Promise<string[]> {
	const project = cwd ? await exclusionsIn(join(cwd, ".pi", "settings.json")) : [];
	return [...(await exclusionsIn(settingsPath())), ...project];
}

/** The entry that switches this skill off, or undefined when none does. */
export function excludedBy(skill: { name: string; path: string }, patterns: readonly string[]): string | undefined {
	return patterns.find((entry) => {
		const body = entry.slice(1);
		if (entry.startsWith("-")) return body === skill.path || body === dirname(skill.path);
		return globToRegExp(body).test(skill.name);
	});
}

/** What this app writes to switch a skill off. Exact, and readable in a diff. */
function offEntry(name: string): string {
	return `!${name}`;
}

/* ── the skill directories ─────────────────────────────────────────────── */

interface Root {
	readonly dir: string;
	readonly scope: string;
	/** `.pi` roots count a bare `.md` as a skill; `.agents` roots ignore them. */
	readonly bareMd: boolean;
}

/**
 * Where pi looks, in the order it prefers.
 *
 * Project roots are searched in `cwd` and every ancestor up to the git root, so
 * a skill beside the repo root reaches a session started deeper in.
 *
 * Not covered: skills a package contributes, and the `skills` array in
 * settings.json. Those are pi's to resolve, and a session's own pi still
 * reports them through `get_commands` — which is what the composer's slash menu
 * lists. This is the directory view.
 */
function roots(cwd: string): Root[] {
	const home = homedir();
	const found: Root[] = [];

	for (let dir = cwd; dir && existsSync(dir); dir = dirname(dir)) {
		// The home directory is where the *user* roots live. Climbing into it
		// would find `~/.agents/skills` again and label it a project's, which is
		// how every skill on this machine came back marked "project".
		if (dir === home) break;
		found.push({ dir: join(dir, ".pi", "skills"), scope: "project", bareMd: true });
		found.push({ dir: join(dir, ".agents", "skills"), scope: "project", bareMd: false });
		// The repo root is the last ancestor worth searching.
		if (existsSync(join(dir, ".git")) || dirname(dir) === dir) break;
	}

	// `agentDir()`, not `~/.pi/agent`: `PI_CODING_AGENT_DIR` moves it, and every
	// other reader in this app follows it there.
	found.push({ dir: join(agentDir(), "skills"), scope: "user", bareMd: true });
	found.push({ dir: join(home, ".agents", "skills"), scope: "user", bareMd: false });

	// A cwd outside home can still name a user root by another path; the user
	// scope is the truthful one, and it is last, so keep the first of each dir.
	const seen = new Set<string>();
	return found.filter((root) => !seen.has(root.dir) && seen.add(root.dir));
}

/**
 * The `name` and `description` out of a SKILL.md's frontmatter.
 *
 * Deliberately small: a folded block and a quoted string are the two shapes
 * that occur, and anything else falls back to the directory name.
 */
export function frontmatter(text: string): Record<string, string> {
	if (!text.startsWith("---")) return {};
	const start = text.indexOf("\n");
	const end = text.indexOf("\n---", start);
	if (start === -1 || end === -1) return {};

	const out: Record<string, string> = {};
	let key = "";

	for (const line of text.slice(start + 1, end).split("\n")) {
		const match = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(line);
		if (match?.[1]) {
			key = match[1];
			const value = (match[2] ?? "").trim();
			// `>`, `>-`, `|` introduce a block; the value is on the lines below.
			out[key] = /^[>|][-+]?$/.test(value) ? "" : unquote(value);
		} else if (key && line.trim()) {
			out[key] = `${out[key] ?? ""} ${line.trim()}`.trim();
		}
	}
	return out;
}

function unquote(value: string): string {
	const quoted = /^"(.*)"$/.exec(value) ?? /^'(.*)'$/.exec(value);
	return quoted?.[1] ?? value;
}

async function readSkill(file: string, fallbackName: string, scope: string): Promise<Skill | null> {
	try {
		const meta = frontmatter(await readFile(file, "utf8"));
		return {
			// pi does not require the name to match the directory, so the file
			// has the final say and the directory is only a fallback.
			name: meta["name"]?.trim() || fallbackName,
			description: meta["description"] ?? "",
			path: file,
			scope,
			mode: DEFAULT_MODE,
			inherited: true,
		};
	} catch {
		return null;
	}
}

/** Directories holding a SKILL.md, and — where the root allows it — bare `.md` files. */
async function walk(root: Root, dir: string, depth: number): Promise<Skill[]> {
	let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}

	// A directory with a SKILL.md is one skill, not a place to keep looking.
	if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
		const skill = await readSkill(join(dir, "SKILL.md"), basename(dir), root.scope);
		return skill ? [skill] : [];
	}

	const found: Skill[] = [];
	for (const entry of entries) {
		if (entry.isDirectory() && depth < MAX_DEPTH) found.push(...(await walk(root, join(dir, entry.name), depth + 1)));
		else if (root.bareMd && depth === 0 && entry.isFile() && entry.name.endsWith(".md")) {
			const skill = await readSkill(join(dir, entry.name), parse(entry.name).name, root.scope);
			if (skill) found.push(skill);
		}
	}
	return found;
}

/**
 * Every skill reachable from a directory, with the mode each one is in.
 *
 * The first root to name a skill keeps it: project beats user, which is the
 * order `roots` returns them in.
 */
export async function readSkills(cwd: string): Promise<SkillList> {
	const raw = await readJson(storePath());

	const rules: Record<string, LoadingMode> = {};
	const configured = raw["modes"];
	if (configured && typeof configured === "object" && !Array.isArray(configured)) {
		for (const [pattern, mode] of Object.entries(configured as Record<string, unknown>)) {
			// An unrecognised mode is dropped, never defaulted: defaulting would
			// advertise a skill someone believed they had hidden.
			if (isLoadingMode(mode) && pattern.trim()) rules[pattern.trim()] = mode;
		}
	}

	const fallback = isLoadingMode(raw["default"]) ? raw["default"] : DEFAULT_MODE;
	const enabled = typeof raw["enabled"] === "boolean" ? raw["enabled"] : true;
	const off = await exclusions(cwd);

	const byName = new Map<string, Skill>();
	for (const root of roots(cwd)) {
		for (const skill of await walk(root, root.dir, 0)) {
			if (byName.has(skill.name)) continue;
			// An excluded skill is still on disk, which is why this reads the
			// directories: pi would not report it at all, and a skill you cannot
			// see is one you cannot switch back on.
			const excluded = excludedBy(skill, off);
			byName.set(skill.name, excluded ? { ...skill, mode: "off", inherited: false } : { ...skill, ...modeFor(skill.name, rules, fallback) });
		}
	}

	const skills = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
	return { skills, fallback, enabled, store: storePath() };
}

/**
 * Set one skill's mode.
 *
 * Every key the file already has is kept, including ones this app does not
 * understand — the extension's own writer drops them, and losing a budget
 * somebody set by hand would be a poor trade for a rewrite nobody asked for.
 *
 * Written through a temp file and a rename, as the extension does: a torn write
 * reads back as "no preferences", which would silently un-hide everything.
 */
export async function setSkillMode(name: string, mode: SkillMode, cwd = ""): Promise<void> {
	if (!name.trim()) throw new Error("that skill has no name to set a mode for");
	if (!isSkillMode(mode)) throw new Error(`pi has no "${String(mode)}" skill mode`);

	// Off is pi core's, in settings.json; the rest are the extension's, in its
	// own preferences. Both sides are always settled, so a skill switched off
	// and back on lands in the mode it had rather than somewhere unrelated.
	await setExcluded(name, mode === "off", cwd);
	// The extension drops a mode it does not recognise, and the skill then falls
	// back to the default — fully listed. "off" is not one of its three, so it
	// never gets as far as that file.
	if (isLoadingMode(mode)) await setLoadingMode(name, mode);
}

/** Add or remove this skill's exclusion in the global settings.json. */
async function setExcluded(name: string, off: boolean, cwd: string): Promise<void> {
	const path = settingsPath();
	// Not this file's forgiving reader: settings.json is tracked and full of keys
	// that are nobody else's business, so one that will not parse is refused.
	const raw = await readForUpdate(path);
	const listed = raw["skills"];
	const skills = (Array.isArray(listed) ? listed : []).filter((entry): entry is string => typeof entry === "string");

	const entry = offEntry(name);
	const without = skills.filter((value) => value !== entry);
	const next = off ? [...without, entry] : without;

	if (!off) {
		// A pattern this app did not write can still be excluding the skill, and
		// removing an exact entry would then look like it had worked.
		const remaining = [...next.filter((value) => value.startsWith("!") || value.startsWith("-")), ...(cwd ? await exclusionsIn(join(cwd, ".pi", "settings.json")) : [])];
		const blocking = excludedBy({ name, path: "" }, remaining);
		if (blocking) throw new Error(`"${blocking}" in pi's settings still switches ${name} off — edit that entry to turn it back on`);
	}

	if (next.length === skills.length && next.every((value, i) => value === skills[i])) return;
	await writeJson(path, { ...raw, skills: next });
}

/** Write one skill's loading mode to the extension's own preferences. */
async function setLoadingMode(name: string, mode: LoadingMode): Promise<void> {
	const path = storePath();
	const raw = await readJson(path);
	const configured = raw["modes"];
	const modes = configured && typeof configured === "object" && !Array.isArray(configured) ? { ...(configured as Record<string, unknown>) } : {};

	modes[name] = mode;
	// Atomically, as the extension does: a torn write reads back as "no
	// preferences", which would silently un-hide everything.
	await writeJson(path, { version: 1, ...raw, modes });
}
