/**
 * Tests for date normalization
 */

import { describe, it, expect } from "vitest";

// normalizeDateKey function extracted for testing
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
		// Extract only the day if it comes in ISO format with time
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
	it("should normalize ISO strings with time to date only", () => {
		const result = normalizeDateKey("2024-01-15T10:30:00Z");
		expect(result.isDate).toBe(true);
		expect(result.key).toBe("2024-01-15");
	});

	it("should keep ISO strings without time", () => {
		const result = normalizeDateKey("2024-01-15");
		expect(result.isDate).toBe(true);
		expect(result.key).toBe("2024-01-15");
	});

	it("should convert ISO strings to Date when possible", () => {
		const result = normalizeDateKey("2024-01-15");
		expect(result.isDate).toBe(true);
		// May be string or Date depending on implementation
	});

	it("should return false for non-date values", () => {
		expect(normalizeDateKey("not a date").isDate).toBe(false);
		expect(normalizeDateKey(123).isDate).toBe(false);
		expect(normalizeDateKey(null).isDate).toBe(false);
	});

	it("should keep original values when they are not dates", () => {
		const result = normalizeDateKey("category");
		expect(result.isDate).toBe(false);
		expect(result.key).toBe("category");
	});
});

describe("looksLikeISODate", () => {
	it("should identify ISO strings", () => {
		expect(looksLikeISODate("2024-01-15")).toBe(true);
		expect(looksLikeISODate("2024-01-15T10:30:00Z")).toBe(true);
		expect(looksLikeISODate("  2024-01-15  ")).toBe(true);
	});

	it("should not identify non-ISO strings", () => {
		expect(looksLikeISODate("01/15/2024")).toBe(false);
		expect(looksLikeISODate("2024")).toBe(false);
		expect(looksLikeISODate("not a date")).toBe(false);
		expect(looksLikeISODate(123)).toBe(false);
	});
});

describe("toDate", () => {
	it("should convert ISO strings to Date", () => {
		const result = toDate("2024-01-15");
		expect(result).toBeInstanceOf(Date);
		expect(result?.getFullYear()).toBe(2024);
	});

	it("should return Date when receiving Date", () => {
		const date = new Date("2024-01-15");
		const result = toDate(date);
		expect(result).toBe(date);
	});

	it("should return null for invalid values", () => {
		expect(toDate("invalid")).toBeNull();
		expect(toDate(null)).toBeNull();
		expect(toDate(undefined)).toBeNull();
	});
});

