import { describe, expect, it } from "vitest";
import { buildTree, diffSign, fileExt, formatAgo, formatDuration, formatTokens, plural, splitInlineCode, treePad, visibleRows } from "./format";

describe("splitInlineCode", () => {
	it("marks backticked segments as code", () => {
		expect(splitInlineCode("call `format()` first")).toEqual([
			{ code: false, text: "call " },
			{ code: true, text: "format()" },
			{ code: false, text: " first" },
		]);
	});

	it("drops empty segments so a leading backtick makes no blank span", () => {
		expect(splitInlineCode("`a` b")).toEqual([
			{ code: true, text: "a" },
			{ code: false, text: " b" },
		]);
	});
});

describe("fileExt", () => {
	it("uppercases and truncates to three characters", () => {
		expect(fileExt("src/a/b.tsx")).toEqual({ ext: "TSX", tint: "#38bdf8" });
		expect(fileExt("x.json").ext).toBe("JSO");
	});

	it("falls back for a file with no extension", () => {
		expect(fileExt("Makefile")).toEqual({ ext: "?", tint: "#8a8a8a" });
	});
});

describe("buildTree", () => {
	const files = [
		{ path: "src/lib/money.ts", add: 18, del: 6 },
		{ path: "src/lib/redis.ts", add: 36, del: 8 },
		{ path: "README.md", add: 2, del: 0 },
	];

	it("emits each folder once, and counts only beside a file", () => {
		const rows = buildTree(files);
		const folders = rows.filter((r) => r.folder);
		expect(folders.map((f) => f.name)).toEqual(["src", "lib"]);
		expect(folders.every((f) => f.add === "" && f.del === "")).toBe(true);
		expect(rows.find((r) => r.name === "money.ts")).toMatchObject({ add: "+18", del: "−6" });
	});

	it("points every row at the folder above it", () => {
		const rows = buildTree(files);
		expect(rows.map((r) => [r.key, r.parent])).toEqual([
			["README.md", ""],
			["src", ""],
			["src/lib", "src"],
			["src/lib/money.ts", "src/lib"],
			["src/lib/redis.ts", "src/lib"],
		]);
	});

	it("keeps every file, sorted, under its own folder", () => {
		const rows = buildTree(files);
		expect(rows.filter((r) => !r.folder).map((r) => r.name)).toEqual(["README.md", "money.ts", "redis.ts"]);
	});

	it("indents by depth", () => {
		expect(treePad(0)).toBe("12px");
		expect(treePad(2)).toBe("48px");
	});

	it("handles an empty list", () => {
		expect(buildTree([])).toEqual([]);
	});
});

describe("numbers and clocks", () => {
	it("switches to k above a thousand tokens", () => {
		expect(formatTokens(999)).toBe("999");
		expect(formatTokens(12400)).toBe("12.4k");
	});

	it("is empty when no duration was recorded", () => {
		expect(formatDuration(0)).toBe("");
	});

	it("switches from seconds to minutes at a minute", () => {
		expect(formatDuration(6602)).toBe("6.6s");
		expect(formatDuration(281_000)).toBe("4m 41s");
	});
});

describe("formatAgo", () => {
	const now = Date.UTC(2026, 0, 10, 12, 0, 0);
	const ago = (ms: number): string => formatAgo(now - ms, now);

	it("reads as a glance, not a timestamp", () => {
		expect(ago(0)).toBe("now");
		expect(ago(5 * 60_000)).toBe("5m");
		expect(ago(3 * 3_600_000)).toBe("3h");
		expect(ago(2 * 86_400_000)).toBe("2d");
		expect(ago(90 * 86_400_000)).toBe("3mo");
	});

	it("never reads as the future", () => {
		expect(formatAgo(now + 10_000, now)).toBe("now");
	});
});

describe("small helpers", () => {
	it("signs a diff line by its kind", () => {
		expect(diffSign("add")).toBe("+");
		expect(diffSign("del")).toBe("−");
		expect(diffSign("ctx")).toBe(" ");
	});

	it("pluralises on the count", () => {
		expect(plural(1, "agent", "agents")).toBe("1 agent");
		expect(plural(0, "agent", "agents")).toBe("0 agents");
	});
});

describe("visibleRows", () => {
	const rows = buildTree([
		{ path: "src/lib/money.ts", add: 1, del: 0 },
		{ path: "src/app.ts", add: 1, del: 0 },
		{ path: "README.md", add: 1, del: 0 },
	]);

	it("shows every row when nothing is collapsed", () => {
		expect(visibleRows(rows, new Set())).toEqual(rows);
	});

	it("keeps the collapsed folder and hides the branch under it", () => {
		const shown = visibleRows(rows, new Set(["src"])).map((r) => r.key);
		expect(shown).toEqual(["README.md", "src"]);
	});

	it("hides a nested folder's own children too", () => {
		const shown = visibleRows(rows, new Set(["src/lib"])).map((r) => r.key);
		expect(shown).toEqual(["README.md", "src", "src/app.ts", "src/lib"]);
	});

	it("hides a file that the sort put between two rows of its folder", () => {
		// "a.p" can sort between "a/m.ts" and "a/z.ts", so a branch is not
		// always one unbroken run of rows.
		const mixed = buildTree([
			{ path: "a/m.ts", add: 1, del: 0 },
			{ path: "a.p", add: 1, del: 0 },
			{ path: "a/z.ts", add: 1, del: 0 },
		]);
		const shown = visibleRows(mixed, new Set(["a"])).map((r) => r.key);
		expect(shown).not.toContain("a/z.ts");
		expect(shown).toContain("a.p");
	});

	it("matches on the folder, not on the path text", () => {
		// The file key keeps the leading slash the folder key drops.
		const absolute = buildTree([{ path: "/etc/hosts", add: 1, del: 0 }]);
		expect(visibleRows(absolute, new Set(["etc"])).map((r) => r.key)).toEqual(["etc"]);
	});
});

describe("buildTree, with the paths pi actually records", () => {
	it("does not invent a nameless root folder for an absolute path", () => {
		const rows = buildTree([{ path: "/etc/hosts", add: 1, del: 0 }]);
		expect(rows.filter((r) => r.folder).map((r) => r.name)).toEqual(["etc"]);
		expect(rows.every((r) => r.name !== "")).toBe(true);
	});

	it("indents from the first real segment", () => {
		const rows = buildTree([{ path: "/a/b.ts", add: 1, del: 0 }]);
		expect(rows[0]).toMatchObject({ folder: true, name: "a", depth: 0 });
		expect(rows[1]).toMatchObject({ folder: false, name: "b.ts", depth: 1 });
	});
});
