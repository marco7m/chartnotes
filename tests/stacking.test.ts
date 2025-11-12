/**
 * Testes para lógica de stacking (empilhamento)
 */

import { describe, it, expect } from "vitest";

/**
 * Simula a lógica de stacking usada em renderStackedArea
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
	it("deve empilhar valores corretamente", () => {
		const seriesKeys = ["A", "B", "C"];
		const seriesValues = new Map([
			["A", 10],
			["B", 20],
			["C", 30],
		]);

		const result = calculateStackedValues(seriesKeys, seriesValues);

		// Série A: base=0, top=10
		expect(result.get("A")?.base).toBe(0);
		expect(result.get("A")?.top).toBe(10);

		// Série B: base=10, top=30
		expect(result.get("B")?.base).toBe(10);
		expect(result.get("B")?.top).toBe(30);

		// Série C: base=30, top=60
		expect(result.get("C")?.base).toBe(30);
		expect(result.get("C")?.top).toBe(60);
	});

	it("deve tratar valores zero corretamente", () => {
		const seriesKeys = ["A", "B", "C"];
		const seriesValues = new Map([
			["A", 10],
			["B", 0], // valor zero
			["C", 20],
		]);

		const result = calculateStackedValues(seriesKeys, seriesValues);

		expect(result.get("A")?.base).toBe(0);
		expect(result.get("A")?.top).toBe(10);
		expect(result.get("B")?.base).toBe(10);
		expect(result.get("B")?.top).toBe(10); // base = top quando valor é 0
		expect(result.get("C")?.base).toBe(10);
		expect(result.get("C")?.top).toBe(30);
	});

	it("deve tratar séries faltantes como zero", () => {
		const seriesKeys = ["A", "B", "C"];
		const seriesValues = new Map([
			["A", 10],
			// B não está no map
			["C", 20],
		]);

		const result = calculateStackedValues(seriesKeys, seriesValues);

		expect(result.get("A")?.base).toBe(0);
		expect(result.get("A")?.top).toBe(10);
		expect(result.get("B")?.base).toBe(10);
		expect(result.get("B")?.top).toBe(10); // valor padrão 0
		expect(result.get("C")?.base).toBe(10);
		expect(result.get("C")?.top).toBe(30);
	});

	it("deve garantir que bases e tops sejam contínuos", () => {
		const seriesKeys = ["A", "B", "C", "D"];
		const seriesValues = new Map([
			["A", 5],
			["B", 10],
			["C", 15],
			["D", 20],
		]);

		const result = calculateStackedValues(seriesKeys, seriesValues);

		// Verificar continuidade: top de uma série = base da próxima
		expect(result.get("A")?.top).toBe(result.get("B")?.base);
		expect(result.get("B")?.top).toBe(result.get("C")?.base);
		expect(result.get("C")?.top).toBe(result.get("D")?.base);
	});

	it("deve calcular total correto", () => {
		const seriesKeys = ["A", "B", "C"];
		const seriesValues = new Map([
			["A", 10],
			["B", 20],
			["C", 30],
		]);

		const result = calculateStackedValues(seriesKeys, seriesValues);

		// O topo da última série deve ser a soma total
		const lastTop = result.get("C")?.top;
		expect(lastTop).toBe(60); // 10 + 20 + 30
	});
});

