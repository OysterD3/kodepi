import type { JSX } from "react";
import type { RunStep } from "@shared/model";
import { Chevron } from "../primitives";
import { plural } from "@/lib/format";
import { actions, useStore } from "@/lib/store";

export function StepRun({ step }: { step: RunStep }): JSX.Element {
	const open = useStore((s) => !!s.openSteps[step.id]);
	const hasOutput = step.out.length > 0;

	// A command that printed nothing has nothing to disclose, so its head stays
	// a heading rather than a button that does nothing.
	if (!hasOutput) {
		return (
			<div className="run">
				<div className="run__head">
					<span className="run__label">RUN</span>
					<span className="run__cmd">{step.cmd}</span>
					<span className="spacer" />
					{step.failed ? <span className="run__exit run__exit--fail">failed</span> : null}
				</div>
			</div>
		);
	}

	return (
		<div className="run">
			<button type="button" className="run__head run__head--toggle" onClick={() => actions.toggleStep(step.id)}>
				<span className="run__label">RUN</span>
				<span className="run__cmd">{step.cmd}</span>
				<span className="spacer" />
				{step.failed ? <span className="run__exit run__exit--fail">failed</span> : null}
				<span className="run__meta">{plural(step.out.length, "line", "lines")}</span>
				<Chevron open={open} />
			</button>
			{open ? (
				<div className="run__body">
					{step.out.map((line, i) => (
						<div className={`run__line run__line--${line.kind}`} key={i}>
							<span>{line.text}</span>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
