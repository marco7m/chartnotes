/**
 * Testes para funções utilitárias
 * 
 * Para rodar: npm test
 * Para rodar em modo watch: npm run test:watch
 */

import { describe, it, expect } from "vitest";

// Função parseDateLike extraída para testes
function parseDateLike(value: any): Date | null {
	if (!value) return null;

	if (value instanceof Date) {
		const t = value.getTime();
		return Number.isNaN(t) ? null : value;
	}

	if (typeof value === "string") {
		const s = value.trim();
		if (!s) return null;

		// Evita tratar números puros como milissegundo por acidente
		if (/^\d+$/.test(s)) return null;

		const d = new Date(s);
		if (!Number.isNaN(d.getTime())) return d;
	}

	return null;
}

describe("parseDateLike", () => {
	it("deve retornar null para valores vazios", () => {
		expect(parseDateLike(null)).toBeNull();
		expect(parseDateLike(undefined)).toBeNull();
		expect(parseDateLike("")).toBeNull();
		expect(parseDateLike("   ")).toBeNull();
	});

	it("deve retornar Date válida quando recebe Date", () => {
		const date = new Date("2024-01-15");
		const result = parseDateLike(date);
		expect(result).toBeInstanceOf(Date);
		expect(result?.getTime()).toBe(date.getTime());
	});

	it("deve retornar null para Date inválida", () => {
		const invalidDate = new Date("invalid");
		expect(parseDateLike(invalidDate)).toBeNull();
	});

	it("deve parsear strings ISO", () => {
		const result = parseDateLike("2024-01-15");
		expect(result).toBeInstanceOf(Date);
		expect(result?.getFullYear()).toBe(2024);
		expect(result?.getUTCMonth()).toBe(0); // Janeiro é 0
		expect(result?.getUTCDate()).toBe(15);
	});

	it("deve parsear strings ISO com hora", () => {
		const result = parseDateLike("2024-01-15T10:30:00Z");
		expect(result).toBeInstanceOf(Date);
		expect(result?.getUTCFullYear()).toBe(2024);
		expect(result?.getUTCMonth()).toBe(0);
		expect(result?.getUTCDate()).toBe(15);
	});

	it("não deve tratar números puros como datas", () => {
		expect(parseDateLike("123456")).toBeNull();
		expect(parseDateLike("0")).toBeNull();
		expect(parseDateLike("2024")).toBeNull(); // Apenas ano
	});

	it("deve retornar null para strings inválidas", () => {
		expect(parseDateLike("not a date")).toBeNull();
		expect(parseDateLike("abc")).toBeNull();
	});
});

