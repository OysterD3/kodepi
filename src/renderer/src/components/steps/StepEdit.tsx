import type { JSX } from "react";
import type { EditStep } from "@shared/model";
import { Chevron, InlineDiff } from "../primitives";
import { signedAdd, signedDel } from "@/lib/format";
import { actions, useStore } from "@/lib/store";

export function StepEdit({ step }: { step: EditStep }): JSX.Element {
	const open = useStore((s) => !!s.openSteps[step.id]);

	return (
		<div className="card edit">
			<button type="button" className="card__head" onClick={() => actions.toggleStep(step.id)}>
				<span className={`eyebrow${step.failed ? " eyebrow--bad" : ""}`}>EDIT</span>
				<span className="path">{step.file}</span>
				<span className="spacer" />
				<span className="add">{signedAdd(step.add)}</span>
				<span className="del">{signedDel(step.del)}</span>
				<Chevron open={open} />
			</button>
			{open ? <InlineDiff lines={step.diff} /> : null}
		</div>
	);
}
