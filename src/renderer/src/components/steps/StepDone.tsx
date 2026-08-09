import type { JSX } from "react";
import { useMemo, useState } from "react";
import type { DoneStep } from "@shared/model";
import { FolderIcon } from "../icons";
import { Chevron, ExtBadge } from "../primitives";
import { buildTree, formatDuration, signedAdd, signedDel, treePad, visibleRows } from "@/lib/format";
import { actions } from "@/lib/store";

export function StepDone({ step }: { step: DoneStep }): JSX.Element {
	const rows = useMemo(() => buildTree(step.files), [step.files]);
	// Folder keys the reader has folded away. Local, not store state: a store
	// write wakes every mounted step in the transcript.
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
	const shown = useMemo(() => visibleRows(rows, collapsed), [rows, collapsed]);
	const duration = formatDuration(step.durationMs);

	function toggle(key: string): void {
		setCollapsed((old) => {
			const next = new Set(old);
			if (!next.delete(key)) next.add(key);
			return next;
		});
	}

	// A turn that changed nothing gets a one-line footer, not a file card.
	if (step.files.length === 0) {
		return (
			<div className="done__foot">
				<span>Turn finished</span>
				{duration ? (
					<>
						<span>·</span>
						<span>{duration}</span>
					</>
				) : null}
			</div>
		);
	}

	return (
		<div>
			<div className="card done__card">
				<div className="done__head">
					<span className="section-label">CHANGED FILES ({step.files.length})</span>
					<span className="hint">·</span>
					<span className="add">{signedAdd(step.add)}</span>
					<span className="del">{signedDel(step.del)}</span>
					<span className="spacer" />
					<button type="button" className="btn btn--outline btn--sm" onClick={actions.showDiff}>
						View diff
					</button>
				</div>

				<div className="done__tree">
					{shown.map((row) =>
						row.folder ? (
							<button
								type="button"
								className="tree__row"
								key={row.key}
								style={{ paddingLeft: treePad(row.depth) }}
								onClick={() => toggle(row.key)}
							>
								<Chevron open={!collapsed.has(row.key)} />
								<FolderIcon />
								<span className="tree__name tree__name--folder">{row.name}</span>
							</button>
						) : (
							<div className="tree__row" key={row.key} style={{ paddingLeft: treePad(row.depth) }}>
								<span className="chev" />
								<ExtBadge path={row.key} />
								<span className="tree__name tree__name--file">{row.name}</span>
								<span className="spacer" />
								<span className="add">{row.add}</span>
								<span className="del" style={{ paddingRight: 4 }}>
									{row.del}
								</span>
							</div>
						),
					)}
				</div>
			</div>

			{duration ? <div className="done__foot">{duration}</div> : null}
		</div>
	);
}
