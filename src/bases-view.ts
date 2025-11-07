// src/bases-view.ts
import {
	BasesView,
	type QueryController,
	parsePropertyId,
} from "obsidian";
import type {
	ChartSpec,
	QueryResult,
	QueryResultRow,
} from "./types";
import type { PropChartsRenderer, RenderContext } from "./renderer";

export const CHARTNOTES_BASES_VIEW_TYPE = "chartnotes-view";

type SelectedProp = {
	/** ID completo da propriedade no Bases, ex: "note.status" ou "file.name". */
	id: string | null;
	/** Nome curto (sem prefixo), ex: "status" ou "name". */
	name: string | null;
};

export class ChartNotesBasesView extends BasesView {
	readonly type = CHARTNOTES_BASES_VIEW_TYPE;

	private containerEl: HTMLElement;
	private renderer: PropChartsRenderer;

	// AGORA recebe o renderer injetado do plugin principal
	constructor(
		controller: QueryController,
		parentEl: HTMLElement,
		renderer: PropChartsRenderer
	) {
		super(controller);
		this.containerEl = parentEl.createDiv(
			"chartnotes-bases-view"
		);
		this.renderer = renderer;
	}

	public onDataUpdated(): void {
		this.containerEl.empty();

		const grouped = (this as any)
			.data?.groupedData as any[] | undefined;

		if (!grouped || grouped.length === 0) {
			this.containerEl.createDiv({
				cls: "prop-charts-empty",
				text: "Sem dados (Base vazia ou sem resultados).",
			});
			return;
		}

		const config = (this as any).config;

		// ------------------------------
		// chartType
		// ------------------------------
		const chartTypeRaw =
			(config?.get("chartType") as string | undefined) ??
			"bar";

		let chartType = (chartTypeRaw || "bar")
			.trim()
			.toLowerCase();

		const allowedTypes = new Set([
			"bar",
			"stacked-bar",
			"line",
			"area",
			"pie",
			"scatter",
			"gantt",
		]);

		if (!allowedTypes.has(chartType)) {
			chartType = "bar";
		}

		// ------------------------------
		// Montagem das linhas (rows)
		// ------------------------------
		let rows: QueryResultRow[];

		if (chartType === "gantt") {
			rows = this.buildRowsForGantt(grouped);
		} else if (chartType === "scatter") {
			rows = this.buildRowsForScatter(grouped);
		} else {
			// bar / stacked-bar / line / area / pie etc.
			rows = this.buildRowsForAggregatedCharts(grouped);
		}

		if (!rows.length) {
			this.containerEl.createDiv({
				cls: "prop-charts-empty",
				text: "Sem linhas para exibir (verifique as propriedades configuradas).",
			});
			return;
		}

		const result: QueryResult = { rows };

		const encoding = this.buildEncoding();

		// ------------------------------
		// Options vindas do Bases
		// ------------------------------
		const titleOpt =
			(config?.get("title") as string | undefined) ?? "";
		const title =
			titleOpt.trim() ||
			config?.name ||
			"Chart Notes (Bases)";

		const backgroundRaw =
			(config?.get("background") as string | undefined) ??
			"";
		const background = backgroundRaw.trim() || undefined;

		const drilldownRaw = config?.get(
			"drilldown"
		) as boolean | undefined;
		const drilldown =
			typeof drilldownRaw === "boolean"
				? drilldownRaw
				: true; // default: true

		let tooltipFieldsRaw = config?.get(
			"tooltipFields"
		) as unknown;

		let tooltipFields: string[] | undefined;
		if (Array.isArray(tooltipFieldsRaw)) {
			tooltipFields = tooltipFieldsRaw
				.map((v) => String(v).trim())
				.filter((v) => v.length > 0);
			if (tooltipFields.length === 0) {
				tooltipFields = undefined;
			}
		}

		const spec: ChartSpec = {
			// ChartSpec.type é o mesmo usado no renderer.ts
			type: chartType as any,

			// `source` não é usado pelo renderer na integração com Bases,
			// então algo neutro aqui.
			source: {
				type: "properties",
				query: "",
			} as any,

			encoding: encoding as any,

			options: {
				title,
				background,
				drilldown,
				tooltipFields,
			},
		};

		const ctx: RenderContext = {
			// Se o Gantt editar datas, dá pra forçar re-render local
			refresh: () => this.onDataUpdated(),
		};

		this.renderer.render(this.containerEl, spec, result, ctx);
	}

