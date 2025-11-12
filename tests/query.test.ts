/**
 * Testes para funções de query e agregação
 */

import { describe, it, expect } from "vitest";
import type { QueryResultRow } from "../src/types";

// Funções extraídas para testes
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
	throw new Error(`aggregate.rolling inválido: ${String(rolling)}`);
}

describe("compareXAsc", () => {
	it("deve comparar datas corretamente", () => {
		const a: QueryResultRow = { x: new Date("2024-01-15"), y: 10 };
		const b: QueryResultRow = { x: new Date("2024-01-20"), y: 20 };
		
		expect(compareXAsc(a, b)).toBeLessThan(0);
		expect(compareXAsc(b, a)).toBeGreaterThan(0);
		expect(compareXAsc(a, a)).toBe(0);
	});

	it("deve comparar strings alfabeticamente", () => {
		const a: QueryResultRow = { x: "apple", y: 10 };
		const b: QueryResultRow = { x: "banana", y: 20 };
		
		expect(compareXAsc(a, b)).toBeLessThan(0);
		expect(compareXAsc(b, a)).toBeGreaterThan(0);
	});

	it("deve comparar números como strings", () => {
		const a: QueryResultRow = { x: "10", y: 10 };
		const b: QueryResultRow = { x: "20", y: 20 };
		
		expect(compareXAsc(a, b)).toBeLessThan(0);
	});
});

describe("compareXSeriesAsc", () => {
	it("deve comparar primeiro por X, depois por série", () => {
		const a: QueryResultRow = { x: "2024-01-15", y: 10, series: "A" };
		const b: QueryResultRow = { x: "2024-01-15", y: 20, series: "B" };
		
		expect(compareXSeriesAsc(a, b)).toBeLessThan(0);
		expect(compareXSeriesAsc(b, a)).toBeGreaterThan(0);
	});

	it("deve usar X quando séries são iguais", () => {
		const a: QueryResultRow = { x: new Date("2024-01-15"), y: 10, series: "A" };
		const b: QueryResultRow = { x: new Date("2024-01-20"), y: 20, series: "A" };
		
		expect(compareXSeriesAsc(a, b)).toBeLessThan(0);
	});

	it("deve tratar séries vazias como string vazia", () => {
		const a: QueryResultRow = { x: "2024-01-15", y: 10 };
		const b: QueryResultRow = { x: "2024-01-15", y: 20, series: "A" };
		
		expect(compareXSeriesAsc(a, b)).toBeLessThan(0); // "" < "A"
	});
});

describe("applyCumulativeInOrder", () => {
	it("deve calcular soma cumulativa corretamente", () => {
		const rows: QueryResultRow[] = [
			{ x: "2024-01-01", y: 10 },
			{ x: "2024-01-02", y: 20 },
			{ x: "2024-01-03", y: 30 },
		];

		const result = applyCumulativeInOrder(rows);

		expect(result[0].y).toBe(10);
		expect(result[1].y).toBe(30); // 10 + 20
		expect(result[2].y).toBe(60); // 30 + 30
	});

	it("deve calcular soma cumulativa por série separadamente", () => {
		const rows: QueryResultRow[] = [
			{ x: "2024-01-01", y: 10, series: "A" },
			{ x: "2024-01-01", y: 5, series: "B" },
			{ x: "2024-01-02", y: 20, series: "A" },
			{ x: "2024-01-02", y: 15, series: "B" },
		];

		const result = applyCumulativeInOrder(rows);

		// Série A
		expect(result[0].y).toBe(10);
		expect(result[2].y).toBe(30); // 10 + 20

		// Série B
		expect(result[1].y).toBe(5);
		expect(result[3].y).toBe(20); // 5 + 15
	});

	it("deve manter monotonicidade (nunca diminui)", () => {
		const rows: QueryResultRow[] = [
			{ x: "2024-01-01", y: 10 },
			{ x: "2024-01-02", y: 5 }, // valor menor
			{ x: "2024-01-03", y: 20 },
		];

		const result = applyCumulativeInOrder(rows);

		expect(result[0].y).toBe(10);
		expect(result[1].y).toBe(15); // 10 + 5 (ainda aumenta)
		expect(result[2].y).toBe(35); // 15 + 20
	});

	it("deve tratar séries vazias como __no_series__", () => {
		const rows: QueryResultRow[] = [
			{ x: "2024-01-01", y: 10 },
			{ x: "2024-01-02", y: 20 },
		];

		const result = applyCumulativeInOrder(rows);

		expect(result[0].y).toBe(10);
		expect(result[1].y).toBe(30);
	});
});

describe("parseRollingWindow", () => {
	it("deve parsear números corretamente", () => {
		expect(parseRollingWindow(7)).toBe(7);
		expect(parseRollingWindow(0)).toBe(0);
		expect(parseRollingWindow(10.5)).toBe(10); // floor
	});

	it("deve parsear strings numéricas", () => {
		expect(parseRollingWindow("7")).toBe(7);
		expect(parseRollingWindow("10")).toBe(10);
		expect(parseRollingWindow(" 5 ")).toBe(5);
	});

	it("deve retornar 0 para valores inválidos", () => {
		expect(parseRollingWindow(null)).toBe(0);
		expect(parseRollingWindow(undefined)).toBe(0);
		expect(parseRollingWindow(-5)).toBe(0);
	});

	it("deve lançar erro para strings não numéricas", () => {
		expect(() => parseRollingWindow("invalid")).toThrow();
		expect(() => parseRollingWindow("abc")).toThrow();
	});
});

