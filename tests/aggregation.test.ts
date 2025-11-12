/**
 * Tests for aggregation functions (sum, avg, min, max, count)
 */

import { describe, it, expect } from "vitest";

// Extract aggregation logic from query.ts
interface GroupAggregation {
	sum: number;
	count: number;
	min: number;
	max: number;
	notes: string[];
	xRep: any;
	isDate: boolean;
	series?: string;
	props?: Record<string, any>;
}

interface RawQueryRow {
	x: string | number | Date;
	y: number;
	notes: string[];
	series?: string;
	props?: Record<string, any>;
	_isDate: boolean;
	_origX: any;
}

interface QueryResultRow {
	x: any;
	y: number;
	notes?: string[];
	series?: string;
	props?: Record<string, any>;
}

/**
 * Applies aggregation to raw rows
 */
function applyAggregation(
	rawRows: RawQueryRow[],
	aggregateMode: string | null
): QueryResultRow[] {
	if (!aggregateMode) {
		return rawRows.map((row) => ({
			x: row.x,
			y: row.y,
			notes: row.notes,
			series: row.series,
			props: row.props,
		}));
	}

	// Aggregate by (x, series)
	const grouped = new Map<string, GroupAggregation>();

			for (const row of rawRows) {
				const seriesKey = row.series ?? "";
				const xKey =
					row.x instanceof Date
						? row.x.toISOString().slice(0, 10)
						: String(row.x);
				const groupKey = seriesKey + "||" + xKey;

				const group: GroupAggregation = grouped.get(groupKey) ?? {
					sum: 0,
					count: 0,
					min: Number.POSITIVE_INFINITY,
					max: Number.NEGATIVE_INFINITY,
					notes: [],
					xRep: row.x,
					isDate: row._isDate,
					series: row.series,
					props: undefined,
				};

				group.sum += row.y;
				group.count += 1;
				if (row.y < group.min) group.min = row.y;
				if (row.y > group.max) group.max = row.y;
				group.notes.push(...row.notes);
				if (!group.props) {
					group.props = row.props;
				}

				grouped.set(groupKey, group);
			}

	const aggregated: QueryResultRow[] = [];

	for (const [, group] of grouped) {
		let y = group.sum;
		switch (aggregateMode) {
			case "sum":
				y = group.sum;
				break;
			case "avg":
				y = group.sum / group.count;
				break;
			case "min":
				y = group.min;
				break;
			case "max":
				y = group.max;
				break;
			case "count":
				y = group.count;
				break;
		}
		aggregated.push({
			x: group.xRep,
			y,
			notes: group.notes,
			series: group.series,
			props: group.props,
		});
	}

	return aggregated;
}

