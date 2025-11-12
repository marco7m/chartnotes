/**
 * Tests for stacking logic
 */

import { describe, it, expect } from "vitest";

/**
 * Simulates the stacking logic used in renderStackedArea
 */
function calculateStackedValues(
	seriesKeys: string[],
	seriesValues: Map<string, number>
): Map<string, { base: number; top: number }> {
	const stacked = new Map<string, { base: number; top: number }>();
	let acc = 0;

	for (const sKey of seriesKeys) {
		const value = seriesValues.get(sKey) ?? 0;
		stacked.set(sKey, {
			base: acc,
			top: acc + value,
		});
		acc += value;
	}

	return stacked;
}

describe("calculateStackedValues", () => {
	it("should stack values correctly", () => {
		const seriesKeys = ["A", "B", "C"];
		const seriesValues = new Map([
			["A", 10],
			["B", 20],
			["C", 30],
		]);

		const result = calculateStackedValues(seriesKeys, seriesValues);

		// Series A: base=0, top=10
		expect(result.get("A")?.base).toBe(0);
		expect(result.get("A")?.top).toBe(10);

		// Series B: base=10, top=30
		expect(result.get("B")?.base).toBe(10);
		expect(result.get("B")?.top).toBe(30);

		// Series C: base=30, top=60
		expect(result.get("C")?.base).toBe(30);
		expect(result.get("C")?.top).toBe(60);
	});

	it("should handle zero values correctly", () => {
		const seriesKeys = ["A", "B", "C"];
		const seriesValues = new Map([
			["A", 10],
			["B", 0], // zero value
			["C", 20],
		]);

		const result = calculateStackedValues(seriesKeys, seriesValues);

		expect(result.get("A")?.base).toBe(0);
		expect(result.get("A")?.top).toBe(10);
		expect(result.get("B")?.base).toBe(10);
			expect(result.get("B")?.top).toBe(10); // base = top when value is 0
		expect(result.get("C")?.base).toBe(10);
		expect(result.get("C")?.top).toBe(30);
	});

	it("should treat missing series as zero", () => {
		const seriesKeys = ["A", "B", "C"];
		const seriesValues = new Map([
			["A", 10],
			// B is not in the map
			["C", 20],
		]);

		const result = calculateStackedValues(seriesKeys, seriesValues);

		expect(result.get("A")?.base).toBe(0);
		expect(result.get("A")?.top).toBe(10);
		expect(result.get("B")?.base).toBe(10);
			expect(result.get("B")?.top).toBe(10); // default value 0
		expect(result.get("C")?.base).toBe(10);
		expect(result.get("C")?.top).toBe(30);
	});

	it("should ensure bases and tops are continuous", () => {
		const seriesKeys = ["A", "B", "C", "D"];
		const seriesValues = new Map([
			["A", 5],
			["B", 10],
			["C", 15],
			["D", 20],
		]);

		const result = calculateStackedValues(seriesKeys, seriesValues);

		// Check continuity: top of one series = base of next
		expect(result.get("A")?.top).toBe(result.get("B")?.base);
		expect(result.get("B")?.top).toBe(result.get("C")?.base);
		expect(result.get("C")?.top).toBe(result.get("D")?.base);
	});

	it("should calculate correct total", () => {
		const seriesKeys = ["A", "B", "C"];
		const seriesValues = new Map([
			["A", 10],
			["B", 20],
			["C", 30],
		]);

		const result = calculateStackedValues(seriesKeys, seriesValues);

		// The top of the last series should be the total sum
		const lastTop = result.get("C")?.top;
		expect(lastTop).toBe(60); // 10 + 20 + 30
	});
});

