import type { JSX } from "react";
import { formatTokens } from "@/lib/format";
import { currentSession, useStore } from "@/lib/store";

/**
 * The design draws two meters with bars. Only one of them has a ceiling to
 * measure against: pi records a context window per model, but nothing in the
 * agent directory states a spend limit, so the cost row shows a figure and no
 * bar rather than a fraction of a number nobody set.
 */
export function UsageMeters(): JSX.Element | null {
	const usage = useStore((s) => currentSession(s)?.usage ?? null);
	if (!usage) return null;

	// The window holds the last prompt, not everything the session ever spent.
	const percent = usage.contextWindow ? Math.min(100, Math.round((usage.contextTokens / usage.contextWindow) * 100)) : null;

	return (
		<div className="usage">
			<div>
				<div className="usage__top">
					<span className="usage__label">Context</span>
					<span className="spacer" />
					<span className="usage__left">
						{usage.contextWindow
							? `${formatTokens(usage.contextTokens)} / ${formatTokens(usage.contextWindow)}`
							: formatTokens(usage.contextTokens)}
					</span>
				</div>
				{percent !== null ? (
					<div className="usage__track">
						<div className="usage__fill" style={{ width: `${percent}%`, background: "var(--accent)" }} />
					</div>
				) : null}
				<div className="usage__reset">{percent === null ? "no window recorded for this model" : `${percent}% used`}</div>
			</div>

			<div>
				<div className="usage__top">
					<span className="usage__label">Session cost</span>
					<span className="spacer" />
					<span className="usage__left">${usage.costUsd.toFixed(2)}</span>
				</div>
				<div className="usage__reset">{formatTokens(usage.totalTokens)} tokens · pi's own estimate, not a bill</div>
			</div>
		</div>
	);
}
