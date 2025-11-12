/**
 * Tests for date bucketing functions
 */

import { describe, it, expect } from "vitest";

// Extract date bucketing logic from bases-view.ts
function parseDate(raw: string | null): Date | null {
	if (!raw) return null;
	const trimmed = raw.trim();
	// Parse as local date to avoid timezone issues
	const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
	if (m) {
		const y = Number(m[1]);
		const mo = Number(m[2]) - 1;
		const d = Number(m[3]);
		const hh = m[4] ? Number(m[4]) : 0;
		const mi = m[5] ? Number(m[5]) : 0;
		const ss = m[6] ? Number(m[6]) : 0;
		return new Date(y, mo, d, hh, mi, ss, 0);
	}
	const d = new Date(trimmed);
	return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
	const x = new Date(d);
	// Monday as start of week (0 = Sunday, so Monday is 1, but we want Monday as 0)
	const dayOfWeek = x.getDay(); // 0 = Sunday, 1 = Monday, etc.
	const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Days to subtract to get to Monday
	x.setDate(x.getDate() - mondayOffset);
	x.setHours(0, 0, 0, 0);
	return x;
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
		case "week": {
			const s = startOfWeek(d);
			return `${fmtDate(s)} (W)`;
		}
		case "month": {
			const m = String(d.getMonth() + 1).padStart(2, "0");
			return `${d.getFullYear()}-${m}`;
		}
		case "quarter": {
			const q = Math.floor(d.getMonth() / 3) + 1;
			return `${d.getFullYear()}-Q${q}`;
		}
		case "year":
			return `${d.getFullYear()}`;
		default:
			return rawX;
	}
}

describe("Date Bucketing", () => {
	describe("day bucketing", () => {
		it("should format date as YYYY-MM-DD", () => {
			const result = bucketX("2024-01-15T10:30:00Z", "day");
			expect(result).toBe("2024-01-15");
		});

		it("should ignore hours and minutes", () => {
			const result = bucketX("2024-01-15T23:59:59Z", "day");
			expect(result).toBe("2024-01-15");
		});

	it("should work with dates without time", () => {
		// Use a date that won't have timezone issues
		const result = bucketX("2024-06-15", "day");
		expect(result).toBe("2024-06-15");
	});

	it("should work for Monday", () => {
		// 2024-01-15 was actually a Monday, not Tuesday as I thought
		// Let's use a different date: 2024-01-16 was a Tuesday
		const result = bucketX("2024-01-16", "week");
		expect(result).toBe("2024-01-15 (W)"); // Should go back to Monday
	});
	});

	describe("week bucketing", () => {
	it("should return Monday of the week", () => {
		// Use a known Monday: 2024-06-03 was a Monday
		const result = bucketX("2024-06-03", "week");
		expect(result).toBe("2024-06-03 (W)");
	});

		it("should find Monday for weekdays", () => {
			// 2024-01-16 is Tuesday, Monday is 2024-01-15
			const result = bucketX("2024-01-16", "week");
			expect(result).toBe("2024-01-15 (W)");
		});

		it("should work for Sunday", () => {
			// 2024-01-14 is Sunday, Monday is 2024-01-08
			const result = bucketX("2024-01-14", "week");
			expect(result).toBe("2024-01-08 (W)");
		});
	});

	describe("month bucketing", () => {
		it("should return year and month", () => {
			const result = bucketX("2024-01-15", "month");
			expect(result).toBe("2024-01");
		});

		it("should work for December", () => {
			const result = bucketX("2024-12-25", "month");
			expect(result).toBe("2024-12");
		});
	});

	describe("quarter bucketing", () => {
		it("should calculate quarter correctly", () => {
			expect(bucketX("2024-01-15", "quarter")).toBe("2024-Q1");
			expect(bucketX("2024-04-15", "quarter")).toBe("2024-Q2");
			expect(bucketX("2024-07-15", "quarter")).toBe("2024-Q3");
			expect(bucketX("2024-10-15", "quarter")).toBe("2024-Q4");
		});

		it("should work for boundary months", () => {
			expect(bucketX("2024-03-31", "quarter")).toBe("2024-Q1");
			expect(bucketX("2024-06-30", "quarter")).toBe("2024-Q2");
			expect(bucketX("2024-09-30", "quarter")).toBe("2024-Q3");
			expect(bucketX("2024-12-31", "quarter")).toBe("2024-Q4");
		});
	});

	describe("year bucketing", () => {
		it("should return only the year", () => {
			const result = bucketX("2024-01-15", "year");
			expect(result).toBe("2024");
		});

	it("should work for different years", () => {
		expect(bucketX("2023-06-15", "year")).toBe("2023");
		expect(bucketX("2024-06-15", "year")).toBe("2024");
	});
	});

	describe("auto mode", () => {
		it("should work as day mode", () => {
			const result = bucketX("2024-01-15T10:30:00Z", "auto");
			expect(result).toBe("2024-01-15");
		});
	});

	describe("none mode", () => {
		it("should return original value", () => {
			const result = bucketX("2024-01-15T10:30:00Z", "none");
			expect(result).toBe("2024-01-15T10:30:00Z");
		});
	});

	describe("edge cases", () => {
		it("should return original value for invalid dates", () => {
			const result = bucketX("invalid-date", "day");
			expect(result).toBe("invalid-date");
		});

		it("should return original value for empty strings", () => {
			const result = bucketX("", "day");
			expect(result).toBe("");
		});

		it("should return original value for null", () => {
			const result = bucketX(null as any, "day");
			expect(result).toBe(null);
		});

	it("should work with different date formats", () => {
		expect(bucketX("2024-06-15", "day")).toBe("2024-06-15");
		expect(bucketX("2024-06-15T00:00:00", "day")).toBe("2024-06-15");
		expect(bucketX("2024-06-15T23:59:59Z", "day")).toBe("2024-06-15");
	});
	});

	describe("consistency across modes", () => {
		const testDate = "2024-01-15T10:30:00Z";

		it("should maintain consistency across modes", () => {
			expect(bucketX(testDate, "day")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(bucketX(testDate, "week")).toMatch(/^\d{4}-\d{2}-\d{2} \(W\)$/);
			expect(bucketX(testDate, "month")).toMatch(/^\d{4}-\d{2}$/);
			expect(bucketX(testDate, "quarter")).toMatch(/^\d{4}-Q[1-4]$/);
			expect(bucketX(testDate, "year")).toMatch(/^\d{4}$/);
		});
	});
});
