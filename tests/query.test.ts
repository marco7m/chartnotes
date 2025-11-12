/**
 * Tests for query and aggregation functions
 */

import { describe, it, expect } from "vitest";
import type { QueryResultRow } from "../src/types";

// Functions extracted for testing
function compareXAsc(a: QueryResultRow, b: QueryResultRow): number {
	const ax = a.x;
	const bx = b.x;
	if (ax instanceof Date && bx instanceof Date) {
		return ax.getTime() - bx.getTime();
	}
	const sa = String(ax);
	const sb = String(bx);
	if (sa < sb) return -1;
	if (sa > sb) return 1;
	return 0;
}

function compareXSeriesAsc(a: QueryResultRow, b: QueryResultRow): number {
	const cx = compareXAsc(a, b);
	if (cx !== 0) return cx;
	const as = a.series ?? "";
	const bs = b.series ?? "";
	if (as < bs) return -1;
	if (as > bs) return 1;
	return 0;
}

function applyCumulativeInOrder(rows: QueryResultRow[]): QueryResultRow[] {
	const accBySeries = new Map<string, number>();
	const out: QueryResultRow[] = [];

	for (const r of rows) {
		const key = r.series ?? "__no_series__";
		const prev = accBySeries.get(key) ?? 0;
		const next = prev + r.y;
		accBySeries.set(key, next);
		out.push({ ...r, y: next });
	}
	return out;
}

function parseRollingWindow(rolling: any): number {
	if (rolling == null) return 0;
	if (typeof rolling === "number") {
		return rolling > 0 ? Math.floor(rolling) : 0;
	}
	if (typeof rolling === "string") {
		const m = rolling.trim().match(/^(\d+)/);
		if (m) {
			const n = Number(m[1]);
			return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
		}
	}
	throw new Error(`Invalid aggregate.rolling: ${String(rolling)}`);
}

describe("compareXAsc", () => {
	it("should compare dates correctly", () => {
		const a: QueryResultRow = { x: new Date("2024-01-15"), y: 10, notes: [] };
		const b: QueryResultRow = { x: new Date("2024-01-20"), y: 20, notes: [] };
		
		expect(compareXAsc(a, b)).toBeLessThan(0);
		expect(compareXAsc(b, a)).toBeGreaterThan(0);
		expect(compareXAsc(a, a)).toBe(0);
	});

	it("should compare strings alphabetically", () => {
		const a: QueryResultRow = { x: "apple", y: 10, notes: [] };
		const b: QueryResultRow = { x: "banana", y: 20, notes: [] };
		
		expect(compareXAsc(a, b)).toBeLessThan(0);
		expect(compareXAsc(b, a)).toBeGreaterThan(0);
	});

	it("should compare numbers as strings", () => {
		const a: QueryResultRow = { x: "10", y: 10, notes: [] };
		const b: QueryResultRow = { x: "20", y: 20, notes: [] };
		
		expect(compareXAsc(a, b)).toBeLessThan(0);
	});
});

describe("compareXSeriesAsc", () => {
	it("should compare first by X, then by series", () => {
		const a: QueryResultRow = { x: "2024-01-15", y: 10, series: "A", notes: [] };
		const b: QueryResultRow = { x: "2024-01-15", y: 20, series: "B", notes: [] };
		
		expect(compareXSeriesAsc(a, b)).toBeLessThan(0);
		expect(compareXSeriesAsc(b, a)).toBeGreaterThan(0);
	});

	it("should use X when series are equal", () => {
		const a: QueryResultRow = { x: new Date("2024-01-15"), y: 10, series: "A", notes: [] };
		const b: QueryResultRow = { x: new Date("2024-01-20"), y: 20, series: "A", notes: [] };
		
		expect(compareXSeriesAsc(a, b)).toBeLessThan(0);
	});

	it("should treat empty series as empty string", () => {
		const a: QueryResultRow = { x: "2024-01-15", y: 10, notes: [] };
		const b: QueryResultRow = { x: "2024-01-15", y: 20, series: "A", notes: [] };
		
		expect(compareXSeriesAsc(a, b)).toBeLessThan(0); // "" < "A"
	});
});

describe("applyCumulativeInOrder", () => {
	it("should calculate cumulative sum correctly", () => {
		const rows: QueryResultRow[] = [
			{ x: "2024-01-01", y: 10, notes: [] },
			{ x: "2024-01-02", y: 20, notes: [] },
			{ x: "2024-01-03", y: 30, notes: [] },
		];

		const result = applyCumulativeInOrder(rows);

		expect(result[0].y).toBe(10);
		expect(result[1].y).toBe(30); // 10 + 20
		expect(result[2].y).toBe(60); // 30 + 30
	});

	it("should calculate cumulative sum per series separately", () => {
		const rows: QueryResultRow[] = [
			{ x: "2024-01-01", y: 10, series: "A", notes: [] },
			{ x: "2024-01-01", y: 5, series: "B", notes: [] },
			{ x: "2024-01-02", y: 20, series: "A", notes: [] },
			{ x: "2024-01-02", y: 15, series: "B", notes: [] },
		];

		const result = applyCumulativeInOrder(rows);

		// Series A
		expect(result[0].y).toBe(10);
		expect(result[2].y).toBe(30); // 10 + 20

		// Series B
		expect(result[1].y).toBe(5);
		expect(result[3].y).toBe(20); // 5 + 15
	});

	it("should maintain monotonicity (never decreases)", () => {
		const rows: QueryResultRow[] = [
			{ x: "2024-01-01", y: 10, notes: [] },
			{ x: "2024-01-02", y: 5, notes: [] }, // smaller value
			{ x: "2024-01-03", y: 20, notes: [] },
		];

		const result = applyCumulativeInOrder(rows);

		expect(result[0].y).toBe(10);
		expect(result[1].y).toBe(15); // 10 + 5 (still increases)
		expect(result[2].y).toBe(35); // 15 + 20
	});

	it("should treat empty series as __no_series__", () => {
		const rows: QueryResultRow[] = [
			{ x: "2024-01-01", y: 10, notes: [] },
			{ x: "2024-01-02", y: 20, notes: [] },
		];

		const result = applyCumulativeInOrder(rows);

		expect(result[0].y).toBe(10);
		expect(result[1].y).toBe(30);
	});
});

describe("parseRollingWindow", () => {
	it("should parse numbers correctly", () => {
		expect(parseRollingWindow(7)).toBe(7);
		expect(parseRollingWindow(0)).toBe(0);
		expect(parseRollingWindow(10.5)).toBe(10); // floor
	});

	it("should parse numeric strings", () => {
		expect(parseRollingWindow("7")).toBe(7);
		expect(parseRollingWindow("10")).toBe(10);
		expect(parseRollingWindow(" 5 ")).toBe(5);
	});

	it("should return 0 for invalid values", () => {
		expect(parseRollingWindow(null)).toBe(0);
		expect(parseRollingWindow(undefined)).toBe(0);
		expect(parseRollingWindow(-5)).toBe(0);
	});

	it("should throw error for non-numeric strings", () => {
		expect(() => parseRollingWindow("invalid")).toThrow();
		expect(() => parseRollingWindow("abc")).toThrow();
	});
});

