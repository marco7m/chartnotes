/**
 * Testes para funções utilitárias adicionais
 */

import { describe, it, expect } from "vitest";

// Funções extraídas de utils.ts
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
	it("deve retornar true quando não há prefixos", () => {
		expect(matchPath("qualquer/path", [])).toBe(true);
		expect(matchPath("qualquer/path", [])).toBe(true);
	});

	it("deve retornar true para '.' (raiz)", () => {
		expect(matchPath("qualquer/path", ["."])).toBe(true);
		expect(matchPath("outro/path", ["."])).toBe(true);
	});

	it("deve fazer match com prefixos exatos", () => {
		expect(matchPath("projeto/nota.md", ["projeto"])).toBe(true);
		expect(matchPath("projeto/", ["projeto"])).toBe(true);
	});

	it("deve fazer match com subpastas", () => {
		expect(matchPath("projeto/subpasta/nota.md", ["projeto"])).toBe(true);
		expect(matchPath("projeto/subpasta/outra/nota.md", ["projeto"])).toBe(true);
	});

	it("não deve fazer match com paths diferentes", () => {
		expect(matchPath("outro/nota.md", ["projeto"])).toBe(false);
		expect(matchPath("projeto2/nota.md", ["projeto"])).toBe(false);
	});

	it("deve funcionar com múltiplos prefixos", () => {
		expect(matchPath("projeto/nota.md", ["projeto", "outro"])).toBe(true);
		expect(matchPath("outro/nota.md", ["projeto", "outro"])).toBe(true);
		expect(matchPath("diferente/nota.md", ["projeto", "outro"])).toBe(false);
	});
});

describe("matchTags", () => {
	it("deve retornar true quando não há tags desejadas", () => {
		expect(matchTags({}, [])).toBe(true);
		expect(matchTags({ tags: ["work"] }, [])).toBe(true);
	});

	it("deve retornar false quando nota não tem tags", () => {
		expect(matchTags({}, ["work"])).toBe(false);
		expect(matchTags({ other: "value" }, ["work"])).toBe(false);
	});

	it("deve fazer match com tags em array", () => {
		const props = { tags: ["work", "important"] };
		expect(matchTags(props, ["work"])).toBe(true);
		expect(matchTags(props, ["important"])).toBe(true);
		expect(matchTags(props, ["personal"])).toBe(false);
	});

	it("deve fazer match com tags com #", () => {
		const props = { tags: ["#work", "#important"] };
		expect(matchTags(props, ["work"])).toBe(true);
		expect(matchTags(props, ["important"])).toBe(true);
	});

	it("deve fazer match com tags como string", () => {
		const props = { tags: "work important" };
		expect(matchTags(props, ["work"])).toBe(true);
		expect(matchTags(props, ["important"])).toBe(true);
		expect(matchTags(props, ["personal"])).toBe(false);
	});

	it("deve fazer match com tags como string contendo #", () => {
		const props = { tags: "#work #important" };
		expect(matchTags(props, ["work"])).toBe(true);
		expect(matchTags(props, ["important"])).toBe(true);
	});
});

