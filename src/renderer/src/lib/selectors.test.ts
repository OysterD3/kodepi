/**
 * A guard for one specific mistake.
 *
 * `useSyncExternalStore` compares snapshots by identity, so a selector that
 * allocates a fresh array or object each call re-renders for ever. React only
 * reports it at runtime, and `renderToStaticMarkup` cannot see it — so this
 * checks the source instead.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENTS = join(__dirname, "..", "components");

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sources(path);
		return name.endsWith(".tsx") ? [path] : [];
	});
}

/** `useStore(...)` call bodies, up to the closing paren of the arrow. */
function selectorBodies(source: string): string[] {
	return [...source.matchAll(/useStore\(\((\w+)\) =>([^\n]*)\)/g)].map((m) => m[2] ?? "");
}

describe("useStore selectors", () => {
	const files = sources(COMPONENTS);

	it("finds the components to check", () => {
		expect(files.length).toBeGreaterThan(10);
	});

	it("never allocate a fresh array or object inside getSnapshot", () => {
		const offenders: string[] = [];
		for (const file of files) {
			for (const body of selectorBodies(readFileSync(file, "utf8"))) {
				// `?? NO_FILES` is fine; `?? []` and `?? {}` are not.
				if (/\?\?\s*(\[\]|\{\})/.test(body) || /=>\s*(\[\]|\{\s*\w+:)/.test(body)) {
					offenders.push(`${file}: ${body.trim()}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
