import type { JSX } from "react";
import type { TextStep } from "@shared/model";
import { InlineText } from "../primitives";

export function StepText({ step }: { step: TextStep }): JSX.Element {
	return (
		<div className="prose">
			<InlineText text={step.text} caret={step.streaming} />
		</div>
	);
}
