import type { JSX } from "react";
import { Chevron } from "../primitives";
import { signedAdd, signedDel } from "@/lib/format";
import { type GroupRow, summariseGroup } from "@/lib/rows";
import { actions } from "@/lib/store";

export function StepGroup({ row, open }: { row: GroupRow; open: boolean }): JSX.Element {
	const summary = summariseGroup(row.items);

	return (
		<button type="button" className="disclosure" onClick={() => actions.toggleGroup(row.key)}>
			<span className="group__count">{summary.count}</span>
			<span className="group__text">{summary.text}</span>
			{summary.hasDiff ? (
				<>
					<span className="add">{signedAdd(summary.add)}</span>
					<span className="del">{signedDel(summary.del)}</span>
				</>
			) : null}
			<Chevron open={open} />
		</button>
	);
}
