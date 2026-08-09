import { useEffect } from "react";
import { actions, getState } from "./store";

/** ⌘K opens the palette; esc backs out of whatever is on top. */
export function useHotkeys(): void {
	useEffect(() => {
		const onKey = (e: KeyboardEvent): void => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				const { palette } = getState();
				if (palette) actions.closePalette();
				else actions.openPalette();
				return;
			}
			if (e.key === "Escape") {
				const { palette, settingsOpen, menu } = getState();
				if (palette) actions.closePalette();
				if (settingsOpen) actions.closeSettings();
				if (menu) actions.closeMenus();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);
}
