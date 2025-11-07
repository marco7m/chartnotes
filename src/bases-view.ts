// src/bases-view.ts
import {
	BasesView,
	QueryController,
	BasesQueryResult,
	HoverParent,
	HoverPopover,
	Plugin,
} from "obsidian";

import type { ChartSpec, QueryResult, QueryResultRow } from "./types";
import { PropChartsRenderer } from "./renderer";

// ID da view no Bases
export const ChartNotesBasesViewType = "chartnotes-view";

type ConfigKey =
	| "chartType"
	| "xProp"
	| "yProp"
	| "seriesProp"
	| "title"
	| "background"
	| "cumulative"
	| "rolling";

export class ChartNotesBasesView extends BasesView implements HoverParent {
	readonly type = ChartNotesBasesViewType;

	// exigido pelo HoverParent
	hoverPopover: HoverPopover | null = null;

	private containerEl: HTMLElement;
	private renderer: PropChartsRenderer;

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.containerEl = parentEl.createDiv("chartnotes-bases-view-container");
		this.renderer = new PropChartsRenderer();
	}

	// -----------------------------------------------------------------------
	// Helpers de config
	// -----------------------------------------------------------------------

	private getConfigString(key: ConfigKey): string {
		const v = this.config.get(key);
		if (v == null) return "";
		return String(v).trim();
	}

	private getConfigBool(key: ConfigKey): boolean {
		const v = this.config.get(key);
		if (v == null) return false;
		if (typeof v === "boolean") return v;
		const s = String(v).toLowerCase();
		return s === "true" || s === "1" || s === "yes" || s === "on";
	}

	// -----------------------------------------------------------------------
	// Bases hook
	// -----------------------------------------------------------------------

	public onDataUpdated(): void {
		this.containerEl.empty();

		const data = this.data as BasesQueryResult;
		if (!data || !data.groupedData?.length) {
			this.containerEl.createDiv({
				text: "Chart Notes (Bases): nenhuma nota neste Base.",
				cls: "prop-charts-empty",
			});
			return;
		}

		const chartType = this.getConfigString("chartType") || "bar";
		const xProp = this.getConfigString("xProp");
		const yProp = this.getConfigString("yProp");
		const seriesProp = this.getConfigString("seriesProp");
		const title =
			this.getConfigString("title") ||
			this.config.name ||
			"Chart Notes (Bases)";
		const background =
			this.getConfigString("background") || "var(--background-primary)";
		const cumulative = this.getConfigBool("cumulative");
		const rolling = this.getConfigString("rolling");

		// precisa pelo menos do X
		if (!xProp) {
			const info = this.containerEl.createDiv({
				cls: "prop-charts-empty",
			});
			info.createDiv({
				text: "Chart Notes (Bases): configure a view nas opções:",
			});
			const ul = info.createEl("ul");
			ul.createEl("li", {
				text: 'Escolha "Chart type" (ex: bar, line, area, pie, scatter, stacked-bar).',
			});
			ul.createEl("li", {
				text: 'Defina "X property" (ex: file.name, note.status, note.scheduled).',
			});
			ul.createEl("li", {
				text: 'Opcional: "Y property" (numérico) e "Series property" (cores/legenda).',
			});
			return;
		}

		const queryResult = this.buildQueryResultFromBases(
			data,
			xProp,
			yProp,
			seriesProp
		);

		if (!queryResult.rows.length) {
			this.containerEl.createDiv({
				cls: "prop-charts-empty",
				text: "Chart Notes (Bases): nenhum dado válido para o gráfico.",
			});
			return;
		}

		const spec: ChartSpec = {
			type: chartType as ChartSpec["type"],
			source: { paths: [] },
			encoding: {},
			aggregate: {},
			sort: {},
			options: {
				title,
				background,
			},
		};

		// pós-processamento simples pra line/area
		if (
			(chartType === "line" || chartType === "area") &&
			(cumulative || rolling)
		) {
			this.applyPostAggregations(queryResult, { cumulative, rolling });
		}

		this.renderer.render(this.containerEl, spec, queryResult);
	}

	// -----------------------------------------------------------------------
	// Conversão Bases -> QueryResult
	// -----------------------------------------------------------------------

	private buildQueryResultFromBases(
		data: BasesQueryResult,
		xPropId: string,
		yPropId: string,
		seriesPropId: string
	): QueryResult {
		const rows: QueryResultRow[] = [];

		for (const group of data.groupedData) {
			for (const entry of group.entries) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const e: any = entry;

				const xVal = e.getValue ? e.getValue(xPropId) : null;
				if (!xVal || xVal.isEmpty?.()) continue;
				const xPrimitive = this.toPrimitive(xVal);

				let yVal = 1;
				if (yPropId) {
					const yRaw = e.getValue ? e.getValue(yPropId) : null;
					if (!yRaw || yRaw.isEmpty?.()) continue;
					const n = this.toNumber(yRaw);
					if (n == null) continue;
					yVal = n;
				}

				let series: string | undefined;
				if (seriesPropId) {
					const sRaw = e.getValue ? e.getValue(seriesPropId) : null;
					if (sRaw && !sRaw.isEmpty?.()) {
						series = String(this.toPrimitive(sRaw));
					}
				}

				const file = e.file;
				const notePath: string = file?.path ?? "";
				const noteName: string = file?.name ?? notePath;

				const row: QueryResultRow = {
					x: xPrimitive,
					y: yVal,
					series,
					notes: notePath ? [notePath] : [],
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					props: { __fromBases: true, noteName } as any,
				};

				rows.push(row);
			}
		}

		return { rows };
	}

	private toPrimitive(v: unknown): string | number | Date {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const anyV: any = v;
		if (anyV?.valueOf) {
			const vv = anyV.valueOf();
			if (vv instanceof Date) return vv;
			if (typeof vv === "number") return vv;
			if (typeof vv === "string") return vv;
		}
		if (v instanceof Date) return v;
		if (typeof v === "number") return v;
		if (typeof v === "string") return v;
		return String(v);
	}

	private toNumber(v: unknown): number | null {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const anyV: any = v;
		if (anyV?.isEmpty?.()) return null;

		let raw: unknown = v;
		if (anyV?.valueOf) raw = anyV.valueOf();

		if (typeof raw === "number" && Number.isFinite(raw)) return raw;
		const n = Number(raw as any);
		return Number.isFinite(n) ? n : null;
	}

	// -----------------------------------------------------------------------
	// Pós-agregações (cumulativo / rolling)
	// -----------------------------------------------------------------------

	private applyPostAggregations(
		result: QueryResult,
		opts: { cumulative: boolean; rolling: string }
	) {
		const rows = [...(result.rows ?? [])];
		if (!rows.length) return;

		// ordena por X
		rows.sort((a, b) => {
			const ax =
				a.x instanceof Date
					? a.x.getTime()
					: typeof a.x === "number"
					? a.x
					: String(a.x);
			const bx =
				b.x instanceof Date
					? b.x.getTime()
					: typeof b.x === "number"
					? b.x
					: String(b.x);

			const sa = String(ax);
			const sb = String(bx);
			if (sa < sb) return -1;
			if (sa > sb) return 1;
			return 0;
		});

		if (opts.cumulative) {
			let acc = 0;
			for (const r of rows) {
				acc += r.y;
				r.y = acc;
			}
		}

		const win = parseInt(opts.rolling, 10);
		if (!Number.isNaN(win) && win > 1) {
			const buf: number[] = [];
			for (const r of rows) {
				buf.push(r.y);
				if (buf.length > win) buf.shift();
				const sum = buf.reduce((a, b) => a + b, 0);
				r.y = sum / buf.length;
			}
		}

		result.rows = rows;
	}
}

