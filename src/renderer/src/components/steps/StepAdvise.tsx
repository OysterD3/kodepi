import type { JSX } from "react";
import type { AdviseStep } from "@shared/model";
import { Chevron } from "../primitives";
import { actions, useStore } from "@/lib/store";

export function StepAdvise({ step }: { step: AdviseStep }): JSX.Element {
	const open = useStore((s) => !!s.openSteps[step.id]);

	return (
		<div className="advise">
			<button type="button" className="advise__head" onClick={() => actions.toggleStep(step.id)}>
				<span className="advise__label">ADVISOR</span>
				<span className="advise__summary">{step.text}</span>
				<Chevron open={open} />
			</button>
			{open ? (
				<div className="advise__body">
					{step.body.map((para, i) => (
						<div className="advise__para" key={i}>
							{para}
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
