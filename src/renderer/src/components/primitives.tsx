import type { JSX, ReactNode } from "react";
import type { DiffLine } from "@shared/model";
import { diffSign, fileExt, splitInlineCode } from "@/lib/format";
import { actions } from "@/lib/store";

/** Assistant prose: backticked spans become inline code. */
export function InlineText({ text, caret = false }: { text: string; caret?: boolean }): JSX.Element {
	return (
		<>
			{splitInlineCode(text).map((part, i) =>
				part.code ? (
					<span key={i} className="inline-code">
						{part.text}
					</span>
				) : (
					<span key={i}>{part.text}</span>
				),
			)}
			{caret ? <span className="caret" /> : null}
		</>
	);
}

export function ExtBadge({ path }: { path: string }): JSX.Element {
	const { ext, tint } = fileExt(path);
	return (
		<span className="ext" style={{ color: tint }}>
			{ext}
		</span>
	);
}

/** The compact diff under an EDIT card — no gutter, just the marker. */
export function InlineDiff({ lines }: { lines: readonly DiffLine[] }): JSX.Element {
	return (
		<div className="diff-inline">
			{lines.map((line, i) => (
				<div className="diff-inline__row" key={i}>
					<div className={`diff-inline__line diff-inline__line--${line.kind}`}>
						<span className="diff-inline__sign">{diffSign(line.kind)}</span>
						<span className="diff-inline__text">{line.text}</span>
					</div>
				</div>
			))}
		</div>
	);
}

/** Every menu closes the same way, so the popover owns the scrim. */
export function Menu({ className, width, children }: { className: string; width: number; children: ReactNode }): JSX.Element {
	return (
		<>
			<div className="menu-scrim" onClick={actions.closeMenus} />
			<div className={className} style={{ width }} role="menu">
				{children}
			</div>
		</>
	);
}

/** A tick, a name and a subtitle — the shape of every menu and settings row. */
export function TwoLine({ checked, name, sub }: { checked?: boolean; name: string; sub: string }): JSX.Element {
	return (
		<>
			<span className="menu__check">{checked ? "✓" : ""}</span>
			<span className="menu__body">
				<span className="menu__name">{name}</span>
				{sub ? <span className="menu__sub">{sub}</span> : null}
			</span>
		</>
	);
}

export function Chevron({ open }: { open: boolean }): JSX.Element {
	return <span className="chev">{open ? "▾" : "▸"}</span>;
}

/** The design's empty state. `tight` is the inspector's smaller variant. */
export function Blank({ title, text, tight = false }: { title: string; text: string; tight?: boolean }): JSX.Element {
	return (
		<div className={`blank${tight ? " blank--tight" : ""}`}>
			<div className="blank__title">{title}</div>
			<div className="blank__text">{text}</div>
		</div>
	);
}