// ---------------------------------------------------------------------------
// Função helper para registrar a view a partir do main.ts
// ---------------------------------------------------------------------------

export function registerChartNotesBasesView(plugin: Plugin): void {
	plugin.registerBasesView(ChartNotesBasesViewType, {
		name: "Chart Notes",
		icon: "lucide-line-chart",
		factory: (controller: QueryController, containerEl: HTMLElement) =>
			new ChartNotesBasesView(controller, containerEl),
		// Opções que aparecem na UI do Bases
		options: () =>
			[
				{
					type: "text",
					displayName:
						"Chart type (bar, line, area, pie, scatter, stacked-bar)",
					key: "chartType",
					default: "bar",
				},
				{
					type: "text",
					displayName:
						"X property (ex: file.name, note.status, note.scheduled)",
					key: "xProp",
					default: "file.name",
				},
				{
					type: "text",
					displayName:
						"Y property (numérico, ex: note.timeEstimate). vazio = conta linhas",
					key: "yProp",
					default: "",
				},
				{
					type: "text",
					displayName:
						"Series property (cores/legenda, ex: note.status ou note.priority)",
					key: "seriesProp",
					default: "",
				},
				{
					type: "text",
					displayName: "Título do gráfico",
					key: "title",
					default: "",
				},
				{
					type: "text",
					displayName: "Cor de fundo (hex ou CSS var)",
					key: "background",
					default: "var(--background-primary)",
				},
				{
					type: "toggle",
					displayName: "Linha cumulativa (apenas line/area)",
					key: "cumulative",
					default: false,
				},
				{
					type: "text",
					displayName:
						"Rolling window (apenas line/area, em número de pontos. ex: 7)",
					key: "rolling",
					default: "",
				},
			] as any,
	});
}

