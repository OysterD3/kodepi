import type { JSX } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "./icons";
import { basename, formatAgo } from "@/lib/format";
import { actions, useStore } from "@/lib/store";

const MAX_ROWS = 50;

export function CommandPalette(): JSX.Element {
	const projects = useStore((s) => s.projects);
	const summaries = useStore((s) => s.summaries);
	const [query, setQuery] = useState("");
	const [cursor, setCursor] = useState(0);
	const input = useRef<HTMLInputElement>(null);

	// Rebuilt only when the scan changes, not on every keystroke or hover.
	const ordered = useMemo(() => {
		const projectOf = new Map(projects.flatMap((p) => p.sessionIds.map((id) => [id, p.id])));
		return Object.values(summaries)
			.sort((a, b) => b.modified - a.modified)
			.map((session) => ({ session, project: basename(projectOf.get(session.id) ?? "") }));
	}, [projects, summaries]);

	const needle = query.trim().toLowerCase();
	const rows = useMemo(
		() =>
			ordered
				.filter((row) => needle === "" || row.session.title.toLowerCase().includes(needle) || row.project.toLowerCase().includes(needle))
				.slice(0, MAX_ROWS),
		[ordered, needle],
	);

	useEffect(() => {
		input.current?.focus();
	}, []);

	const now = Date.now();

	return (
		<div className="scrim scrim--palette" onClick={actions.closePalette}>
			<div className="palette" onClick={(e) => e.stopPropagation()}>
				<div className="palette__head">
					<SearchIcon size={15} />
					<input
						ref={input}
						className="palette__input"
						value={query}
						placeholder="Jump to a session…"
						onChange={(e) => {
							setQuery(e.target.value);
							setCursor(0);
						}}
						onKeyDown={(e) => {
							if (e.key === "ArrowDown") {
								e.preventDefault();
								setCursor((c) => Math.min(c + 1, rows.length - 1));
							}
							if (e.key === "ArrowUp") {
								e.preventDefault();
								setCursor((c) => Math.max(c - 1, 0));
							}
							if (e.key === "Enter") {
								e.preventDefault();
								const row = rows[cursor];
								if (row) void actions.openSession(row.session.id);
							}
						}}
					/>
				</div>

				<div className="palette__body">
					<div className="palette__group">SESSIONS</div>
					{rows.map((row, i) => (
						<button
							type="button"
							className={`palette__row${i === cursor ? " palette__row--cursor" : ""}`}
							key={row.session.id}
							onClick={() => void actions.openSession(row.session.id)}
							onMouseEnter={() => setCursor(i)}
						>
							<span className={`dot ${row.session.status === "error" ? "dot--bad" : "dot--idle"}`} />
							<span className="palette__title">{row.session.title}</span>
							<span className="palette__project">{row.project}</span>
							<span className="spacer" />
							<span className="palette__branch">{formatAgo(row.session.modified, now)}</span>
						</button>
					))}
				</div>

				<div className="palette__foot">
					<span>↑↓ navigate</span>
					<span>⏎ open</span>
					<span>esc close</span>
				</div>
			</div>
		</div>
	);
}
