import type { JSX } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PiCommand, ThinkingLevel } from "@shared/model";
import { THINKING_LEVELS } from "@shared/model";
import { BrandIcon } from "./BrandIcon";
import { EffortSlider, LEVEL_LABEL } from "./EffortSlider";
import { BranchIcon, LockIcon, SendIcon } from "./icons";
import { Menu, TwoLine } from "./primitives";
import type { CommandGroup, CommandMatch } from "@/lib/commands";
import { commandGroups, completion, flatMatches, slashQuery } from "@/lib/commands";
import { formatTokens } from "@/lib/format";
import { actions, currentSession, sessionCommands, sessionLevels, useStore } from "@/lib/store";

/**
 * Every chip reports what pi recorded for this session.
 *
 * Only the thinking level can be changed, and only on a session this window
 * started: it is the one setting pi's RPC will take back. The others are a
 * report, and each menu says so in its own footer rather than pretending.
 */

const NOT_WRITABLE = "Read from pi. Changing it needs a live session.";

function ModelChip(): JSX.Element | null {
	const session = useStore(currentSession);
	const defaultModel = useStore((s) => s.settings?.defaultModel ?? "");
	const open = useStore((s) => s.menu === "model");
	if (!session) return null;

	return (
		<div className="menu-anchor">
			<button type="button" className="chip" onClick={() => actions.toggleMenu("model")}>
				{/* The maker's mark where the generic star was: the model's own name
				    is already here, so the glyph may as well say something. */}
				<BrandIcon provider={session.provider} model={session.model} size={13} />
				<span className="chip__label">{session.model || "no model recorded"}</span>
				<span className="chip__caret">▾</span>
			</button>
			{open ? (
				<Menu className="menu menu--above" width={300}>
					<div className="menu__head">MODEL</div>
					<div className="menu__row">
						<TwoLine
							checked
							name={session.model || "unknown"}
							sub={`${session.provider ? `via ${session.provider}` : "provider not recorded"} · this session`}
						/>
					</div>
					{defaultModel && defaultModel !== session.model ? (
						<div className="menu__row">
							<TwoLine name={defaultModel} sub="your default in pi's settings" />
						</div>
					) : null}
					<div className="menu__note">{NOT_WRITABLE}</div>
				</Menu>
			) : null}
		</div>
	);
}

/**
 * What the slider can and cannot do, in the case it is actually in.
 *
 * `available` is empty until pi answers, and for a session read off disk it
 * never does.
 */
export function effortNote(level: ThinkingLevel, available: readonly ThinkingLevel[]): string {
	if (available.length === 0) return `pi has seven levels. ${NOT_WRITABLE}`;
	if (!available.includes(level)) return `pi is on ${LEVEL_LABEL[level]}, which this model does not list. Left where pi has it.`;
	if (available.length === 1) return `This model has one level. There is nothing to choose.`;
	return `This model offers ${available.length}. It holds until this pi stops.`;
}

function EffortChip(): JSX.Element | null {
	const session = useStore(currentSession);
	const open = useStore((s) => s.menu === "effort");
	// What pi will take. Empty until it has answered, and for a recorded session.
	const available = useStore(sessionLevels);
	const sessionId = useStore((s) => s.sessionId);
	if (!session) return null;

	const level = session.thinkingLevel;
	// A session read off disk has no answer from pi, and a level pi reports but
	// this model does not list has no place on its groove. In both cases the
	// seven are a fallback for drawing, not a claim about the model.
	const offered = available.length > 0;
	const placed = offered && available.includes(level);
	const levels = placed ? available : THINKING_LEVELS;
	const writable = placed && available.length > 1;
	const index = Math.max(0, levels.indexOf(level));
	const last = levels.length - 1;

	return (
		<div className="menu-anchor">
			<button type="button" className="chip" onClick={() => actions.toggleMenu("effort")}>
				<span className="bars">
					<i className={index >= 1 ? "on" : ""} />
					<i className={index >= 3 ? "on" : ""} />
					<i className={index >= last ? "on" : ""} />
				</span>
				<span className="chip__label">{LEVEL_LABEL[level]}</span>
				<span className="chip__caret">▾</span>
			</button>

			{open ? (
				<Menu className="menu menu--above effort" width={288}>
					<div className="effort__head">
						<span className="effort__head-label">Thinking</span>
						<span className="effort__head-name">{LEVEL_LABEL[level]}</span>
					</div>
					<EffortSlider
						level={level}
						levels={levels}
						writable={writable}
						onPick={(picked) => {
							if (sessionId) actions.setThinkingLevel(sessionId, picked);
						}}
					/>
					<div className="effort__note">{effortNote(level, available)}</div>
				</Menu>
			) : null}
		</div>
	);
}

