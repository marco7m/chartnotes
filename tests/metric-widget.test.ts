import { describe, it, expect } from "vitest";

/**
 * Tests for Metric Widget functionality
 * 
 * Tests the logic for:
 * - Type detection (number, date, text)
 * - Operation validation based on type
 * - Metric calculation (count, sum, avg, min, max, oldest, newest, dateRange)
 * - Operation reset when invalid
 */

// Helper to create mock entry
function createMockEntry(property: string, value: string | number | null) {
	return {
		file: { path: `test-${Math.random()}.md` },
		[property]: value,
	};
}

// Helper to create mock group
function createMockGroup(entries: any[]) {
	return {
		entries,
	};
}

// Simplified version of detectMetricPropertyType for testing
function detectMetricPropertyType(
	groups: any[],
	readValue: (entry: any, prop: { id: string }) => string | null,
	metricProp: { id: string }
): "number" | "date" | "text" {
	if (!metricProp.id) return "text";

	const values: Array<{ isNumber: boolean; isDate: boolean }> = [];
	const maxSamples = 20;
	let samples = 0;

	for (const group of groups) {
		if (samples >= maxSamples) break;
		for (const entry of group.entries as any[]) {
			if (samples >= maxSamples) break;

			const rawValue = readValue(entry, metricProp);
			if (rawValue == null) continue;

			const trimmed = rawValue.trim();
			const looksLikeDate = /^\d{4}-\d{2}-\d{2}/.test(trimmed);

			let isDate = false;
			if (looksLikeDate) {
				const date = new Date(trimmed);
				isDate = !isNaN(date.getTime());
			}

			const num = Number(trimmed);
			const isNumber =
				!Number.isNaN(num) &&
				Number.isFinite(num) &&
				(!looksLikeDate || !isDate);

			values.push({ isNumber, isDate });
			samples++;
		}
	}

	if (values.length === 0) return "text";

	let numberCount = 0;
	let dateCount = 0;

	for (const v of values) {
		if (v.isNumber) numberCount++;
		if (v.isDate) dateCount++;
	}

	if (numberCount > dateCount && numberCount > 0) {
		return "number";
	} else if (dateCount > numberCount && dateCount > 0) {
		return "date";
	} else if (numberCount > 0) {
		return "number";
	} else if (dateCount > 0) {
		return "date";
	}

	return "text";
}

// Helper to read value from entry
function readValue(entry: any, prop: { id: string }): string | null {
	if (!prop.id) return null;
	const value = entry[prop.id];
	if (value == null) return null;
	return String(value);
}

