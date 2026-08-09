import type { JSX } from "react";
import type { ThinkStep } from "@shared/model";
import { Chevron } from "../primitives";
import { actions, useStore } from "@/lib/store";

export function StepThink({ step }: { step: ThinkStep }): JSX.Element {
	const open = useStore((s) => !!s.openSteps[step.id]);

	return (
		<div>
			<button type="button" className="disclosure" onClick={() => actions.toggleStep(step.id)}>
				<span className="eyebrow">THINKING</span>
				<span className="think__text">{step.text}</span>
				<span className="meta">{step.meta}</span>
				<Chevron open={open} />
			</button>
			{open ? (
				<div className="think__body">
					{step.body.map((para, i) => (
						<div className="think__para" key={i}>
							{para}
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
