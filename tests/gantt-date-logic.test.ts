/**
 * Tests for Gantt chart date logic
 */

import { describe, it, expect } from "vitest";

// Extract Gantt date logic from bases-view.ts
function parseDate(raw: string | null): Date | null {
	if (!raw) return null;
	const d = new Date(raw.trim());
	return Number.isNaN(d.getTime()) ? null : d;
}

interface QueryResultRow {
	x: any;
	y: number;
	notes?: string[];
	series?: string;
	props?: Record<string, any>;
	start?: Date;
	end?: Date;
	due?: Date;
}

const DEFAULT_BLOCK_MINUTES = 60;
const MILLISECONDS_PER_MINUTE = 60000;

/**
 * Simplified version of buildRowsForGantt focusing on date logic
 */
function processGanttDateLogic(
	startStr: string | null,
	endStr: string | null,
	dueStr: string | null,
	durationStr: string | null
): { start: Date | null; end: Date | null; valid: boolean } {
	const durationMinutes = durationStr != null ? Number(durationStr) : NaN;
	const hasDuration = Number.isFinite(durationMinutes) && durationMinutes > 0;
	const durationMs = hasDuration
		? durationMinutes * MILLISECONDS_PER_MINUTE
		: DEFAULT_BLOCK_MINUTES * MILLISECONDS_PER_MINUTE;

	const explicitStart = parseDate(startStr);
	const explicitEnd = parseDate(endStr);
	const due = parseDate(dueStr);

	let start = explicitStart;
	let end = explicitEnd;

	// Date logic: try to build a valid start/end interval
	// 1) If both start and end exist, use them as-is

	// 2) Only start → use duration forward (or default block)
	if (start && !end) {
		end = new Date(start.getTime() + durationMs);
	}

	// 3) Only end → use duration backward (or default block)
	if (!start && end) {
		start = new Date(end.getTime() - durationMs);
	}

	// 4) No start or end, but has due date
	if (!start && !end && due) {
		if (hasDuration) {
			end = due;
			start = new Date(due.getTime() - durationMs);
		} else {
			// No duration → short block around due date
			start = due;
			end = new Date(due.getTime() + durationMs);
		}
	}

	// Still couldn't build interval? Invalid
	if (!start || !end) return { start: null, end: null, valid: false };

	// Ensure start <= end
	if (start.getTime() > end.getTime()) {
		const temp = start;
		start = end;
		end = temp;
	}

	return { start, end, valid: true };
}

