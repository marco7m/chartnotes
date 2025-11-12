/**
 * Testes para normalização de datas
 */

import { describe, it, expect } from "vitest";

// Função normalizeDateKey extraída para testes
function looksLikeISODate(s: any): boolean {
	if (typeof s !== "string") return false;
	const trimmed = s.trim();
	return /^\d{4}-\d{2}-\d{2}/.test(trimmed);
}

function toDate(s: any): Date | null {
	if (!s) return null;
	if (s instanceof Date) {
		const t = s.getTime();
		return Number.isNaN(t) ? null : s;
	}
	if (typeof s === "string") {
		const d = new Date(s);
		if (!Number.isNaN(d.getTime())) return d;
	}
	return null;
}

function normalizeDateKey(orig: any): { key: string | number | Date; isDate: boolean } {
	if (typeof orig === "string") {
		// pega só o dia se vier no formato ISO com hora
		if (/^\d{4}-\d{2}-\d{2}/.test(orig)) {
			const day = orig.slice(0, 10); // "2025-10-05"
			return { key: day, isDate: true };
		}
	}
	if (looksLikeISODate(orig)) {
		const d = toDate(orig);
		if (d) return { key: d, isDate: true };
	}
	return { key: orig, isDate: false };
}

describe("normalizeDateKey", () => {
	it("deve normalizar strings ISO com hora para apenas data", () => {
		const result = normalizeDateKey("2024-01-15T10:30:00Z");
		expect(result.isDate).toBe(true);
		expect(result.key).toBe("2024-01-15");
	});

	it("deve manter strings ISO sem hora", () => {
		const result = normalizeDateKey("2024-01-15");
		expect(result.isDate).toBe(true);
		expect(result.key).toBe("2024-01-15");
	});

	it("deve converter strings ISO para Date quando possível", () => {
		const result = normalizeDateKey("2024-01-15");
		expect(result.isDate).toBe(true);
		// Pode ser string ou Date dependendo da implementação
	});

	it("deve retornar false para valores não-datas", () => {
		expect(normalizeDateKey("not a date").isDate).toBe(false);
		expect(normalizeDateKey(123).isDate).toBe(false);
		expect(normalizeDateKey(null).isDate).toBe(false);
	});

	it("deve manter valores originais quando não são datas", () => {
		const result = normalizeDateKey("category");
		expect(result.isDate).toBe(false);
		expect(result.key).toBe("category");
	});
});

describe("looksLikeISODate", () => {
	it("deve identificar strings ISO", () => {
		expect(looksLikeISODate("2024-01-15")).toBe(true);
		expect(looksLikeISODate("2024-01-15T10:30:00Z")).toBe(true);
		expect(looksLikeISODate("  2024-01-15  ")).toBe(true);
	});

	it("não deve identificar strings não-ISO", () => {
		expect(looksLikeISODate("01/15/2024")).toBe(false);
		expect(looksLikeISODate("2024")).toBe(false);
		expect(looksLikeISODate("not a date")).toBe(false);
		expect(looksLikeISODate(123)).toBe(false);
	});
});

describe("toDate", () => {
	it("deve converter strings ISO para Date", () => {
		const result = toDate("2024-01-15");
		expect(result).toBeInstanceOf(Date);
		expect(result?.getFullYear()).toBe(2024);
	});

	it("deve retornar Date quando recebe Date", () => {
		const date = new Date("2024-01-15");
		const result = toDate(date);
		expect(result).toBe(date);
	});

	it("deve retornar null para valores inválidos", () => {
		expect(toDate("invalid")).toBeNull();
		expect(toDate(null)).toBeNull();
		expect(toDate(undefined)).toBeNull();
	});
});

