import type { JSX } from "react";
import type { ReadStep } from "@shared/model";

export function StepRead({ step }: { step: ReadStep }): JSX.Element {
	return (
		<div className="read">
			<span className="eyebrow">READ</span>
			<span className="path path--boxed">{step.file}</span>
			<span className={`meta${step.failed ? " meta--bad" : ""}`}>{step.meta}</span>
		</div>
	);
}