describe("Aggregation Functions", () => {
	describe("sum aggregation", () => {
		it("should sum values correctly", () => {
			const rows: RawQueryRow[] = [
				{ x: "A", y: 10, notes: ["note1"] },
				{ x: "A", y: 20, notes: ["note2"] },
				{ x: "B", y: 5, notes: ["note3"] },
			];

			const result = applyAggregation(rows, "sum");

			expect(result).toHaveLength(2);
			expect(result.find((r) => r.x === "A")?.y).toBe(30); // 10 + 20
			expect(result.find((r) => r.x === "B")?.y).toBe(5);
		});

		it("should sum values by series", () => {
			const rows: RawQueryRow[] = [
				{ x: "A", y: 10, series: "S1", notes: ["note1"] },
				{ x: "A", y: 20, series: "S1", notes: ["note2"] },
				{ x: "A", y: 5, series: "S2", notes: ["note3"] },
			];

			const result = applyAggregation(rows, "sum");

			expect(result).toHaveLength(2);
			expect(result.find((r) => r.x === "A" && r.series === "S1")?.y).toBe(30); // 10 + 20
			expect(result.find((r) => r.x === "A" && r.series === "S2")?.y).toBe(5);
		});

		it("should handle zero and negative values", () => {
			const rows: RawQueryRow[] = [
				{ x: "A", y: 10, notes: ["note1"] },
				{ x: "A", y: -5, notes: ["note2"] },
				{ x: "A", y: 0, notes: ["note3"] },
			];

			const result = applyAggregation(rows, "sum");

			expect(result[0].y).toBe(5); // 10 - 5 + 0
		});
	});

	describe("avg aggregation", () => {
		it("should calculate average correctly", () => {
			const rows: RawQueryRow[] = [
				{ x: "A", y: 10, notes: ["note1"] },
				{ x: "A", y: 20, notes: ["note2"] },
				{ x: "A", y: 30, notes: ["note3"] },
			];

			const result = applyAggregation(rows, "avg");

			expect(result[0].y).toBe(20); // (10 + 20 + 30) / 3
		});

		it("should calculate average by series", () => {
			const rows: RawQueryRow[] = [
				{ x: "A", y: 10, series: "S1", notes: ["note1"] },
				{ x: "A", y: 20, series: "S1", notes: ["note2"] },
				{ x: "A", y: 5, series: "S2", notes: ["note3"] },
			];

			const result = applyAggregation(rows, "avg");

			expect(result.find((r) => r.series === "S1")?.y).toBe(15); // (10 + 20) / 2
			expect(result.find((r) => r.series === "S2")?.y).toBe(5); // 5 / 1
		});
	});

	describe("min aggregation", () => {
		it("should find minimum value", () => {
			const rows: RawQueryRow[] = [
				{ x: "A", y: 10, notes: ["note1"] },
				{ x: "A", y: 5, notes: ["note2"] },
				{ x: "A", y: 20, notes: ["note3"] },
			];

			const result = applyAggregation(rows, "min");

			expect(result[0].y).toBe(5);
		});

		it("should handle negative values", () => {
			const rows: RawQueryRow[] = [
				{ x: "A", y: 10, notes: ["note1"] },
				{ x: "A", y: -5, notes: ["note2"] },
				{ x: "A", y: 0, notes: ["note3"] },
			];

			const result = applyAggregation(rows, "min");

			expect(result[0].y).toBe(-5);
		});
	});

	describe("max aggregation", () => {
		it("should find maximum value", () => {
			const rows: RawQueryRow[] = [
				{ x: "A", y: 10, notes: ["note1"] },
				{ x: "A", y: 5, notes: ["note2"] },
				{ x: "A", y: 20, notes: ["note3"] },
			];

			const result = applyAggregation(rows, "max");

			expect(result[0].y).toBe(20);
		});
	});

	describe("count aggregation", () => {
		it("should count the number of notes", () => {
			const rows: RawQueryRow[] = [
				{ x: "A", y: 1, notes: ["note1"] },
				{ x: "A", y: 1, notes: ["note2"] },
				{ x: "A", y: 1, notes: ["note3"] },
				{ x: "B", y: 1, notes: ["note4"] },
			];

			const result = applyAggregation(rows, "count");

			expect(result).toHaveLength(2);
			expect(result.find((r) => r.x === "A")?.y).toBe(3);
			expect(result.find((r) => r.x === "B")?.y).toBe(1);
		});

		it("should count by series", () => {
			const rows: RawQueryRow[] = [
				{ x: "A", y: 1, series: "S1", notes: ["note1"] },
				{ x: "A", y: 1, series: "S1", notes: ["note2"] },
				{ x: "A", y: 1, series: "S2", notes: ["note3"] },
			];

			const result = applyAggregation(rows, "count");

			expect(result.find((r) => r.series === "S1")?.y).toBe(2);
			expect(result.find((r) => r.series === "S2")?.y).toBe(1);
		});
	});

	describe("no aggregation", () => {
		it("should return rows without aggregation when mode is null", () => {
			const rows: RawQueryRow[] = [
				{ x: "A", y: 10, notes: ["note1"] },
				{ x: "A", y: 20, notes: ["note2"] },
			];

			const result = applyAggregation(rows, null);

			expect(result).toHaveLength(2);
			expect(result[0].y).toBe(10);
			expect(result[1].y).toBe(20);
		});
	});

	describe("aggregation metadata", () => {
		it("should combine notes from multiple rows", () => {
			const rows: RawQueryRow[] = [
				{ x: "A", y: 10, notes: ["note1"] },
				{ x: "A", y: 20, notes: ["note2"] },
			];

			const result = applyAggregation(rows, "sum");

			expect(result[0].notes).toEqual(["note1", "note2"]);
		});

		it("should preserve properties from the first row", () => {
			const rows: RawQueryRow[] = [
				{ x: "A", y: 10, notes: ["note1"], props: { priority: "high" } },
				{ x: "A", y: 20, notes: ["note2"], props: { priority: "low" } },
			];

			const result = applyAggregation(rows, "sum");

			expect(result[0].props?.priority).toBe("high");
		});

		it("should preserve series information", () => {
			const rows: RawQueryRow[] = [
				{ x: "A", y: 10, series: "S1", notes: ["note1"] },
				{ x: "A", y: 20, series: "S1", notes: ["note2"] },
			];

			const result = applyAggregation(rows, "sum");

			expect(result[0].series).toBe("S1");
		});
	});
});
