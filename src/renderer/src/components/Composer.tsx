import type { JSX } from "react";
import { useState } from "react";
import type { ThinkingLevel } from "@shared/model";
import { THINKING_LEVELS } from "@shared/model";
import { BranchIcon, LockIcon, SendIcon, StarIcon } from "./icons";
import { Menu, TwoLine } from "./primitives";
import { formatTokens } from "@/lib/format";
import { actions, currentSession, useStore } from "@/lib/store";

/**
 * Every chip reports what pi recorded for this session. None of them can
 * change it: writing a setting means talking to a live pi process, and that is
 * the RPC pass. Each menu says so in its own footer rather than pretending.
 */

const NOT_WRITABLE = "Read from pi. Changing it needs a live session.";

const LEVEL_LABEL: Record<ThinkingLevel, string> = {
	off: "No thinking",
	minimal: "Minimal effort",
	low: "Low effort",
	medium: "Medium effort",
	high: "High effort",
	xhigh: "Extra-high effort",
	max: "Max effort",
};

function ModelChip(): JSX.Element | null {
	const session = useStore(currentSession);
	const defaultModel = useStore((s) => s.settings?.defaultModel ?? "");
	const open = useStore((s) => s.menu === "model");
	if (!session) return null;

	return (
		<div className="menu-anchor">
			<button type="button" className="chip" onClick={() => actions.toggleMenu("model")}>
				<StarIcon />
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

function EffortChip(): JSX.Element | null {
	const session = useStore(currentSession);
	const open = useStore((s) => s.menu === "effort");
	if (!session) return null;

	const level = session.thinkingLevel;
	const index = THINKING_LEVELS.indexOf(level);
	const last = THINKING_LEVELS.length - 1;
	const at = (i: number): string => `calc(13px + ${i} * (100% - 26px) / ${last})`;

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
					<div className="effort__ends">
						<span>Faster</span>
						<span className="spacer" />
						<span>Smarter</span>
					</div>
					<div className="effort__slider">
						<div className="effort__groove">
							<div className="effort__fill" style={{ width: at(index) }} />
						</div>
						{THINKING_LEVELS.map((name, i) => (
							<div
								key={name}
								className="effort__tick"
								title={name}
								style={{ left: at(i), background: i <= index ? "rgba(255,255,255,.30)" : "rgba(255,255,255,.16)" }}
							/>
						))}
						<div className="effort__knob" style={{ left: at(index) }} />
					</div>
					<div className="effort__note">pi has seven levels. {NOT_WRITABLE}</div>
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

export function Composer(): JSX.Element {
	const sessionId = useStore((s) => s.sessionId);
	// A session this window started has a pi attached; one read back from disk
	// does not, and nothing can be sent to it.
	const live = useStore((s) => (s.sessionId ? !!s.live[s.sessionId] : false));
	// Whatever pi said on the way past: a refusal to start, or its own stderr.
	const notice = useStore((s) => s.notice);
	// Local, not in the store: a store write notifies every mounted row.
	const [draft, setDraft] = useState("");

	const send = (): void => {
		const message = draft.trim();
		if (!message || !sessionId || !live) return;
		setDraft("");
		void actions.prompt(sessionId, message);
	};

	return (
		<div className="composer">
			{notice ? (
				<button type="button" className="composer__notice" title="Dismiss" onClick={() => actions.notice("")}>
					{notice}
				</button>
			) : null}
			<div className="composer__box">
				<textarea
					className="composer__input"
					value={draft}
					disabled={!live}
					placeholder={live ? "Ask pi. ⏎ to send, ⇧⏎ for a new line." : "This session was read from disk. Press + on a project to start a live one."}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
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
