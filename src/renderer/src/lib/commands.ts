/**
 * The slash menu's matching, kept out of the component that draws it.
 *
 * Every row comes from pi's own `get_commands`; nothing here invents a command
 * or renames one. A skill keeps its `skill:` prefix, because that prefix is
 * part of what pi runs.
 */

import type { CommandSource, PiCommand } from "@shared/model";

/** The headers the menu draws, in order. A source with no match is left out. */
const GROUPS: readonly { readonly source: CommandSource; readonly title: string }[] = [
	{ source: "extension", title: "COMMANDS" },
	{ source: "prompt", title: "PROMPTS" },
	{ source: "skill", title: "SKILLS" },
];

const SKILL = "skill:";

/**
 * What the menu draws.
 *
 * pi registers a skill as `skill:<name>` and expands only that exact form, so
 * the prefix is what runs — `completion` puts it back. On screen it is noise
 * under a SKILLS heading, and worse than noise while typing: every skill would
 * match a leading "s".
 */
export function label(command: PiCommand): string {
	return command.source === "skill" && command.name.startsWith(SKILL) ? command.name.slice(SKILL.length) : command.name;
}

export interface CommandMatch {
	readonly command: PiCommand;
	/** The name as drawn — a skill without pi's prefix. */
	readonly label: string;
	/** Where the typed text sits in the label. -1 when nothing was typed. */
	readonly at: number;
	/** How much of the label it covers, for the highlight. */
	readonly len: number;
}

export interface CommandGroup {
	readonly title: string;
	readonly matches: readonly CommandMatch[];
}

/**
 * What has been typed after the slash, or null when this draft is not naming a
 * command.
 *
 * One token only: a space means the command has arguments, and the menu has
 * nothing left to offer.
 */
export function slashQuery(draft: string): string | null {
	const found = /^\/(\S*)$/.exec(draft);
	return found ? (found[1] ?? "") : null;
}

/**
 * What a picked command puts in the composer. The space closes the menu.
 *
 * pi's own name, prefix and all — that is the only spelling it expands.
 */
export function completion(command: PiCommand): string {
	return `/${command.name} `;
}

function rank(commands: readonly PiCommand[], needle: string): CommandMatch[] {
	return commands
		.map((command) => {
			const text = label(command);
			return { command, label: text, at: needle ? text.toLowerCase().indexOf(needle) : -1, len: needle.length };
		})
		.filter((match) => needle === "" || match.at !== -1)
		// A name that starts with what was typed is the one that was meant.
		.sort((a, b) => a.at - b.at || a.label.localeCompare(b.label));
}

export function commandGroups(commands: readonly PiCommand[], query: string): CommandGroup[] {
	const needle = query.toLowerCase();
	// Someone who types pi's own prefix should still find the skill behind it.
	const bare = needle.startsWith(SKILL) ? needle.slice(SKILL.length) : needle;

	return GROUPS.map(({ source, title }) => ({
		title,
		matches: rank(
			commands.filter((command) => command.source === source),
			source === "skill" ? bare : needle,
		),
	})).filter((group) => group.matches.length > 0);
}

/** The rows in the order they are drawn — what the cursor counts through. */
export function flatMatches(groups: readonly CommandGroup[]): CommandMatch[] {
	return groups.flatMap((group) => group.matches);
}