describe("Gantt Date Logic", () => {
	describe("start and end both provided", () => {
		it("should usar start e end como fornecidos quando ambos existem", () => {
			const result = processGanttDateLogic(
				"2024-01-15T10:00:00",
				"2024-01-15T12:00:00",
				null,
				null
			);

			expect(result.valid).toBe(true);
			expect(result.start?.getTime()).toBe(new Date("2024-01-15T10:00:00").getTime());
			expect(result.end?.getTime()).toBe(new Date("2024-01-15T12:00:00").getTime());
		});

		it("should trocar start e end se start > end", () => {
			const result = processGanttDateLogic(
				"2024-01-15T14:00:00",
				"2024-01-15T12:00:00",
				null,
				null
			);

			expect(result.valid).toBe(true);
			expect(result.start?.getTime()).toBe(new Date("2024-01-15T12:00:00").getTime());
			expect(result.end?.getTime()).toBe(new Date("2024-01-15T14:00:00").getTime());
		});
	});

	describe("only start provided", () => {
		it("should usar duração padrão quando só start é fornecido", () => {
			const result = processGanttDateLogic(
				"2024-01-15T10:00:00",
				null,
				null,
				null
			);

			expect(result.valid).toBe(true);
			expect(result.start?.getTime()).toBe(new Date("2024-01-15T10:00:00").getTime());
			expect(result.end?.getTime()).toBe(new Date("2024-01-15T11:00:00").getTime()); // +1 hora
		});

		it("should usar duração personalizada quando fornecida", () => {
			const result = processGanttDateLogic(
				"2024-01-15T10:00:00",
				null,
				null,
				"90" // 90 minutos
			);

			expect(result.valid).toBe(true);
			expect(result.start?.getTime()).toBe(new Date("2024-01-15T10:00:00").getTime());
			expect(result.end?.getTime()).toBe(new Date("2024-01-15T11:30:00").getTime()); // +90 minutos
		});

		it("should ignorar duração zero ou negativa", () => {
			const result = processGanttDateLogic(
				"2024-01-15T10:00:00",
				null,
				null,
				"0"
			);

			expect(result.valid).toBe(true);
			expect(result.start?.getTime()).toBe(new Date("2024-01-15T10:00:00").getTime());
			expect(result.end?.getTime()).toBe(new Date("2024-01-15T11:00:00").getTime()); // usa padrão
		});
	});

	describe("only end provided", () => {
		it("should usar duração padrão quando só end é fornecido", () => {
			const result = processGanttDateLogic(
				null,
				"2024-01-15T12:00:00",
				null,
				null
			);

			expect(result.valid).toBe(true);
			expect(result.start?.getTime()).toBe(new Date("2024-01-15T11:00:00").getTime()); // -1 hora
			expect(result.end?.getTime()).toBe(new Date("2024-01-15T12:00:00").getTime());
		});

		it("should usar duração personalizada quando fornecida", () => {
			const result = processGanttDateLogic(
				null,
				"2024-01-15T12:00:00",
				null,
				"120" // 2 horas
			);

			expect(result.valid).toBe(true);
			expect(result.start?.getTime()).toBe(new Date("2024-01-15T10:00:00").getTime()); // -2 horas
			expect(result.end?.getTime()).toBe(new Date("2024-01-15T12:00:00").getTime());
		});
	});

	describe("only due date provided", () => {
		it("should criar bloco curto ao redor da due date sem duração", () => {
			const result = processGanttDateLogic(
				null,
				null,
				"2024-01-15T14:00:00",
				null
			);

			expect(result.valid).toBe(true);
			expect(result.start?.getTime()).toBe(new Date("2024-01-15T14:00:00").getTime());
			expect(result.end?.getTime()).toBe(new Date("2024-01-15T15:00:00").getTime()); // +1 hora
		});

		it("should usar duração personalizada com due date", () => {
			const result = processGanttDateLogic(
				null,
				null,
				"2024-01-15T14:00:00",
				"30" // 30 minutos
			);

			expect(result.valid).toBe(true);
			expect(result.start?.getTime()).toBe(new Date("2024-01-15T13:30:00").getTime()); // due - 30min
			expect(result.end?.getTime()).toBe(new Date("2024-01-15T14:00:00").getTime()); // due
		});
	});

	describe("no dates provided", () => {
		it("should retornar inválido quando nenhuma data é fornecida", () => {
			const result = processGanttDateLogic(null, null, null, null);
			expect(result.valid).toBe(false);
			expect(result.start).toBeNull();
			expect(result.end).toBeNull();
		});
	});

	describe("invalid inputs", () => {
		it("should retornar inválido para datas inválidas", () => {
			const result = processGanttDateLogic("invalid-date", null, null, null);
			expect(result.valid).toBe(false);
		});

		it("should lidar com duração inválida", () => {
			const result = processGanttDateLogic(
				"2024-01-15T10:00:00",
				null,
				null,
				"invalid"
			);

			expect(result.valid).toBe(true);
			expect(result.start?.getTime()).toBe(new Date("2024-01-15T10:00:00").getTime());
			expect(result.end?.getTime()).toBe(new Date("2024-01-15T11:00:00").getTime()); // usa padrão
		});
	});

	describe("edge cases", () => {
		it("should funcionar com datas no mesmo dia", () => {
			const result = processGanttDateLogic(
				"2024-01-15T09:00:00",
				"2024-01-15T17:00:00",
				null,
				null
			);

			expect(result.valid).toBe(true);
			expect(result.start?.getDate()).toBe(15);
			expect(result.end?.getDate()).toBe(15);
		});

		it("should funcionar com datas em dias diferentes", () => {
			const result = processGanttDateLogic(
				"2024-01-15T22:00:00",
				"2024-01-16T02:00:00",
				null,
				null
			);

			expect(result.valid).toBe(true);
			expect(result.start?.getDate()).toBe(15);
			expect(result.end?.getDate()).toBe(16);
		});

		it("should lidar com duration muito grande", () => {
			const result = processGanttDateLogic(
				"2024-01-15T10:00:00",
				null,
				null,
				"1440" // 24 horas
			);

			expect(result.valid).toBe(true);
			expect(result.start?.getTime()).toBe(new Date("2024-01-15T10:00:00").getTime());
			expect(result.end?.getTime()).toBe(new Date("2024-01-16T10:00:00").getTime());
		});

		it("should lidar com duration muito pequena", () => {
			const result = processGanttDateLogic(
				"2024-01-15T10:00:00",
				null,
				null,
				"1" // 1 minuto
			);

			expect(result.valid).toBe(true);
			expect(result.start?.getTime()).toBe(new Date("2024-01-15T10:00:00").getTime());
			expect(result.end?.getTime()).toBe(new Date("2024-01-15T10:01:00").getTime());
		});
	});

	describe("timezone handling", () => {
	it("should ignorar timezone na entrada", () => {
		const result = processGanttDateLogic(
			"2024-01-15T10:00:00Z",
			"2024-01-15T12:00:00Z",
			null,
			null
		);

		expect(result.valid).toBe(true);
		// Timezone is ignored, so Z means local time
		expect(result.start?.getUTCHours()).toBe(10);
		expect(result.end?.getUTCHours()).toBe(12);
	});
	});
});
