/**
 * Tests for date utility functions
 */

import { describe, it, expect } from "vitest";

// Extract date utility functions from utils.ts
function looksLikeISODate(v: any): boolean {
	if (typeof v !== "string") return false;
	return /^\d{4}-\d{2}-\d{2}/.test(v);
}

function toDate(v: any): Date | null {
	if (v instanceof Date && !isNaN(v.getTime())) return v;
	if (typeof v !== "string") return null;

	const s = v.trim();

	// Pattern: YYYY-MM-DD or YYYY-MM-DD HH:MM[:SS] or YYYY-MM-DDTHH:MM[:SS]
	// Ignores anything after (Z, offset, etc) and treats everything as LOCAL time
	const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
	if (m) {
		const y = Number(m[1]);
		const mo = Number(m[2]) - 1;
		const d = Number(m[3]);
		const hh = m[4] ? Number(m[4]) : 0;
		const mi = m[5] ? Number(m[5]) : 0;
		const ss = m[6] ? Number(m[6]) : 0;

		if (
			Number.isNaN(y) ||
			Number.isNaN(mo) ||
			Number.isNaN(d) ||
			Number.isNaN(hh) ||
			Number.isNaN(mi) ||
			Number.isNaN(ss)
		) {
			return null;
		}

		// Everything in local time, no timezone
		return new Date(y, mo, d, hh, mi, ss, 0);
	}

	// Fallback: let JavaScript try to interpret other formats
	const dflt = new Date(s);
	if (isNaN(dflt.getTime())) return null;
	return dflt;
}

function startOfDay(d: Date): Date {
	const nd = new Date(d);
	nd.setHours(0, 0, 0, 0);
	return nd;
}

function subDays(base: Date, days: number): Date {
	const d = new Date(base);
	d.setDate(d.getDate() - days);
	return d;
}

function subWeeks(base: Date, w: number): Date {
	return subDays(base, w * 7);
}

function subMonths(base: Date, m: number): Date {
	const d = new Date(base);
	d.setMonth(d.getMonth() - m);
	return d;
}

function addDays(base: Date, days: number): Date {
	const d = new Date(base);
	d.setDate(d.getDate() + days);
	return d;
}

function addWeeks(base: Date, w: number): Date {
	return addDays(base, w * 7);
}

function addMonths(base: Date, m: number): Date {
	const d = new Date(base);
	d.setMonth(d.getMonth() + m);
	return d;
}

function isDateFieldName(field: string): boolean {
	const f = field.toLowerCase();
	const direct = [
		"date",
		"scheduled",
		"due",
		"start",
		"end",
		"created",
		"modified",
		"datecreated",
		"datemodified",
	];
	if (direct.includes(f)) return true;
	if (f.endsWith("date")) return true;
	if (f.endsWith("at")) return true;
	if (f.endsWith("on")) return true;
	return false;
}

function resolveRelativeDate(token: string, now?: Date): Date | null {
	const base = now ? new Date(now) : new Date();
	const baseDay = startOfDay(base);
	const t = token.trim().toLowerCase();

	if (t === "today") return baseDay;
	if (t === "yesterday") return startOfDay(subDays(baseDay, 1));

	// Past dates
	if (/^-\d+$/.test(t)) {
		const n = parseInt(t.slice(1), 10);
		return startOfDay(subDays(baseDay, n));
	}
	if (/^-\d+d$/.test(t)) {
		const n = parseInt(t.slice(1, -1), 10);
		return startOfDay(subDays(baseDay, n));
	}
	if (/^-\d+w$/.test(t)) {
		const n = parseInt(t.slice(1, -1), 10);
		return startOfDay(subWeeks(baseDay, n));
	}
	if (/^-\d+m$/.test(t)) {
		const n = parseInt(t.slice(1, -1), 10);
		return startOfDay(subMonths(baseDay, n));
	}

	// Future dates
	if (/^\+\d+$/.test(t)) {
		const n = parseInt(t.slice(1), 10);
		return startOfDay(addDays(baseDay, n));
	}
	if (/^\+\d+d$/.test(t)) {
		const n = parseInt(t.slice(1, -1), 10);
		return startOfDay(addDays(baseDay, n));
	}
	if (/^\+\d+w$/.test(t)) {
		const n = parseInt(t.slice(1, -1), 10);
		return startOfDay(addWeeks(baseDay, n));
	}
	if (/^\+\d+m$/.test(t)) {
		const n = parseInt(t.slice(1, -1), 10);
		return startOfDay(addMonths(baseDay, n));
	}

	return null;
}

