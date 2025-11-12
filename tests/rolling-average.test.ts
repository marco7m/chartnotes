/**
 * Tests for rolling average transformation
 */

import { describe, it, expect } from "vitest";

// Extract rolling average logic from query.ts
interface QueryResultRow {
	x: any;
	y: number;
	notes?: string[];
	series?: string;
	props?: Record<string, any>;
}

function applyRollingInOrder(rows: QueryResultRow[], rolling: any): QueryResultRow[] {
	const windowSize = parseRollingWindow(rolling);
	if (!windowSize || windowSize <= 1) {
		return [...rows];
	}

	const bufferBySeries = new Map<string, number[]>();
	const sumBySeries = new Map<string, number>();
	const output: QueryResultRow[] = [];

	for (const row of rows) {
		const seriesKey = row.series ?? "__no_series__";

		let buffer = bufferBySeries.get(seriesKey);
		if (!buffer) {
			buffer = [];
			bufferBySeries.set(seriesKey, buffer);
		}
		let sum = sumBySeries.get(seriesKey) ?? 0;

		buffer.push(row.y);
		sum += row.y;
		if (buffer.length > windowSize) {
			const removed = buffer.shift()!;
			sum -= removed;
		}
		sumBySeries.set(seriesKey, sum);

		const denominator = buffer.length || 1;
		const average = sum / denominator;

		output.push({ ...row, y: average });
	}

	return output;
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
	throw new Error(`aggregate.rolling inválido: ${String(rolling)}`);
}