function AccessChip(): JSX.Element | null {
	const settings = useStore((s) => s.settings);
	const open = useStore((s) => s.menu === "access");
	if (!settings) return null;

	return (
		<div className="menu-anchor">
			<button type="button" className="chip" onClick={() => actions.toggleMenu("access")}>
				<LockIcon />
				<span className="chip__label">{settings.permissionMode}</span>
				<span className="chip__caret">▾</span>
			</button>
			{open ? (
				<Menu className="menu menu--above" width={296}>
					<div className="menu__head">PERMISSIONS</div>
					<div className="menu__row">
						<TwoLine
							checked
							name={settings.permissionMode}
							sub={`${settings.allowRules} allow · ${settings.askRules} ask · ${settings.denyRules} deny`}
						/>
					</div>
					<div className="menu__note">
						pi's own rules, from settings.json. This is not a sandbox — pi's own documentation says so.
					</div>
				</Menu>
			) : null}
		</div>
	);
}

function BranchChip(): JSX.Element | null {
	const session = useStore(currentSession);
	if (!session?.branch) return null;

	return (
		<span className="chip" title={session.cwd}>
			<BranchIcon />
			<span className="chip__label chip__label--code">{session.branch}</span>
		</span>
	);
}

function ContextRing(): JSX.Element | null {
	const usage = useStore((s) => currentSession(s)?.usage ?? null);
	if (!usage) return null;

	const used = usage.contextWindow ? Math.min(1, usage.contextTokens / usage.contextWindow) : 0;

	return (
		<span
			className="ctx"
			title={usage.contextWindow ? `Context window — ${Math.round(used * 100)}% used` : "No context window recorded"}
		>
			<span className="ctx__ring">
				<svg width="14" height="14" viewBox="0 0 14 14">
					<circle cx="7" cy="7" r="5.4" fill="none" stroke="var(--line-3)" strokeWidth="1.8" />
					<circle
						cx="7"
						cy="7"
						r="5.4"
						fill="none"
						stroke="var(--accent)"
						strokeWidth="1.8"
						strokeLinecap="round"
						strokeDasharray={`${(used * 62.8).toFixed(1)} 62.8`}
					/>
				</svg>
			</span>
			<span className="ctx__text">
				{usage.contextWindow
					? `${formatTokens(usage.contextTokens)} / ${formatTokens(usage.contextWindow)}`
					: formatTokens(usage.contextTokens)}
			</span>
		</span>
	);
}

/** The command's name as drawn, with the part that was typed picked out. */
function Name({ match }: { match: CommandMatch }): JSX.Element {
	const { label, at, len } = match;
	if (at < 0 || len === 0) return <>/{label}</>;
	return (
		<>
			/{label.slice(0, at)}
			<b className="slash__hit">{label.slice(at, at + len)}</b>
			{label.slice(at + len)}
		</>
	);
}

/**
 * What a slash can name here.
 *
 * The list is pi's own. pi keeps its terminal commands (`/settings`,
 * `/hotkeys`) out of it, because they would not run over RPC — so this menu
 * offers nothing that would be swallowed.
 */
function SlashMenu({
	groups,
	cursor,
	onHover,
	onPick,
}: {
	groups: readonly CommandGroup[];
	cursor: number;
	onHover: (index: number) => void;
	onPick: (command: PiCommand) => void;
}): JSX.Element {
	const row = useRef<HTMLButtonElement>(null);
	let index = -1;

	// The list is longer than the menu, so the arrow keys have to bring the row
	// they moved to into view. "nearest" scrolls only when it is off the edge,
	// which leaves the mouse alone: hovering a row that is already visible moves
	// nothing.
	useEffect(() => {
		row.current?.scrollIntoView({ block: "nearest" });
	}, [cursor]);

	return (
		<div className="slash">
			<div className="slash__body">
				{groups.map((group) => (
					<div key={group.title}>
						<div className="slash__group">{group.title}</div>
						{group.matches.map((match) => {
							const i = (index += 1);
							return (
								<button
									type="button"
									key={match.command.name}
									ref={i === cursor ? row : null}
									className={`slash__row${i === cursor ? " slash__row--cursor" : ""}`}
									// mousedown, not click: a click would blur the composer first.
									onMouseDown={(e) => {
										e.preventDefault();
										onPick(match.command);
									}}
									onMouseEnter={() => onHover(i)}
								>
									<span className="slash__name">
										<Name match={match} />
									</span>
									<span className="slash__desc">{match.command.description}</span>
									<span className="slash__scope">{match.command.scope}</span>
								</button>
							);
						})}
					</div>
				))}
			</div>
			<div className="slash__foot">
				<span>↑↓ navigate</span>
				<span>⏎ pick</span>
				<span>esc close</span>
			</div>
		</div>
	);
}

