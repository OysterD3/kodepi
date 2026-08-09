import type { JSX } from "react";
import type { CompactionStep } from "@shared/model";
import { Chevron } from "../primitives";
import { actions, useStore } from "@/lib/store";

/** pi compacted the context here, and kept a summary of what it dropped. */
export function StepCompaction({ step }: { step: CompactionStep }): JSX.Element {
	const open = useStore((s) => !!s.openSteps[step.id]);

	return (
		<div>
			<button type="button" className="disclosure" onClick={() => actions.toggleStep(step.id)}>
				<span className="eyebrow">COMPACTED</span>
				<span className="think__text">The context was summarised here</span>
				<Chevron open={open} />
			</button>
			{open ? (
				<div className="think__body">
					<div className="think__para" style={{ whiteSpace: "pre-wrap" }}>
						{step.summary}
					</div>
				</div>
			) : null}
		</div>
	);
}
