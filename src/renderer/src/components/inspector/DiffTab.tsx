import type { JSX } from "react";
import { Blank, ExtBadge } from "../primitives";
import { diffSign, signedAdd, signedDel } from "@/lib/format";
import { NO_FILES, actions, currentSession, useStore } from "@/lib/store";

export function DiffTab(): JSX.Element {
	const files = useStore((s) => currentSession(s)?.files ?? NO_FILES);
	const fileIdx = useStore((s) => s.fileIdx);

	const hunks = files[fileIdx]?.hunks ?? [];
	const totalAdd = files.reduce((n, f) => n + f.add, 0);
	const totalDel = files.reduce((n, f) => n + f.del, 0);

	return (
		<>
			<div className="difflist">
				<div className="difflist__head">
					<span className="section-label">CHANGES</span>
					<span className="spacer" />
					{files.length > 0 ? (
						<>
							<span className="add">{signedAdd(totalAdd)}</span>
							<span className="del">{signedDel(totalDel)}</span>
						</>
					) : null}
				</div>

				<div className="difflist__files">
					{files.map((file, i) => (
						<button
							type="button"
							className={`filerow${fileIdx === i ? " filerow--active" : ""}`}
							key={file.path}
							onClick={() => actions.setFileIdx(i)}
							title={file.path}
						>
							<ExtBadge path={file.path} />
							<span className="filerow__path">{file.path}</span>
							<span className="filerow__add">{signedAdd(file.add)}</span>
							<span className="filerow__del">{signedDel(file.del)}</span>
						</button>
					))}
				</div>
			</div>

			<div className="hunks">
				{hunks.map((line, i) => (
					<div className="hunk" key={i}>
						{line.kind === "hdr" ? (
							<div className="hunk__hdr">{line.text}</div>
						) : (
							<div className={`hunk__line hunk__line--${line.kind}`}>
								<span className="hunk__sign">{diffSign(line.kind)}</span>
								<span className="hunk__text">{line.text}</span>
							</div>
						)}
					</div>
				))}

				{files.length === 0 ? (
					<Blank title="NO EDITS IN THIS SESSION" text="Every file pi edited or wrote here would be listed above." />
				) : null}
			</div>

			{files.length > 0 ? (
				<div className="diffbar">
					<span className="hint">pi records the replaced text, not where it sat — so these hunks carry no file line numbers.</span>
					<span className="spacer" />
					<span className="hint">
						{fileIdx + 1} of {files.length}
					</span>
				</div>
			) : null}
		</>
	);
}