	// -------------------------------------------------------------------------
	// Helpers de propriedades / valores
	// -------------------------------------------------------------------------

	private getSelectedProp(configKey: string): SelectedProp {
		const cfg = (this as any).config;

		// valor cru vindo da config
		const rawId = cfg?.get(configKey);

		if (!rawId || typeof rawId !== "string") {
			return { id: null, name: null };
		}

		// parsePropertyId espera um union tipo `note.xxx` / `file.xxx` / `formula.xxx`
		const parsedId =
			rawId as
				| `note.${string}`
				| `formula.${string}`
				| `file.${string}`;

		try {
			const parsed = parsePropertyId(parsedId);
			return {
				id: rawId, // aqui a gente guarda como string normal
				name: parsed?.name ?? rawId,
			};
		} catch {
			// se der erro no parse (ex.: valor estranho), ainda assim devolve algo
			return {
				id: rawId,
				name: rawId,
			};
		}
	}

	/**
	 * Lê um valor da entry e devolve uma string simples (ou null se vazio).
	 */
	private readValue(
		entry: any,
		prop: SelectedProp
	): string | null {
		if (!prop.id) return null;

		let value: any;
		try {
			value = entry.getValue(prop.id);
		} catch {
			return null;
		}

		if (!value) return null;

		try {
			if (
				typeof value.isEmpty === "function" &&
				value.isEmpty()
			)
				return null;
		} catch {
			// ignore
		}

		try {
			const s = value.toString();
			if (s == null) return null;
			const trimmed = String(s).trim();
			return trimmed.length ? trimmed : null;
		} catch {
			return null;
		}
	}

	private parseDate(raw: string | null): Date | null {
		if (!raw) return null;
		const s = raw.trim();
		if (!s) return null;

		const d = new Date(s);
		if (!Number.isNaN(d.getTime())) return d;

		return null;
	}

	// -------------------------------------------------------------------------
	// Builders de linhas para cada tipo de gráfico
	// -------------------------------------------------------------------------

	/**
	 * Para bar / line / area / pie / stacked-bar:
	 * agrega por (x, series).
	 * Se não houver yProperty configurado, faz um "count" de linhas.
	 */
	private buildRowsForAggregatedCharts(
		groups: any[]
	): QueryResultRow[] {
		const xProp = this.getSelectedProp("xProperty");
		const yProp = this.getSelectedProp("yProperty");
		const seriesProp =
			this.getSelectedProp("seriesProperty");

		const byKey = new Map<
			string,
			QueryResultRow & { props: Record<string, any> }
		>();

		for (const group of groups) {
			for (const entry of group.entries as any[]) {
				const file = entry.file;

				const xStr =
					this.readValue(entry, xProp) ??
					(file?.name
						? String(file.name)
						: String(file?.path ?? ""));

				const yStr = this.readValue(entry, yProp);

				let yNum = 1;
				if (yProp.id) {
					if (yStr == null) continue;
					const n = Number(yStr);
					if (Number.isNaN(n)) continue;
					yNum = n;
				}

				const seriesStr =
					this.readValue(entry, seriesProp);
				const series =
					seriesStr != null
						? String(seriesStr)
						: undefined;

				const key = `${xStr}@@${series ?? ""}`;

				let row = byKey.get(key);
				if (!row) {
					row = {
						x: xStr,
						y: 0,
						series,
						notes: [],
						props: {},
					};
					byKey.set(key, row);
				}

				row.y += yNum;

				if (file?.path) {
					row.notes!.push(file.path);
				}

				if (row.props && xProp.name) {
					row.props[xProp.name] = xStr;
				}
				if (row.props && yProp.name && yStr != null) {
					row.props[yProp.name] = yNum;
				}
				if (
					row.props &&
					seriesProp.name &&
					seriesStr != null
				) {
					row.props[seriesProp.name] = seriesStr;
				}
			}
		}

		return Array.from(byKey.values());
	}

