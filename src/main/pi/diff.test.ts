import { describe, expect, it } from "vitest";
import { diffEdits, diffLines, diffWrite, previewLines, readEditPairs } from "./diff";

describe("diffLines", () => {
	it("keeps the common lines as context and marks only what changed", () => {
		const lines = diffLines("a\nb\nc", "a\nB\nc");
		expect(lines.map((l) => `${l.kind}:${l.text}`)).toEqual(["ctx:a", "del:b", "add:B", "ctx:c"]);
	});

	it("treats an insertion as additions only", () => {
		const lines = diffLines("a\nc", "a\nb\nc");
		expect(lines.filter((l) => l.kind === "del")).toHaveLength(0);
		expect(lines.filter((l) => l.kind === "add").map((l) => l.text)).toEqual(["b"]);
	});

	it("ignores the empty element a trailing newline leaves behind", () => {
		expect(diffLines("a\n", "a\n")).toEqual([{ kind: "ctx", text: "a" }]);
	});

	it("handles an empty side", () => {
		expect(diffLines("", "x").map((l) => l.kind)).toEqual(["add"]);
		expect(diffLines("x", "").map((l) => l.kind)).toEqual(["del"]);
	});
});

describe("diffEdits", () => {
	it("counts every replacement in the call", () => {
		const diff = diffEdits([
			{ oldText: "a", newText: "b" },
			{ oldText: "c\nd", newText: "c" },
		]);
		expect(diff.add).toBe(1);
		expect(diff.del).toBe(2);
	});

	it("is empty for a call with no edits", () => {
		expect(diffEdits([])).toEqual({ lines: [], add: 0, del: 0 });
	});
});

describe("diffWrite", () => {
	it("counts a whole file as additions", () => {
		const diff = diffWrite("one\ntwo\nthree");
		expect(diff).toMatchObject({ add: 3, del: 0 });
	});
});

describe("readEditPairs", () => {
	it("reads pi's edits array", () => {
		expect(readEditPairs({ edits: [{ oldText: "a", newText: "b" }] })).toEqual([{ oldText: "a", newText: "b" }]);
	});

	it("tolerates a shape it did not expect", () => {
		expect(readEditPairs(undefined)).toEqual([]);
		expect(readEditPairs({ edits: "nope" })).toEqual([]);
		expect(readEditPairs({ edits: [null, 3] })).toEqual([]);
		expect(readEditPairs({ edits: [{ oldText: 1 }] })).toEqual([{ oldText: "", newText: "" }]);
	});
});

describe("previewLines", () => {
	it("passes a short diff through untouched", () => {
		const lines = diffLines("a", "b");
		expect(previewLines(lines)).toEqual(lines);
	});

	it("caps a long one and says how much it hid", () => {
		const long = diffWrite(Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n")).lines;
		const preview = previewLines(long, 10);
		expect(preview).toHaveLength(11);
		expect(preview.at(-1)?.text).toBe("… 90 more lines");
	});
});
