import type { JSX } from "react";
import type { Step } from "@shared/model";
import { StepAdvise } from "./StepAdvise";
import { StepCompaction } from "./StepCompaction";
import { StepDone } from "./StepDone";
import { StepEdit } from "./StepEdit";
import { StepGroup } from "./StepGroup";
import { StepQuestion } from "./StepQuestion";
import { StepRead } from "./StepRead";
import { StepRun } from "./StepRun";
import { StepSpawn } from "./StepSpawn";
import { StepText } from "./StepText";
import { StepThink } from "./StepThink";
import { StepTool } from "./StepTool";
import { StepUser } from "./StepUser";
import { StepWorkflow } from "./StepWorkflow";
import type { Row } from "@/lib/rows";
import { useStore } from "@/lib/store";

function One({ step }: { step: Step }): JSX.Element | null {
	switch (step.kind) {
		case "user":
			return <StepUser step={step} />;
		case "text":
			return <StepText step={step} />;
		case "think":
			return <StepThink step={step} />;
		case "read":
			return <StepRead step={step} />;
		case "edit":
			return <StepEdit step={step} />;
		case "run":
			return <StepRun step={step} />;
		case "tool":
			return <StepTool step={step} />;
		case "spawn":
			return <StepSpawn step={step} />;
		case "advise":
			return <StepAdvise step={step} />;
		case "wf":
			return <StepWorkflow step={step} />;
		case "question":
			return <StepQuestion step={step} />;
		case "done":
			return <StepDone step={step} />;
		case "compaction":
			return <StepCompaction step={step} />;
	}
}

function Group({ row }: { row: Extract<Row, { type: "group" }> }): JSX.Element {
	const open = useStore((s) => !!s.openGroups[row.key]);
	return (
		<>
			<div className="step">
				<StepGroup row={row} open={open} />
			</div>
			{open
				? row.items.map((item) => (
						<div className="step" key={item.id}>
							<One step={item} />
						</div>
					))
				: null}
		</>
	);
}

export function StepRow({ row }: { row: Row }): JSX.Element {
	if (row.type === "group") return <Group row={row} />;
	return (
		<div className="step">
			<One step={row.step} />
		</div>
	);
}
