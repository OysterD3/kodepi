/**
 * pi's thinking levels, drawn as one groove.
 *
 * Shared by the composer's chip, where it moves the live pi, and by the model
 * panel, where it sets what a new session starts on — one control, so the two
 * places do not teach two different things.
 *
 * The caller owns the heading and the footnote, because what the levels mean
 * differs: one is a running process, the other is a line in a file.
 */

import type { JSX } from "react";
import type { ThinkingLevel } from "@shared/model";

export const LEVEL_LABEL: Record<ThinkingLevel, string> = {
	off: "No thinking",
	minimal: "Minimal effort",
	low: "Low effort",
	medium: "Medium effort",
	high: "High effort",
	xhigh: "Extra-high effort",
	max: "Max effort",
};

export function EffortSlider({
	level,
	levels,
	writable,
	onPick,
}: {
	level: ThinkingLevel;
	/** What may be chosen, in order, faster first. */
	levels: readonly ThinkingLevel[];
	writable: boolean;
	onPick: (level: ThinkingLevel) => void;
}): JSX.Element {
	const index = Math.max(0, levels.indexOf(level));
	const last = levels.length - 1;
	// One level is a point, not a line: dividing the groove by zero would put
	// NaN in the markup.
	const at = (i: number): string => (last > 0 ? `calc(13px + ${i} * (100% - 26px) / ${last})` : "50%");

	return (
		<>
			<div className="effort__ends">
				<span>Faster</span>
				<span className="spacer" />
				<span>Smarter</span>
			</div>
			<div className="effort__slider">
				<div className="effort__groove">
					<div className="effort__fill" style={{ width: at(index) }} />
				</div>
				{levels.map((name, i) => (
					<div key={name} className="effort__tick" title={name} style={{ left: at(i), background: i <= index ? "var(--fg-3)" : "var(--line-3)" }} />
				))}
				<div className="effort__knob" style={{ left: at(index) }} />
				{/* A real range input over the drawn one: dragging, clicking and the
				    arrow keys all come with it, and none of them need pointer maths. */}
				{writable ? (
					<input
						type="range"
						className="effort__range"
						min={0}
						max={last}
						step={1}
						value={index}
						aria-label="Thinking level"
						onChange={(e) => {
							const picked = levels[Number(e.target.value)];
							if (picked) onPick(picked);
						}}
					/>
				) : null}
			</div>
		</>
	);
}