export function Composer(): JSX.Element {
	const sessionId = useStore((s) => s.sessionId);
	// A session this window started has a pi attached; one read back from disk
	// does not, and nothing can be sent to it.
	const live = useStore((s) => (s.sessionId ? !!s.live[s.sessionId] : false));
	// Whatever pi said on the way past: a refusal to start, or its own stderr.
	const notice = useStore((s) => s.notice);
	const commands = useStore(sessionCommands);
	// Local, not in the store: a store write notifies every mounted row.
	const [draft, setDraft] = useState("");
	const [cursor, setCursor] = useState(0);
	// The menu is a function of the draft, so escape needs its own way to say no.
	const [dismissed, setDismissed] = useState(false);
	const input = useRef<HTMLTextAreaElement>(null);

	const query = slashQuery(draft);
	const groups = useMemo(() => (query === null ? [] : commandGroups(commands, query)), [commands, query]);
	const rows = useMemo(() => flatMatches(groups), [groups]);
	const menu = !dismissed && rows.length > 0;
	const at = Math.min(cursor, rows.length - 1);

	const edit = (text: string): void => {
		setDraft(text);
		setCursor(0);
		setDismissed(false);
	};

	/**
	 * Put the command in the composer rather than sending it.
	 *
	 * Most of pi's commands take arguments, and the trailing space is where they
	 * go — and it closes the menu.
	 */
	const pick = (command: PiCommand): void => {
		edit(completion(command));
		input.current?.focus();
	};

	const send = (): void => {
		const message = draft.trim();
		if (!message || !sessionId || !live) return;
		edit("");
		void actions.prompt(sessionId, message);
	};

	return (
		<div className="composer">
			{notice ? (
				<button type="button" className="composer__notice" title="Dismiss" onClick={() => actions.notice("")}>
					{notice}
				</button>
			) : null}
			{sessionId && !live ? (
				<button
					type="button"
					className="composer__resume"
					title="pi appends to this same recording. Do not continue a session that is already open in a terminal."
					onClick={() => void actions.resumeSession(sessionId)}
				>
					<span className="composer__resume-text">Continue this session</span>
					<span className="composer__resume-sub">pi picks it up where it stopped, history and all</span>
				</button>
			) : null}
			<div className="composer__box">
				{menu ? <SlashMenu groups={groups} cursor={at} onHover={setCursor} onPick={pick} /> : null}
				<textarea
					ref={input}
					className="composer__input"
					value={draft}
					disabled={!live}
					placeholder={live ? "Ask pi. ⏎ to send, ⇧⏎ for a new line. / for a command." : "This session was read from disk. Continue it to send a message."}
					onChange={(e) => edit(e.target.value)}
					onKeyDown={(e) => {
						// While the menu is up the same keys belong to it.
						if (menu) {
							if (e.key === "ArrowDown") {
								e.preventDefault();
								setCursor(Math.min(at + 1, rows.length - 1));
								return;
							}
							if (e.key === "ArrowUp") {
								e.preventDefault();
								setCursor(Math.max(at - 1, 0));
								return;
							}
							// ⇧⏎ is a new line, menu or no menu.
							if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
								e.preventDefault();
								const row = rows[at];
								if (row) pick(row.command);
								return;
							}
							if (e.key === "Escape") {
								e.preventDefault();
								setDismissed(true);
								return;
							}
						}
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							send();
						}
					}}
				/>
				<div className="composer__bar">
					<ModelChip />
					<EffortChip />
					<AccessChip />
					<div className="spacer" />
					<BranchChip />
					<ContextRing />
					<button
						type="button"
						className="send"
						title={live ? "Send" : "This session has no live pi"}
						style={{ opacity: live && draft.trim() ? 1 : 0.4 }}
						disabled={!live || !draft.trim()}
						onClick={send}
					>
						<SendIcon />
					</button>
				</div>
			</div>
		</div>
	);
}
