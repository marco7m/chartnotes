/**
 * Tests for utility functions
 * 
 * To run: npm test
 * To run in watch mode: npm run test:watch
 */

import { describe, it, expect } from "vitest";

// parseDateLike function extracted for testing
function parseDateLike(value: any): Date | null {
	if (!value) return null;

	if (value instanceof Date) {
		const t = value.getTime();
		return Number.isNaN(t) ? null : value;
	}

	if (typeof value === "string") {
		const s = value.trim();
		if (!s) return null;

		// Avoid treating pure numbers as milliseconds by accident
		if (/^\d+$/.test(s)) return null;

		const d = new Date(s);
		if (!Number.isNaN(d.getTime())) return d;
	}

	return null;
}

describe("parseDateLike", () => {
	it("should return null for empty values", () => {
		expect(parseDateLike(null)).toBeNull();
		expect(parseDateLike(undefined)).toBeNull();
		expect(parseDateLike("")).toBeNull();
		expect(parseDateLike("   ")).toBeNull();
	});

	it("should return valid Date when receiving Date", () => {
		const date = new Date("2024-01-15");
		const result = parseDateLike(date);
		expect(result).toBeInstanceOf(Date);
		expect(result?.getTime()).toBe(date.getTime());
	});

	it("should return null for invalid Date", () => {
		const invalidDate = new Date("invalid");
		expect(parseDateLike(invalidDate)).toBeNull();
	});

	it("should parse ISO strings", () => {
		const result = parseDateLike("2024-01-15");
		expect(result).toBeInstanceOf(Date);
		expect(result?.getFullYear()).toBe(2024);
		expect(result?.getUTCMonth()).toBe(0); // January is 0
		expect(result?.getUTCDate()).toBe(15);
	});

	it("should parse ISO strings with time", () => {
		const result = parseDateLike("2024-01-15T10:30:00Z");
		expect(result).toBeInstanceOf(Date);
		expect(result?.getUTCFullYear()).toBe(2024);
		expect(result?.getUTCMonth()).toBe(0);
		expect(result?.getUTCDate()).toBe(15);
	});

	it("should not treat pure numbers as dates", () => {
		expect(parseDateLike("123456")).toBeNull();
		expect(parseDateLike("0")).toBeNull();
		expect(parseDateLike("2024")).toBeNull(); // Only year
	});

	it("should return null for invalid strings", () => {
		expect(parseDateLike("not a date")).toBeNull();
		expect(parseDateLike("abc")).toBeNull();
	});
});

