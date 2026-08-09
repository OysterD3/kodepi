/** Every glyph in the design, traced from the source at its own size. */

import type { JSX } from "react";

export function SearchIcon({ size = 14 }: { size?: number }): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" strokeWidth="2.2" strokeLinecap="round" style={{ flex: "none" }}>
			<circle cx="11" cy="11" r="7" />
			<path d="m20 20-3.5-3.5" />
		</svg>
	);
}

export function FolderIcon(): JSX.Element {
	return (
		<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--fg-3)" strokeWidth="1.4" strokeLinejoin="round" style={{ flex: "none" }}>
			<path d="M1.8 4.2A1.4 1.4 0 0 1 3.2 2.8h2.4l1.3 1.6h5.9a1.4 1.4 0 0 1 1.4 1.4v6a1.4 1.4 0 0 1-1.4 1.4H3.2a1.4 1.4 0 0 1-1.4-1.4z" />
		</svg>
	);
}

/** This machine — the only place kodepi runs pi. */
export function MachineIcon(): JSX.Element {
	return (
		<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--fg-3)" strokeWidth="1.4" strokeLinejoin="round" style={{ flex: "none" }}>
			<rect x="1.8" y="3" width="12.4" height="8" rx="1.4" />
			<path d="M5.5 13.4h5" />
		</svg>
	);
}

export function PlusIcon(): JSX.Element {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--fg-2)" strokeWidth="1.6" strokeLinecap="round" style={{ flex: "none" }}>
			<path d="M8 3.2v9.6M3.2 8h9.6" />
		</svg>
	);
}

export function SkillIcon(): JSX.Element {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--fg-2)" strokeWidth="1.4" strokeLinejoin="round" style={{ flex: "none" }}>
			<path d="M8 1.9 14 5v6l-6 3.1L2 11V5z" />
			<path d="M8 8.1 14 5M8 8.1v6M8 8.1 2 5" />
		</svg>
	);
}

export function GearIcon(): JSX.Element {
	return (
		<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--fg-2)" strokeWidth="1.7" style={{ flex: "none" }}>
			<circle cx="12" cy="12" r="3" />
			<path d="M12 2v3m0 14v3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M2 12h3m14 0h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
		</svg>
	);
}

export function PanelIcon(): JSX.Element {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
			<rect x="1.5" y="2.5" width="13" height="11" rx="2" />
			<path d="M10.5 2.5v11" />
		</svg>
	);
}

export function LinesIcon(): JSX.Element {
	return (
		<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
			<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" />
		</svg>
	);
}

export function BranchIcon({ size = 12, stroke = "var(--fg-3)" }: { size?: number; stroke?: string }): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={stroke} strokeWidth={size > 11 ? 1.5 : 1.6} style={{ flex: "none" }}>
			<circle cx="4" cy="3.5" r="2" />
			<circle cx="4" cy="12.5" r="2" />
			<circle cx="12" cy="8" r="2" />
			<path d="M4 5.5v5M6 8h4" />
		</svg>
	);
}

export function LockIcon(): JSX.Element {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--fg-3)" strokeWidth="1.5" strokeLinejoin="round" style={{ flex: "none" }}>
			<rect x="3" y="7" width="10" height="7" rx="1.6" />
			<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
		</svg>
	);
}

export function SendIcon(): JSX.Element {
	return (
		<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--on-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
			<path d="M8 13V3.5" />
			<path d="m4 7.5 4-4 4 4" />
		</svg>
	);
}

export function ExpandIcon(): JSX.Element {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
			<path d="M6.5 3 2 8l4.5 5M9.5 3 14 8l-4.5 5" />
		</svg>
	);
}
