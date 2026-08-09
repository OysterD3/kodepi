import type { JSX } from "react";
import type { ToolCallStep } from "@shared/model";

/**
 * Any tool the design has no card for — grep, find, ls, lsp_diagnostics.
 * It borrows the READ row so it still collapses into the merged tool group.
 */
export function StepTool({ step }: { step: ToolCallStep }): JSX.Element {
	return (
		<div className="read">
			<span className="eyebrow">{step.name}</span>
			{step.target ? <span className="path path--boxed">{step.target}</span> : null}
			<span className={`meta${step.failed ? " meta--bad" : ""}`}>{step.meta}</span>
		</div>
	);
}