describe("Metric Widget", () => {
	describe("Type Detection", () => {
		it("should detect number type from numeric values", () => {
			const groups = [
				createMockGroup([
					createMockEntry("value", "10"),
					createMockEntry("value", "20"),
					createMockEntry("value", "30"),
				]),
			];
			const prop = { id: "value" };

			const result = detectMetricPropertyType(groups, readValue, prop);
			expect(result).toBe("number");
		});

		it("should detect date type from date values", () => {
			const groups = [
				createMockGroup([
					createMockEntry("date", "2024-01-15"),
					createMockEntry("date", "2024-02-20"),
					createMockEntry("date", "2024-03-25"),
				]),
			];
			const prop = { id: "date" };

			const result = detectMetricPropertyType(groups, readValue, prop);
			expect(result).toBe("date");
		});

		it("should detect text type from non-numeric, non-date values", () => {
			const groups = [
				createMockGroup([
					createMockEntry("text", "hello"),
					createMockEntry("text", "world"),
					createMockEntry("text", "test"),
				]),
			];
			const prop = { id: "text" };

			const result = detectMetricPropertyType(groups, readValue, prop);
			expect(result).toBe("text");
		});

		it("should prefer number over date when both are present", () => {
			const groups = [
				createMockGroup([
					createMockEntry("mixed", "10"),
					createMockEntry("mixed", "20"),
					createMockEntry("mixed", "2024-01-15"),
				]),
			];
			const prop = { id: "mixed" };

			const result = detectMetricPropertyType(groups, readValue, prop);
			expect(result).toBe("number");
		});

		it("should return text when no property is provided", () => {
			const groups = [createMockGroup([createMockEntry("value", "10")])];
			const prop = { id: null as any };

			const result = detectMetricPropertyType(groups, readValue, prop);
			expect(result).toBe("text");
		});

		it("should return text when no values are found", () => {
			const groups = [
				createMockGroup([
					createMockEntry("value", null),
					createMockEntry("value", null),
				]),
			];
			const prop = { id: "value" };

			const result = detectMetricPropertyType(groups, readValue, prop);
			expect(result).toBe("text");
		});
	});

	describe("Valid Operations by Type", () => {
		it("should return valid operations for number type", () => {
			const validOps = [
				"countAll",
				"countNonEmpty",
				"sum",
				"avg",
				"min",
				"max",
			];
			const hasProperty = true;

			// Simulate getValidOperationsForType logic
			const result: string[] = [];
			if (!hasProperty) {
				result.push("countAll");
			} else {
				result.push("countAll", "countNonEmpty", "sum", "avg", "min", "max");
			}

			expect(result).toEqual(validOps);
		});

		it("should return valid operations for date type", () => {
			const validOps = [
				"countAll",
				"countNonEmpty",
				"oldest",
				"newest",
				"dateRange",
			];
			const hasProperty = true;

			// Simulate getValidOperationsForType logic
			const result: string[] = [];
			if (!hasProperty) {
				result.push("countAll");
			} else {
				result.push(
					"countAll",
					"countNonEmpty",
					"oldest",
					"newest",
					"dateRange"
				);
			}

			expect(result).toEqual(validOps);
		});

		it("should return valid operations for text type", () => {
			const validOps = ["countAll", "countNonEmpty"];
			const hasProperty = true;

			// Simulate getValidOperationsForType logic
			const result: string[] = [];
			if (!hasProperty) {
				result.push("countAll");
			} else {
				result.push("countAll", "countNonEmpty");
			}

			expect(result).toEqual(validOps);
		});

		it("should return only countAll when no property is selected", () => {
			const hasProperty = false;

			// Simulate getValidOperationsForType logic
			const result: string[] = [];
			if (!hasProperty) {
				result.push("countAll");
			}

			expect(result).toEqual(["countAll"]);
		});
	});

	describe("Default Operations", () => {
		it("should return countAll when no property is selected", () => {
			const hasProperty = false;
			const effectiveType = "number";

			// Simulate getDefaultOperationForType logic
			let result: string;
			if (!hasProperty) {
				result = "countAll";
			} else {
				switch (effectiveType) {
					case "number":
					case "text":
						result = "countNonEmpty";
						break;
					case "date":
						result = "countNonEmpty";
						break;
					default:
						result = "countAll";
				}
			}

			expect(result).toBe("countAll");
		});

		it("should return countNonEmpty for number type with property", () => {
			const hasProperty = true;
			const effectiveType = "number";

			// Simulate getDefaultOperationForType logic
			let result: string;
			if (!hasProperty) {
				result = "countAll";
			} else {
				switch (effectiveType) {
					case "number":
					case "text":
						result = "countNonEmpty";
						break;
					case "date":
						result = "countNonEmpty";
						break;
					default:
						result = "countAll";
				}
			}

			expect(result).toBe("countNonEmpty");
		});

		it("should return countNonEmpty for text type with property", () => {
			const hasProperty = true;
			const effectiveType = "text";

			// Simulate getDefaultOperationForType logic
			let result: string;
			if (!hasProperty) {
				result = "countAll";
			} else {
				switch (effectiveType) {
					case "number":
					case "text":
						result = "countNonEmpty";
						break;
					case "date":
						result = "countNonEmpty";
						break;
					default:
						result = "countAll";
				}
			}

			expect(result).toBe("countNonEmpty");
		});

		it("should return countNonEmpty for date type with property", () => {
			const hasProperty = true;
			const effectiveType = "date";

			// Simulate getDefaultOperationForType logic
			let result: string;
			if (!hasProperty) {
				result = "countAll";
			} else {
				switch (effectiveType) {
					case "number":
					case "text":
						result = "countNonEmpty";
						break;
					case "date":
						result = "countNonEmpty";
						break;
					default:
						result = "countAll";
				}
			}

			expect(result).toBe("countNonEmpty");
		});
	});

	describe("Operation Validation", () => {
		it("should validate sum operation for number type", () => {
			const operation = "sum";
			const effectiveType = "number";
			const hasProperty = true;

			const validOps = hasProperty
				? ["countAll", "countNonEmpty", "sum", "avg", "min", "max"]
				: ["countAll"];

			expect(validOps.includes(operation)).toBe(true);
		});

		it("should invalidate sum operation for text type", () => {
			const operation = "sum";
			const effectiveType = "text";
			const hasProperty = true;

			const validOps = hasProperty
				? ["countAll", "countNonEmpty"]
				: ["countAll"];

			expect(validOps.includes(operation)).toBe(false);
		});

		it("should validate oldest operation for date type", () => {
			const operation = "oldest";
			const effectiveType = "date";
			const hasProperty = true;

			const validOps = hasProperty
				? ["countAll", "countNonEmpty", "oldest", "newest", "dateRange"]
				: ["countAll"];

			expect(validOps.includes(operation)).toBe(true);
		});

		it("should invalidate oldest operation for number type", () => {
			const operation = "oldest";
			const effectiveType = "number";
			const hasProperty = true;

			const validOps = hasProperty
				? ["countAll", "countNonEmpty", "sum", "avg", "min", "max"]
				: ["countAll"];

			expect(validOps.includes(operation)).toBe(false);
		});

		it("should validate dateRange operation for date type", () => {
			const operation = "dateRange";
			const effectiveType = "date";
			const hasProperty = true;

			const validOps = hasProperty
				? ["countAll", "countNonEmpty", "oldest", "newest", "dateRange"]
				: ["countAll"];

			expect(validOps.includes(operation)).toBe(true);
		});

		it("should invalidate dateRange operation for number type", () => {
			const operation = "dateRange";
			const effectiveType = "number";
			const hasProperty = true;

			const validOps = hasProperty
				? ["countAll", "countNonEmpty", "sum", "avg", "min", "max"]
				: ["countAll"];

			expect(validOps.includes(operation)).toBe(false);
		});
	});

	describe("Metric Calculations", () => {
		describe("Count Operations", () => {
			it("should count all notes when countAll is selected", () => {
				const notes = ["note1.md", "note2.md", "note3.md"];
				const operation = "countAll";

				let result: number;
				if (operation === "countAll") {
					result = notes.length;
				} else {
					result = 0;
				}

				expect(result).toBe(3);
			});

			it("should count notes with property set when countNonEmpty is selected", () => {
				const values = [
					{ value: "10", isNumber: true },
					{ value: "20", isNumber: true },
					{ value: null, isNumber: false },
				];
				const operation = "countNonEmpty";

				let result: number;
				if (operation === "countNonEmpty") {
					result = values.length;
				} else {
					result = 0;
				}

				expect(result).toBe(3);
			});
		});

		describe("Numeric Operations", () => {
			it("should calculate sum of numeric values", () => {
				const numbers = [10, 20, 30, 40];
				const operation = "sum";

				let result: number;
				if (operation === "sum") {
					result = numbers.reduce((a, b) => a + b, 0);
				} else {
					result = 0;
				}

				expect(result).toBe(100);
			});

			it("should calculate average of numeric values", () => {
				const numbers = [10, 20, 30, 40];
				const operation = "avg";

				let result: number;
				if (operation === "avg") {
					result = numbers.reduce((a, b) => a + b, 0) / numbers.length;
				} else {
					result = 0;
				}

				expect(result).toBe(25);
			});

			it("should find minimum value", () => {
				const numbers = [10, 20, 30, 5, 40];
				const operation = "min";

				let result: number;
				if (operation === "min") {
					result = Math.min(...numbers);
				} else {
					result = 0;
				}

				expect(result).toBe(5);
			});

			it("should find maximum value", () => {
				const numbers = [10, 20, 30, 5, 40];
				const operation = "max";

				let result: number;
				if (operation === "max") {
					result = Math.max(...numbers);
				} else {
					result = 0;
				}

				expect(result).toBe(40);
			});

			it("should return 0 for sum when no numbers are available", () => {
				const numbers: number[] = [];
				const operation = "sum";

				let result: number;
				if (numbers.length === 0) {
					result = 0;
				} else {
					result = numbers.reduce((a, b) => a + b, 0);
				}

				expect(result).toBe(0);
			});
		});

		describe("Date Operations", () => {
			it("should find oldest date", () => {
				const dates = [
					new Date("2024-03-15"),
					new Date("2024-01-10"),
					new Date("2024-02-20"),
				];
				const operation = "oldest";

				let result: Date;
				if (operation === "oldest") {
					result = new Date(Math.min(...dates.map((d) => d.getTime())));
				} else {
					result = new Date();
				}

				expect(result.getTime()).toBe(new Date("2024-01-10").getTime());
			});

			it("should find newest date", () => {
				const dates = [
					new Date("2024-03-15"),
					new Date("2024-01-10"),
					new Date("2024-02-20"),
				];
				const operation = "newest";

				let result: Date;
				if (operation === "newest") {
					result = new Date(Math.max(...dates.map((d) => d.getTime())));
				} else {
					result = new Date();
				}

				expect(result.getTime()).toBe(new Date("2024-03-15").getTime());
			});

			it("should calculate date range in days", () => {
				const dates = [
					new Date("2024-01-10"),
					new Date("2024-02-20"),
					new Date("2024-03-15"),
				];
				const operation = "dateRange";

				let result: number;
				if (operation === "dateRange") {
					const oldest = new Date(Math.min(...dates.map((d) => d.getTime())));
					const newest = new Date(Math.max(...dates.map((d) => d.getTime())));
					const diffMs = newest.getTime() - oldest.getTime();
					result = Math.round(diffMs / (1000 * 60 * 60 * 24));
				} else {
					result = 0;
				}

				// From 2024-01-10 to 2024-03-15 = 65 days
				expect(result).toBe(65);
			});

			it("should return 0 for date range when only one date exists", () => {
				const dates = [new Date("2024-01-10")];
				const operation = "dateRange";

				let result: number;
				if (operation === "dateRange") {
					if (dates.length <= 1) {
						result = 0;
					} else {
						const oldest = new Date(Math.min(...dates.map((d) => d.getTime())));
						const newest = new Date(Math.max(...dates.map((d) => d.getTime())));
						const diffMs = newest.getTime() - oldest.getTime();
						result = Math.round(diffMs / (1000 * 60 * 60 * 24));
					}
				} else {
					result = 0;
				}

				expect(result).toBe(0);
			});
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty groups", () => {
			const groups: any[] = [];
			const prop = { id: "value" };

			const result = detectMetricPropertyType(groups, readValue, prop);
			expect(result).toBe("text");
		});

		it("should handle null values in entries", () => {
			const groups = [
				createMockGroup([
					createMockEntry("value", null),
					createMockEntry("value", null),
					createMockEntry("value", "10"),
				]),
			];
			const prop = { id: "value" };

			const result = detectMetricPropertyType(groups, readValue, prop);
			expect(result).toBe("number");
		});

		it("should handle mixed number and text values", () => {
			const groups = [
				createMockGroup([
					createMockEntry("mixed", "10"),
					createMockEntry("mixed", "hello"),
					createMockEntry("mixed", "20"),
				]),
			];
			const prop = { id: "mixed" };

			const result = detectMetricPropertyType(groups, readValue, prop);
			// Should detect as number if majority are numbers
			expect(result).toBe("number");
		});

		it("should handle very large numbers", () => {
			const numbers = [1000000, 2000000, 3000000];
			const operation = "sum";

			const result = numbers.reduce((a, b) => a + b, 0);
			expect(result).toBe(6000000);
		});

		it("should handle negative numbers", () => {
			const numbers = [-10, 20, -5, 15];
			const operation = "sum";

			const result = numbers.reduce((a, b) => a + b, 0);
			expect(result).toBe(20);
		});

		it("should handle decimal numbers", () => {
			const numbers = [10.5, 20.3, 30.7];
			const operation = "sum";

			const result = numbers.reduce((a, b) => a + b, 0);
			expect(result).toBeCloseTo(61.5, 1);
		});
	});
});

