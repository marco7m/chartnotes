/**
 * Tests for additional utility functions
 */

import { describe, it, expect } from "vitest";

// Functions extracted from utils.ts
function matchPath(path: string, prefixes: string[]): boolean {
	if (!prefixes || prefixes.length === 0) return true;
	for (const p of prefixes) {
		if (p === ".") return true;
		const norm = p.endsWith("/") ? p : p + "/";
		if (path === p || path.startsWith(norm)) return true;
	}
	return false;
}

function matchTags(props: Record<string, any>, wanted: string[]): boolean {
	if (!wanted || wanted.length === 0) return true;
	const noteTags = props["tags"];
	if (!noteTags) return false;

	if (Array.isArray(noteTags)) {
		for (const w of wanted) {
			if (noteTags.includes(w)) return true;
			if (noteTags.includes("#" + w)) return true;
		}
		return false;
	}

	const s = String(noteTags);
	for (const w of wanted) {
		if (s.includes(w) || s.includes("#" + w)) return true;
	}
	return false;
}

describe("matchPath", () => {
	it("should return true when there are no prefixes", () => {
		expect(matchPath("qualquer/path", [])).toBe(true);
		expect(matchPath("qualquer/path", [])).toBe(true);
	});

	it("should return true for '.' (root)", () => {
		expect(matchPath("qualquer/path", ["."])).toBe(true);
		expect(matchPath("outro/path", ["."])).toBe(true);
	});

	it("should match exact prefixes", () => {
		expect(matchPath("projeto/nota.md", ["projeto"])).toBe(true);
		expect(matchPath("projeto/", ["projeto"])).toBe(true);
	});

	it("should match subfolders", () => {
		expect(matchPath("projeto/subpasta/nota.md", ["projeto"])).toBe(true);
		expect(matchPath("projeto/subpasta/outra/nota.md", ["projeto"])).toBe(true);
	});

	it("should not match different paths", () => {
		expect(matchPath("outro/nota.md", ["projeto"])).toBe(false);
		expect(matchPath("projeto2/nota.md", ["projeto"])).toBe(false);
	});

	it("should work with multiple prefixes", () => {
		expect(matchPath("projeto/nota.md", ["projeto", "outro"])).toBe(true);
		expect(matchPath("outro/nota.md", ["projeto", "outro"])).toBe(true);
		expect(matchPath("diferente/nota.md", ["projeto", "outro"])).toBe(false);
	});
});

describe("matchTags", () => {
	it("should return true when there are no wanted tags", () => {
		expect(matchTags({}, [])).toBe(true);
		expect(matchTags({ tags: ["work"] }, [])).toBe(true);
	});

	it("should return false when note has no tags", () => {
		expect(matchTags({}, ["work"])).toBe(false);
		expect(matchTags({ other: "value" }, ["work"])).toBe(false);
	});

	it("should match tags in array", () => {
		const props = { tags: ["work", "important"] };
		expect(matchTags(props, ["work"])).toBe(true);
		expect(matchTags(props, ["important"])).toBe(true);
		expect(matchTags(props, ["personal"])).toBe(false);
	});

	it("should match tags with #", () => {
		const props = { tags: ["#work", "#important"] };
		expect(matchTags(props, ["work"])).toBe(true);
		expect(matchTags(props, ["important"])).toBe(true);
	});

	it("should match tags as string", () => {
		const props = { tags: "work important" };
		expect(matchTags(props, ["work"])).toBe(true);
		expect(matchTags(props, ["important"])).toBe(true);
		expect(matchTags(props, ["personal"])).toBe(false);
	});

	it("should match tags as string containing #", () => {
		const props = { tags: "#work #important" };
		expect(matchTags(props, ["work"])).toBe(true);
		expect(matchTags(props, ["important"])).toBe(true);
	});
});