	/**
	 * Para scatter: uma linha por entry, X e Y numéricos.
	 */
	private buildRowsForScatter(
		groups: any[]
	): QueryResultRow[] {
		const xProp = this.getSelectedProp("xProperty");
		const yProp = this.getSelectedProp("yProperty");
		const seriesProp =
			this.getSelectedProp("seriesProperty");

		const rows: QueryResultRow[] = [];

		for (const group of groups) {
			for (const entry of group.entries as any[]) {
				const file = entry.file;

				const xStr = this.readValue(entry, xProp);
				const yStr = this.readValue(entry, yProp);
				if (xStr == null || yStr == null) continue;

				const xNum = Number(xStr);
				const yNum = Number(yStr);
				if (Number.isNaN(xNum) || Number.isNaN(yNum))
					continue;

				const seriesStr =
					this.readValue(entry, seriesProp);
				const series =
					seriesStr != null
						? String(seriesStr)
						: undefined;

				const row: QueryResultRow = {
					x: xNum,
					y: yNum,
					series,
					notes: file?.path ? [file.path] : [],
					props: {},
				};

				rows.push(row);
			}
		}

		return rows;
	}

	/**
	 * Para Gantt: uma linha por tarefa com start/end/due etc.
	 */
	private buildRowsForGantt(
		groups: any[]
	): QueryResultRow[] {
		const xProp = this.getSelectedProp("xProperty");
		const seriesProp =
			this.getSelectedProp("seriesProperty");
		const startProp = this.getSelectedProp("startProperty");
		const endProp = this.getSelectedProp("endProperty");
		const dueProp = this.getSelectedProp("dueProperty");
		const durationProp =
			this.getSelectedProp("durationProperty");
		const groupProp =
			this.getSelectedProp("groupProperty");

		const rows: QueryResultRow[] = [];

		for (const group of groups) {
			for (const entry of group.entries as any[]) {
				const file = entry.file;

				const startStr =
					this.readValue(entry, startProp);
				const endStr = this.readValue(entry, endProp);
				if (!startStr || !endStr) continue;

				const start = this.parseDate(startStr);
				const end = this.parseDate(endStr);
				if (!start || !end) continue;

				const label =
					this.readValue(entry, xProp) ??
					(file?.name
						? String(file.name).replace(
								/\.md$/i,
								""
						  )
						: String(file?.path ?? ""));

				const dueStr =
					this.readValue(entry, dueProp);
				const due = this.parseDate(dueStr ?? null);

				const durationStr =
					this.readValue(entry, durationProp);
				const durationMinutes =
					durationStr != null
						? Number(durationStr)
						: undefined;
				const hasDuration =
					typeof durationMinutes === "number" &&
					!Number.isNaN(durationMinutes);

				const seriesStr =
					this.readValue(entry, seriesProp);
				const series =
					seriesStr != null
						? String(seriesStr)
						: undefined;

				const groupVal =
					this.readValue(entry, groupProp);

				const props: Record<string, any> = {};

				if (durationProp.name && hasDuration) {
					props[durationProp.name] = durationMinutes;
				}
				if (groupProp.name && groupVal != null) {
					props[groupProp.name] = groupVal;
				}

				const row: QueryResultRow = {
					x: label,
					y: 0,
					series,
					start,
					end,
					due: due ?? undefined,
					notes: file?.path ? [file.path] : [],
					props,
				};

				rows.push(row);
			}
		}

		return rows;
	}

	/**
	 * Monta o objeto encoding usado pelo Gantt (e ignorado pela maioria
	 * dos outros gráficos, mas não faz mal).
	 */
	private buildEncoding(): any {
		const xProp = this.getSelectedProp("xProperty");
		const yProp = this.getSelectedProp("yProperty");
		const seriesProp =
			this.getSelectedProp("seriesProperty");
		const startProp = this.getSelectedProp("startProperty");
		const endProp = this.getSelectedProp("endProperty");
		const dueProp = this.getSelectedProp("dueProperty");
		const durationProp =
			this.getSelectedProp("durationProperty");
		const groupProp =
			this.getSelectedProp("groupProperty");

		return {
			x: xProp.name ?? "x",
			y: yProp.name ?? "y",
			series: seriesProp.name ?? "series",
			start: startProp.name ?? "start",
			end: endProp.name ?? "end",
			due: dueProp.name ?? "due",
			duration: durationProp.name ?? "duration",
			group: groupProp.name ?? "group",
		};
	}
}
