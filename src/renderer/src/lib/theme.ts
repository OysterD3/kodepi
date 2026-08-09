/**
 * Which appearance the app paints in.
 *
 * `auto` is macOS's own setting, which reaches the renderer as a media query —
 * Chromium tracks the system appearance, so nothing has to cross from the main
 * process. `night` and `day` override it and ignore the system entirely.
 */

import type { Theme } from "@shared/model";

/** What `auto` resolves to. Never `auto` itself. */
export type Appearance = "night" | "day";

const DARK = "(prefers-color-scheme: dark)";

/** The order the titlebar button cycles through. */
export const THEMES: readonly Theme[] = ["auto", "night", "day"];

function media(): MediaQueryList | null {
	return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(DARK) : null;
}

/** Whether macOS is in dark appearance. Dark when there is nothing to ask. */
export function prefersDark(): boolean {
	return media()?.matches ?? true;
}

export function resolveTheme(theme: Theme, dark: boolean): Appearance {
	return theme === "auto" ? (dark ? "night" : "day") : theme;
}

export function nextTheme(theme: Theme): Theme {
	return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] ?? "auto";
}

/** Report every macOS appearance change until the returned function is called. */
export function watchAppearance(onChange: (dark: boolean) => void): () => void {
	const query = media();
	if (!query) return () => undefined;
	const listener = (event: MediaQueryListEvent): void => onChange(event.matches);
	query.addEventListener("change", listener);
	return () => query.removeEventListener("change", listener);
}
