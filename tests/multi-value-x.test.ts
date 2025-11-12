/**
 * Tests for multi-value X handling (pie charts, tags, lists)
 */

import { describe, it, expect } from "vitest";

// Extract multi-value X handling from bases-view.ts
function parseDate(raw: string | null): Date | null {
	if (!raw) return null;
	const d = new Date(raw.trim());
	return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function bucketX(rawX: string, mode: "auto" | "none" | "day" | "week" | "month" | "quarter" | "year"): string {
	const d = parseDate(rawX);
	if (!d) return rawX;

	switch (mode) {
		case "none":
			return rawX;
		case "auto":
		case "day": {
			const s = fmtDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
			return s;
		}
		case "month": {
			const m = String(d.getMonth() + 1).padStart(2, "0");
			return `${d.getFullYear()}-${m}`;
		}
		case "year":
			return `${d.getFullYear()}`;
		default:
			return rawX;
	}
}

const MISSING_LABEL = "(missing)";

interface SelectedProp {
	id: string | null;
	name: string | null;
}

interface MockEntry {
	file?: {
		name?: string;
		path?: string;
	};
	[key: string]: any;
}

/**
 * Mock version of readValue from bases-view.ts
 */
function readValue(entry: MockEntry, prop: SelectedProp): string | null {
	if (!prop.id) return null;

	let value: any;
	try {
		value = entry[prop.id];
	} catch {
		return null;
	}

	if (!value) return null;

	try {
		if (typeof value.isEmpty === "function" && value.isEmpty()) {
			return null;
		}
	} catch {}

	try {
		const s = value.toString();
		if (s == null) return null;
		const trimmed = String(s).trim();
		return trimmed.length ? trimmed : null;
	} catch {
		return null;
	}
}

/**
 * Core multi-value X extraction logic
 */
function getXValuesForEntry(
	entry: MockEntry,
	xProp: SelectedProp,
	xBucket: "auto" | "none" | "day" | "week" | "month" | "quarter" | "year",
	multi: boolean
): string[] {
	const values: string[] = [];

	const applyBucket = (value: string) => bucketX(value, xBucket);

	// If no X property defined, use file name/path
	if (!xProp.id) {
		const file = entry.file;
		const raw = file?.name
			? String(file.name)
			: String(file?.path ?? MISSING_LABEL);
		values.push(applyBucket(raw));
		return values;
	}

	// Simple case: don't explode multi-values (bars/lines/etc.)
	if (!multi) {
		const value = readValue(entry, xProp) ?? MISSING_LABEL;
		values.push(applyBucket(value));
		return values;
	}

	// multi = true → try to explode multi-value (tags, lists, etc.)
	let raw: any = null;
	try {
		raw = entry[xProp.id];
	} catch {
		raw = null;
	}

	const pushStr = (s: string | null | undefined) => {
		if (!s) return;
		const trimmed = String(s).trim();
		if (!trimmed) return;
		values.push(applyBucket(trimmed));
	};

	if (raw == null) {
		pushStr(MISSING_LABEL);
	} else if (typeof raw === "string") {
		// Heuristic for multi-tag/string values: "#tag1 #tag2 ..."
		const trimmed = raw.trim();
		if (trimmed) {
			const parts = trimmed.split(/\s+/);
			for (const part of parts) {
				pushStr(part);
			}
		}
	} else if (Array.isArray(raw)) {
		for (const item of raw) {
			if (item == null) continue;
			let s: string;
			try {
				s = item.toString();
			} catch {
				continue;
			}
			pushStr(s);
		}
	} else if (typeof (raw as any).toArray === "function") {
		const arr = (raw as any).toArray();
		if (Array.isArray(arr)) {
			for (const item of arr) {
				if (item == null) continue;
				let s: string;
				try {
					s = item.toString();
				} catch {
					continue;
				}
				pushStr(s);
			}
		} else {
			let s: string;
			try {
				s = (raw as any).toString();
			} catch {
				s = "";
			}
			pushStr(s);
		}
	} else {
		let s: string;
		try {
			s = (raw as any).toString();
		} catch {
			s = "";
		}
		pushStr(s);
	}

	if (!values.length) {
		pushStr(MISSING_LABEL);
	}

	return values;
}

describe("Multi-Value X Handling", () => {
	describe("single value (multi = false)", () => {
		it("should retornar valor simples quando multi = false", () => {
			const entry = { priority: "high" };
			const xProp = { id: "priority", name: "priority" };

			const result = getXValuesForEntry(entry, xProp, "none", false);

			expect(result).toEqual(["high"]);
		});

		it("should usar MISSING_LABEL para valores vazios", () => {
			const entry = { priority: "" };
			const xProp = { id: "priority", name: "priority" };

			const result = getXValuesForEntry(entry, xProp, "none", false);

			expect(result).toEqual(["(missing)"]);
		});

		it("should usar MISSING_LABEL para propriedades inexistentes", () => {
			const entry = {};
			const xProp = { id: "priority", name: "priority" };

			const result = getXValuesForEntry(entry, xProp, "none", false);

			expect(result).toEqual(["(missing)"]);
		});

		it("should usar nome do arquivo quando xProp.id é null", () => {
			const entry = { file: { name: "My Note.md" } };
			const xProp = { id: null, name: null };

			const result = getXValuesForEntry(entry, xProp, "none", false);

			expect(result).toEqual(["My Note.md"]);
		});

		it("should usar path do arquivo quando nome não existe", () => {
			const entry = { file: { path: "vault/My Note.md" } };
			const xProp = { id: null, name: null };

			const result = getXValuesForEntry(entry, xProp, "none", false);

			expect(result).toEqual(["vault/My Note.md"]);
		});
	});

	describe("multi-value (multi = true)", () => {
		it("should dividir strings por espaços (tags)", () => {
			const entry = { tags: "#work #important #urgent" };
			const xProp = { id: "tags", name: "tags" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["#work", "#important", "#urgent"]);
		});

		it("should dividir strings sem # também", () => {
			const entry = { categories: "work personal project" };
			const xProp = { id: "categories", name: "categories" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["work", "personal", "project"]);
		});

		it("should lidar com arrays de strings", () => {
			const entry = { tags: ["work", "important", "urgent"] };
			const xProp = { id: "tags", name: "tags" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["work", "important", "urgent"]);
		});

		it("should converter items de array para string", () => {
			const entry = { priorities: [1, 2, 3] };
			const xProp = { id: "priorities", name: "priorities" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["1", "2", "3"]);
		});

		it("should ignorar null/undefined em arrays", () => {
			const entry = { tags: ["work", null, "urgent", undefined] };
			const xProp = { id: "tags", name: "tags" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["work", "urgent"]);
		});

		it("should usar MISSING_LABEL para arrays vazios", () => {
			const entry = { tags: [] };
			const xProp = { id: "tags", name: "tags" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["(missing)"]);
		});

		it("should lidar com objetos que têm toArray()", () => {
			const mockArrayLike = {
				toArray: () => ["item1", "item2"]
			};
			const entry = { items: mockArrayLike };
			const xProp = { id: "items", name: "items" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["item1", "item2"]);
		});

		it("should converter outros objetos para string", () => {
			const entry = { data: { toString: () => "converted" } };
			const xProp = { id: "data", name: "data" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["converted"]);
		});

		it("should usar MISSING_LABEL quando não consegue converter", () => {
			const mockBadObject = {
				toString: () => { throw new Error("fail"); }
			};
			const entry = { bad: mockBadObject };
			const xProp = { id: "bad", name: "bad" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["(missing)"]);
		});
	});

	describe("date bucketing", () => {
		it("should aplicar bucketing de data quando multi = false", () => {
			const entry = { date: "2024-01-15T10:30:00Z" };
			const xProp = { id: "date", name: "date" };

			const result = getXValuesForEntry(entry, xProp, "day", false);

			expect(result).toEqual(["2024-01-15"]);
		});

		it("should aplicar bucketing de data quando multi = true", () => {
			const entry = { dates: ["2024-01-15", "2024-02-20"] };
			const xProp = { id: "dates", name: "dates" };

			const result = getXValuesForEntry(entry, xProp, "month", true);

			expect(result).toEqual(["2024-01", "2024-02"]);
		});

		it("should manter valores não-data como estão", () => {
			const entry = { tags: ["work", "personal"] };
			const xProp = { id: "tags", name: "tags" };

			const result = getXValuesForEntry(entry, xProp, "day", true);

			expect(result).toEqual(["work", "personal"]);
		});
	});

	describe("edge cases", () => {
		it("should lidar com strings vazias em arrays", () => {
			const entry = { tags: ["work", "", "urgent"] };
			const xProp = { id: "tags", name: "tags" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["work", "urgent"]);
		});

		it("should lidar com espaços extras em strings", () => {
			const entry = { tags: "  work   personal  " };
			const xProp = { id: "tags", name: "tags" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["work", "personal"]);
		});

		it("should lidar com múltiplos espaços", () => {
			const entry = { tags: "work   personal    urgent" };
			const xProp = { id: "tags", name: "tags" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["work", "personal", "urgent"]);
		});

		it("should lidar com propriedades inexistentes", () => {
			const entry = {};
			const xProp = { id: "missing", name: "missing" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["(missing)"]);
		});

		it("should lidar com valores null", () => {
			const entry = { value: null };
			const xProp = { id: "value", name: "value" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["(missing)"]);
		});

		it("should lidar com valores undefined", () => {
			const entry = { value: undefined };
			const xProp = { id: "value", name: "value" };

			const result = getXValuesForEntry(entry, xProp, "none", true);

			expect(result).toEqual(["(missing)"]);
		});
	});
});