describe("Rolling Average", () => {
	describe("parseRollingWindow", () => {
		it("should parsear números corretamente", () => {
			expect(parseRollingWindow(7)).toBe(7);
			expect(parseRollingWindow(3)).toBe(3);
			expect(parseRollingWindow(1)).toBe(1);
		});

		it("should parsear strings numéricas", () => {
			expect(parseRollingWindow("7")).toBe(7);
			expect(parseRollingWindow(" 5 ")).toBe(5);
			expect(parseRollingWindow("10days")).toBe(10);
		});

		it("should retornar 0 para valores inválidos", () => {
			expect(parseRollingWindow(null)).toBe(0);
			expect(parseRollingWindow(undefined)).toBe(0);
			expect(parseRollingWindow(0)).toBe(0);
			expect(parseRollingWindow(-1)).toBe(0);
		});

		it("should lançar erro para strings não numéricas", () => {
			expect(() => parseRollingWindow("invalid")).toThrow();
			expect(() => parseRollingWindow("abc")).toThrow();
		});
	});

	describe("applyRollingInOrder", () => {
		it("should retornar dados originais para window size <= 1", () => {
			const rows: QueryResultRow[] = [
				{ x: "2024-01-01", y: 10 },
				{ x: "2024-01-02", y: 20 },
			];

			const result = applyRollingInOrder(rows, 1);
			expect(result).toEqual(rows);

			const result2 = applyRollingInOrder(rows, 0);
			expect(result2).toEqual(rows);
		});

		it("should calcular média móvel de janela 3", () => {
			const rows: QueryResultRow[] = [
				{ x: "2024-01-01", y: 10 },
				{ x: "2024-01-02", y: 20 },
				{ x: "2024-01-03", y: 30 },
				{ x: "2024-01-04", y: 40 },
			];

			const result = applyRollingInOrder(rows, 3);

			// Primeiro ponto: apenas 10
			expect(result[0].y).toBe(10);

			// Segundo ponto: (10 + 20) / 2
			expect(result[1].y).toBe(15);

			// Terceiro ponto: (10 + 20 + 30) / 3
			expect(result[2].y).toBe(20);

			// Quarto ponto: (20 + 30 + 40) / 3 (remove o 10)
			expect(result[3].y).toBe(30);
		});

		it("should calcular média móvel de janela 2", () => {
			const rows: QueryResultRow[] = [
				{ x: "2024-01-01", y: 10 },
				{ x: "2024-01-02", y: 20 },
				{ x: "2024-01-03", y: 30 },
			];

			const result = applyRollingInOrder(rows, 2);

			expect(result[0].y).toBe(10); // apenas 10
			expect(result[1].y).toBe(15); // (10 + 20) / 2
			expect(result[2].y).toBe(25); // (20 + 30) / 2
		});

		it("should manter propriedades originais", () => {
			const rows: QueryResultRow[] = [
				{ x: "2024-01-01", y: 10, series: "A", notes: ["note1"] },
				{ x: "2024-01-02", y: 20, series: "A", notes: ["note2"] },
			];

			const result = applyRollingInOrder(rows, 2);

			expect(result[0].series).toBe("A");
			expect(result[0].notes).toEqual(["note1"]);
			expect(result[1].series).toBe("A");
			expect(result[1].notes).toEqual(["note2"]);
		});

		it("should calcular médias móveis separadamente por série", () => {
			const rows: QueryResultRow[] = [
				{ x: "2024-01-01", y: 10, series: "A" },
				{ x: "2024-01-01", y: 100, series: "B" },
				{ x: "2024-01-02", y: 20, series: "A" },
				{ x: "2024-01-02", y: 200, series: "B" },
				{ x: "2024-01-03", y: 30, series: "A" },
				{ x: "2024-01-03", y: 300, series: "B" },
			];

			const result = applyRollingInOrder(rows, 3);

			// Série A
			expect(result[0].y).toBe(10); // apenas 10
			expect(result[2].y).toBe(15); // (10 + 20) / 2
			expect(result[4].y).toBe(20); // (10 + 20 + 30) / 3

			// Série B
			expect(result[1].y).toBe(100); // apenas 100
			expect(result[3].y).toBe(150); // (100 + 200) / 2
			expect(result[5].y).toBe(200); // (100 + 200 + 300) / 3
		});

		it("should lidar com séries vazias como __no_series__", () => {
			const rows: QueryResultRow[] = [
				{ x: "2024-01-01", y: 10 },
				{ x: "2024-01-02", y: 20 },
			];

			const result = applyRollingInOrder(rows, 2);

			expect(result[0].y).toBe(10);
			expect(result[1].y).toBe(15);
		});

		it("should funcionar com dados fora de ordem (processa na ordem recebida)", () => {
			const rows: QueryResultRow[] = [
				{ x: "2024-01-03", y: 30 },
				{ x: "2024-01-01", y: 10 },
				{ x: "2024-01-02", y: 20 },
			];

			const result = applyRollingInOrder(rows, 2);

			// Processa na ordem dos dados, não por data
			expect(result[0].y).toBe(30); // apenas 30
			expect(result[1].y).toBe(20); // (30 + 10) / 2
			expect(result[2].y).toBe(15); // (10 + 20) / 2
		});

		it("should lidar com valores zero e negativos", () => {
			const rows: QueryResultRow[] = [
				{ x: "2024-01-01", y: 10 },
				{ x: "2024-01-02", y: -5 },
				{ x: "2024-01-03", y: 0 },
			];

			const result = applyRollingInOrder(rows, 2);

			expect(result[0].y).toBe(10); // apenas 10
			expect(result[1].y).toBe(2.5); // (10 + (-5)) / 2
			expect(result[2].y).toBe(-2.5); // (-5 + 0) / 2
		});

		it("should funcionar com janela maior que dados disponíveis", () => {
			const rows: QueryResultRow[] = [
				{ x: "2024-01-01", y: 10 },
				{ x: "2024-01-02", y: 20 },
			];

			const result = applyRollingInOrder(rows, 10);

			// Usa todos os dados disponíveis
			expect(result[0].y).toBe(10); // apenas 10
			expect(result[1].y).toBe(15); // (10 + 20) / 2
		});
	});
});