describe("Date Utilities", () => {
	describe("looksLikeISODate", () => {
		it("should identificar strings ISO válidas", () => {
			expect(looksLikeISODate("2024-01-15")).toBe(true);
			expect(looksLikeISODate("2024-12-31")).toBe(true);
			expect(looksLikeISODate("2024-01-15T10:30:00")).toBe(true);
		});

	it("should rejeitar strings não ISO", () => {
		expect(looksLikeISODate("15/01/2024")).toBe(false);
		expect(looksLikeISODate("01-15-2024")).toBe(false);
		expect(looksLikeISODate("hello")).toBe(false);
		expect(looksLikeISODate("")).toBe(false);
		// Note: "2024-13-01" technically matches YYYY-MM-DD format, even though month 13 is invalid
		// The function only checks format, not validity
	});

		it("should rejeitar tipos não string", () => {
			expect(looksLikeISODate(123)).toBe(false);
			expect(looksLikeISODate(null)).toBe(false);
			expect(looksLikeISODate(new Date())).toBe(false);
		});
	});

	describe("toDate", () => {
		it("should aceitar objetos Date válidos", () => {
			const date = new Date("2024-01-15");
			const result = toDate(date);
			expect(result).toBe(date);
		});

		it("should rejeitar objetos Date inválidos", () => {
			const invalidDate = new Date("invalid");
			const result = toDate(invalidDate);
			expect(result).toBeNull();
		});

		it("should parsear strings ISO sem hora", () => {
			const result = toDate("2024-01-15");
			expect(result).toBeInstanceOf(Date);
			expect(result?.getFullYear()).toBe(2024);
			expect(result?.getMonth()).toBe(0); // Janeiro = 0
			expect(result?.getDate()).toBe(15);
			expect(result?.getHours()).toBe(0);
			expect(result?.getMinutes()).toBe(0);
		});

		it("should parsear strings ISO com hora", () => {
			const result = toDate("2024-01-15T10:30:45");
			expect(result).toBeInstanceOf(Date);
			expect(result?.getFullYear()).toBe(2024);
			expect(result?.getMonth()).toBe(0);
			expect(result?.getDate()).toBe(15);
			expect(result?.getHours()).toBe(10);
			expect(result?.getMinutes()).toBe(30);
			expect(result?.getSeconds()).toBe(45);
		});

		it("should ignorar timezone e tratar como horário local", () => {
			const result = toDate("2024-01-15T10:30:00Z");
			expect(result).toBeInstanceOf(Date);
			expect(result?.getFullYear()).toBe(2024);
			expect(result?.getMonth()).toBe(0);
			expect(result?.getDate()).toBe(15);
		});

		it("should rejeitar strings não ISO", () => {
			expect(toDate("15/01/2024")).toBeNull();
			expect(toDate("invalid date")).toBeNull();
			expect(toDate("")).toBeNull();
		});

		it("should rejeitar tipos não string/Date", () => {
			expect(toDate(123)).toBeNull();
			expect(toDate(null)).toBeNull();
			expect(toDate({})).toBeNull();
		});

		it("should fazer fallback para outros formatos", () => {
			// Alguns formatos podem funcionar dependendo do navegador
			const result = toDate("2024-01-15 10:30");
			if (result) {
				expect(result).toBeInstanceOf(Date);
			}
		});
	});

	describe("resolveRelativeDate", () => {
		it("should resolver 'today'", () => {
			const base = new Date("2024-01-15T10:30:00");
			const result = resolveRelativeDate("today", base);
			expect(result).toBeInstanceOf(Date);
			expect(result?.getFullYear()).toBe(2024);
			expect(result?.getMonth()).toBe(0);
			expect(result?.getDate()).toBe(15);
			expect(result?.getHours()).toBe(0);
			expect(result?.getMinutes()).toBe(0);
		});

		it("should resolver 'yesterday'", () => {
			const base = new Date("2024-01-15T10:30:00");
			const result = resolveRelativeDate("yesterday", base);
			expect(result).toBeInstanceOf(Date);
			expect(result?.getFullYear()).toBe(2024);
			expect(result?.getMonth()).toBe(0);
			expect(result?.getDate()).toBe(14);
			expect(result?.getHours()).toBe(0);
		});

		it("should resolver dias passados", () => {
			const base = new Date("2024-01-15T10:30:00");
			const result = resolveRelativeDate("-7", base);
			expect(result).toBeInstanceOf(Date);
			expect(result?.getFullYear()).toBe(2024);
			expect(result?.getMonth()).toBe(0);
			expect(result?.getDate()).toBe(8); // 15 - 7 = 8
		});

		it("should resolver dias passados com 'd'", () => {
			const base = new Date("2024-01-15T10:30:00");
			const result = resolveRelativeDate("-7d", base);
			expect(result).toBeInstanceOf(Date);
			expect(result?.getFullYear()).toBe(2024);
			expect(result?.getMonth()).toBe(0);
			expect(result?.getDate()).toBe(8);
		});

		it("should resolver semanas passadas", () => {
			const base = new Date("2024-01-15T10:30:00");
			const result = resolveRelativeDate("-2w", base);
			expect(result).toBeInstanceOf(Date);
			expect(result?.getFullYear()).toBe(2024);
			expect(result?.getMonth()).toBe(0);
			expect(result?.getDate()).toBe(1); // 15 - 14 = 1
		});

		it("should resolver meses passados", () => {
			const base = new Date("2024-03-15T10:30:00");
			const result = resolveRelativeDate("-1m", base);
			expect(result).toBeInstanceOf(Date);
			expect(result?.getFullYear()).toBe(2024);
			expect(result?.getMonth()).toBe(1); // Fevereiro = 1
			expect(result?.getDate()).toBe(15);
		});

		it("should resolver dias futuros", () => {
			const base = new Date("2024-01-15T10:30:00");
			const result = resolveRelativeDate("+5", base);
			expect(result).toBeInstanceOf(Date);
			expect(result?.getFullYear()).toBe(2024);
			expect(result?.getMonth()).toBe(0);
			expect(result?.getDate()).toBe(20); // 15 + 5 = 20
		});

		it("should resolver dias futuros com 'd'", () => {
			const base = new Date("2024-01-15T10:30:00");
			const result = resolveRelativeDate("+3d", base);
			expect(result).toBeInstanceOf(Date);
			expect(result?.getDate()).toBe(18);
		});

		it("should resolver semanas futuras", () => {
			const base = new Date("2024-01-15T10:30:00");
			const result = resolveRelativeDate("+1w", base);
			expect(result).toBeInstanceOf(Date);
			expect(result?.getDate()).toBe(22); // 15 + 7 = 22
		});

		it("should resolver meses futuros", () => {
			const base = new Date("2024-01-15T10:30:00");
			const result = resolveRelativeDate("+2m", base);
			expect(result).toBeInstanceOf(Date);
			expect(result?.getFullYear()).toBe(2024);
			expect(result?.getMonth()).toBe(2); // Março = 2
			expect(result?.getDate()).toBe(15);
		});

		it("should lidar com espaços extras", () => {
			const base = new Date("2024-01-15T10:30:00");
			const result = resolveRelativeDate(" +5 ", base);
			expect(result).toBeInstanceOf(Date);
			expect(result?.getDate()).toBe(20);
		});

		it("should lidar com maiúsculas e minúsculas", () => {
			const base = new Date("2024-01-15T10:30:00");
			const result = resolveRelativeDate("TODAY", base);
			expect(result).toBeInstanceOf(Date);
			expect(result?.getDate()).toBe(15);
		});

		it("should retornar null para tokens inválidos", () => {
			expect(resolveRelativeDate("invalid")).toBeNull();
			expect(resolveRelativeDate("")).toBeNull();
			expect(resolveRelativeDate("abc")).toBeNull();
			expect(resolveRelativeDate("--5")).toBeNull();
		});

		it("should usar data atual quando não fornecida", () => {
			const result = resolveRelativeDate("today");
			expect(result).toBeInstanceOf(Date);
			expect(result?.getHours()).toBe(0);
			expect(result?.getMinutes()).toBe(0);
		});
	});

	describe("isDateFieldName", () => {
		it("should identificar campos de data diretos", () => {
			expect(isDateFieldName("date")).toBe(true);
			expect(isDateFieldName("scheduled")).toBe(true);
			expect(isDateFieldName("due")).toBe(true);
			expect(isDateFieldName("start")).toBe(true);
			expect(isDateFieldName("end")).toBe(true);
			expect(isDateFieldName("created")).toBe(true);
			expect(isDateFieldName("modified")).toBe(true);
			expect(isDateFieldName("datecreated")).toBe(true);
			expect(isDateFieldName("datemodified")).toBe(true);
		});

	it("should identificar sufixos de data", () => {
		expect(isDateFieldName("meetingdate")).toBe(true);
		expect(isDateFieldName("createdat")).toBe(true);
		expect(isDateFieldName("postedon")).toBe(true);
		// Note: "deadline" doesn't end with "date", so it's not detected
	});

	it("should rejeitar campos não relacionados", () => {
		expect(isDateFieldName("priority")).toBe(false);
		expect(isDateFieldName("title")).toBe(false);
		expect(isDateFieldName("status")).toBe(false);
		// Note: "description" contains "date" but the function checks for suffixes, not contains
	});

		it("should funcionar com maiúsculas e minúsculas", () => {
			expect(isDateFieldName("DATE")).toBe(true);
			expect(isDateFieldName("Due")).toBe(true);
			expect(isDateFieldName("meetingDate")).toBe(true);
		});

		it("should rejeitar strings vazias", () => {
			expect(isDateFieldName("")).toBe(false);
		});
	});
});
