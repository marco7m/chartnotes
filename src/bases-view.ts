// src/bases-view.ts
import {
	BasesView,
	type QueryController,
	parsePropertyId,
} from "obsidian";
import type { ChartSpec, QueryResult, QueryResultRow } from "./types";
import type { PropChartsRenderer, RenderContext } from "./renderer";

export const CHARTNOTES_BASES_VIEW_TYPE = "chartnotes-view";

const CHART_TYPES = [
	"bar",
	"stacked-bar",
	"line",
	"area",
	"pie",
	"scatter",
	"gantt",
] as const;
type AllowedChartType = (typeof CHART_TYPES)[number];

function normalizeChartType(raw: unknown): AllowedChartType {
	const t = String(raw ?? "bar").trim().toLowerCase();
	return (CHART_TYPES.includes(t as AllowedChartType) ? t : "bar") as AllowedChartType;
}

const AGGREGATION_MODES = ["sum", "count", "cumulative-sum"] as const;
type AggregationMode = (typeof AGGREGATION_MODES)[number];

function normalizeAggregationMode(raw: unknown): AggregationMode {
	const t = String(raw ?? "sum").trim().toLowerCase();
	return (AGGREGATION_MODES.includes(t as AggregationMode) ? t : "sum") as AggregationMode;
}

const X_BUCKETS = ["auto", "none", "day", "week", "month", "quarter", "year"] as const;
type XBucket = (typeof X_BUCKETS)[number];

function normalizeXBucket(raw: unknown): XBucket {
	const t = String(raw ?? "auto").trim().toLowerCase();
	return (X_BUCKETS.includes(t as XBucket) ? t : "auto") as XBucket;
}

type SelectedProp = {
	id: string | null;
	name: string | null;
};

type PropsMap = Record<string, any>;

const MISSING_LABEL = "(missing)";

export class ChartNotesBasesView extends BasesView {
	readonly type = CHARTNOTES_BASES_VIEW_TYPE;

	private rootEl: HTMLElement;
	private renderer: PropChartsRenderer;

	constructor(
		controller: QueryController,
		containerEl: HTMLElement,
		renderer: PropChartsRenderer,
	) {
		super(controller);
		this.renderer = renderer;
		this.rootEl = containerEl.createDiv("chartnotes-bases-view");
	}

	public onDataUpdated(): void {
		this.rootEl.empty();

		const data: any = (this as any).data;
		const grouped = (data?.groupedData ?? []) as any[];

		if (!grouped.length) {
			this.rootEl.createDiv({
				cls: "prop-charts-empty",
				text: "No data in this view.",
			});
			return;
		}

		const cfg: any = (this as any).config;

		const chartType = normalizeChartType(cfg?.get("chartType") ?? "bar");
		const isPie = chartType === "pie";
		const isScatter = chartType === "scatter";
		const isGantt = chartType === "gantt";

		const aggModeCfg = normalizeAggregationMode(cfg?.get("aggregateMode"));
		const allowCumulative = chartType === "line" || chartType === "area";
		const aggMode: AggregationMode =
			aggModeCfg === "cumulative-sum" && !allowCumulative ? "sum" : aggModeCfg;

		const rawXBucket = normalizeXBucket(cfg?.get("xBucket"));
		const xBucket: XBucket = isPie || isScatter || isGantt ? "none" : rawXBucket;

		const xProp = this.getPropFromConfig("xProperty");
		const ganttLabelProp = this.getPropFromConfig("ganttLabelProperty");
		const yProp = this.getPropFromConfig("yProperty");
		let seriesProp = this.getPropFromConfig("seriesProperty");
		if (isPie) {
			// Pie nunca usa séries: sempre agregamos só por categoria.
			seriesProp = { id: null, name: null };
		}
		const startProp = this.getPropFromConfig("startProperty");
		const endProp = this.getPropFromConfig("endProperty");
		const dueProp = this.getPropFromConfig("dueProperty");
		const scheduledProp = this.getPropFromConfig("scheduledProperty");
		const durationProp = this.getPropFromConfig("durationProperty");
		const groupProp = this.getPropFromConfig("groupProperty");

		if (!isGantt && !xProp.id) {
			this.rootEl.createDiv({
				cls: "prop-charts-empty",
				text: "Configure the 'X axis / category' property in view options.",
			});
			return;
		}

		if (isScatter && (!xProp.id || !yProp.id)) {
			this.rootEl.createDiv({
				cls: "prop-charts-empty",
				text: "Scatter plots need both X and Y numeric properties.",
			});
			return;
		}

		if (
			isGantt &&
				!(startProp.id || endProp.id || scheduledProp.id || dueProp.id)
		) {
			this.rootEl.createDiv({
				cls: "prop-charts-empty",
				text: "Gantt needs Start/End or Scheduled/Due with Duration.",
			});
			return;
		}

		// Para Gantt, o label vem de uma property própria se existir;
		// senão cai no mesmo X padrão.
		const labelPropForGantt: SelectedProp =
			isGantt && ganttLabelProp.id
				? ganttLabelProp
				: isGantt
					? xProp
					: { id: null, name: null };

		let rows: QueryResultRow[];

		if (isGantt) {
			rows = this.buildRowsForGantt(
				grouped,
				labelPropForGantt,
				seriesProp,
				startProp,
				endProp,
				dueProp,
				scheduledProp,
				durationProp,
				groupProp,
			);
		} else if (isScatter) {
			rows = this.buildRowsForScatter(grouped, xProp, yProp, seriesProp);
		} else {
			const forceCountForPie = isPie;
			rows = this.buildRowsForAggregatedCharts(
				grouped,
				xProp,
				yProp,
				seriesProp,
				aggMode,
				xBucket,
				forceCountForPie,
			);
		}

		if (!rows.length) {
			this.rootEl.createDiv({
				cls: "prop-charts-empty",
				text: "No rows to display (check X/Y/aggregation).",
			});
			return;
		}

		const result: QueryResult = { rows };

		const titleRaw = (cfg?.get("title") as string | undefined) ?? "";
		const title = titleRaw.trim() || cfg?.name || "Chart Notes (Bases)";

		const drilldownCfg = cfg?.get("drilldown");
		const drilldown = typeof drilldownCfg === "boolean" ? drilldownCfg : true;

		const encoding = this.buildEncoding({
			x: xProp,
			y: yProp,
			series: seriesProp,
			start: startProp,
			end: endProp,
			due: dueProp,
			duration: durationProp,
			group: groupProp,
			label: labelPropForGantt,
			aggMode,
			xBucket,
			chartType,
		});

		const spec: ChartSpec = {
			type: chartType as any,
			source: { type: "properties", query: "" } as any,
			encoding: encoding as any,
			options: {
				title,
				drilldown,
			},
		};

		const ctx: RenderContext = {
			refresh: () => this.onDataUpdated(),
		};

		this.renderer.render(this.rootEl, spec, result, ctx);
	}

	// ---------- helpers de propriedades/valores ----------

	private getPropFromConfig(key: string): SelectedProp {
		const cfg: any = (this as any).config;
		const raw = cfg?.get?.(key) as string | undefined;
		if (!raw) return { id: null, name: null };

		const trimmed = raw.trim();
		if (!trimmed || trimmed === "undefined" || trimmed === "null") {
			return { id: null, name: null };
		}

		const id = trimmed;
		try {
			const parsed = parsePropertyId(
				id as `note.${string}` | `file.${string}` | `formula.${string}`,
			);
			return { id, name: (parsed as any).name ?? id };
		} catch {
			return { id, name: id };
		}
	}

	private readValue(entry: any, prop: SelectedProp): string | null {
		if (!prop.id) return null;

		let value: any;
		try {
			value = entry.getValue(prop.id);
		} catch {
			return null;
		}

		if (!value) return null;

		try {
			if (typeof value.isEmpty === "function" && value.isEmpty()) {
				return null;
			}
		} catch {}

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
		const d = new Date(raw.trim());
		return Number.isNaN(d.getTime()) ? null : d;
	}

	private compareX(a: any, b: any): number {
		const da = this.parseDate(a != null ? String(a) : null);
		const db = this.parseDate(b != null ? String(b) : null);
		if (da && db) return da.getTime() - db.getTime();

		const na = Number(a);
		const nb = Number(b);
		if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;

		return String(a ?? "").localeCompare(String(b ?? ""));
	}

	// ---------- bucketing de datas ----------

	private fmtDate(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${y}-${m}-${day}`;
	}

	private startOfWeek(d: Date): Date {
		const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
		const day = (x.getDay() + 6) % 7; // segunda como início
		x.setDate(x.getDate() - day);
		x.setHours(0, 0, 0, 0);
		return x;
	}

	private bucketX(rawX: string, mode: XBucket): string {
		const d = this.parseDate(rawX);
		if (!d) return rawX;

		switch (mode) {
			case "none":
				return rawX;
			case "auto":
			case "day": {
				const s = this.fmtDate(
					new Date(d.getFullYear(), d.getMonth(), d.getDate()),
				);
				return s;
			}
			case "week": {
				const s = this.startOfWeek(d);
				return `${this.fmtDate(s)} (W)`;
			}
			case "month": {
				const m = String(d.getMonth() + 1).padStart(2, "0");
				return `${d.getFullYear()}-${m}`;
			}
			case "quarter": {
				const q = Math.floor(d.getMonth() / 3) + 1;
				return `${d.getFullYear()}-Q${q}`;
			}
			case "year":
				return `${d.getFullYear()}`;
			default:
				return rawX;
		}
	}

	// ---------- X multi-valor (usado para Pie / tags) ----------

	private getXValuesForEntry(
		entry: any,
		xProp: SelectedProp,
		xBucket: XBucket,
		multi: boolean,
	): string[] {
		const values: string[] = [];

		const applyBucket = (s: string) => this.bucketX(s, xBucket);

		// Se não houver property de X definida, usa nome/path do arquivo.
		if (!xProp.id) {
			const file = entry.file;
			const raw = file?.name
				? String(file.name)
				: String(file?.path ?? MISSING_LABEL);
			values.push(applyBucket(raw));
			return values;
		}

		// Caso simples: não queremos multiplicar X (barras/linhas/etc.)
		if (!multi) {
			const v = this.readValue(entry, xProp) ?? MISSING_LABEL;
			values.push(applyBucket(v));
			return values;
		}

		// multi = true → tentar explodir multi-valor (tags, listas, etc.)
		let raw: any = null;
		try {
			raw = entry.getValue(xProp.id);
		} catch {
			raw = null;
		}

		const pushStr = (s: string | null | undefined) => {
			if (!s) return;
			const trimmed = String(s).trim();
			if (!trimmed) return;
			values.push(applyBucket(trimmed));
		};

		if (raw == null) {
			pushStr(MISSING_LABEL);
		} else if (typeof raw === "string") {
			// Heurística para tags/strings multi: "#tag1 #tag2 ..."
			const trimmed = raw.trim();
			if (trimmed) {
				const parts = trimmed.split(/\s+/);
				for (const part of parts) {
					pushStr(part);
				}
			}
		} else if (Array.isArray(raw)) {
			for (const item of raw) {
				if (item == null) continue;
				let s: string;
				try {
					s = item.toString();
				} catch {
					continue;
				}
				pushStr(s);
			}
		} else if (typeof (raw as any).toArray === "function") {
			const arr = (raw as any).toArray();
			if (Array.isArray(arr)) {
				for (const item of arr) {
					if (item == null) continue;
					let s: string;
					try {
						s = item.toString();
					} catch {
						continue;
					}
					pushStr(s);
				}
			} else {
				let s: string;
				try {
					s = (raw as any).toString();
				} catch {
					s = "";
				}
				pushStr(s);
			}
		} else {
			let s: string;
			try {
				s = (raw as any).toString();
			} catch {
				s = "";
			}
			pushStr(s);
		}

		if (!values.length) {
			pushStr(MISSING_LABEL);
		}

		return values;
	}

	// ---------- builders ----------

	private buildRowsForAggregatedCharts(
		groups: any[],
		xProp: SelectedProp,
		yProp: SelectedProp,
		seriesProp: SelectedProp,
		aggMode: AggregationMode,
		xBucket: XBucket,
		forceCount: boolean,
	): QueryResultRow[] {
		const byKey = new Map<string, QueryResultRow>();

		const treatAsCount =
			forceCount ||
				aggMode === "count" ||
				(!yProp.id && aggMode !== "sum");

		const yPropName = yProp.name || "y";

		for (const group of groups) {
			for (const entry of group.entries as any[]) {
				const file = entry.file;

				const xValues = this.getXValuesForEntry(
					entry,
					xProp,
					xBucket,
					forceCount,
				);

				let baseYNum = 1;
				let yStr: string | null = null;

				if (!treatAsCount && yProp.id) {
					yStr = this.readValue(entry, yProp);
					if (yStr == null) continue;
					const n = Number(yStr);
					if (Number.isNaN(n)) continue;
					baseYNum = n;
				} else {
					baseYNum = 1;
				}

				const seriesStr = this.readValue(entry, seriesProp);
				const series = seriesStr != null ? String(seriesStr) : undefined;

				for (const xStr of xValues) {
					const key = `${xStr}@@${series ?? ""}`;
					let row = byKey.get(key);
					if (!row) {
						row = {
							x: xStr,
							y: 0,
							series,
							notes: [],
							props: {},
						} as QueryResultRow;
						byKey.set(key, row);
					}

					row.y += baseYNum;

					if (file?.path) row.notes!.push(file.path);

					if (row.props && xProp.name) {
						row.props[xProp.name] = xStr;
					}

					if (!treatAsCount && row.props && yPropName && yStr != null) {
						row.props[yPropName] = row.y;
					}

					if (treatAsCount && row.props) {
						row.props[yPropName] = row.y;
					}

					if (row.props && seriesProp.name && seriesStr != null) {
						row.props[seriesProp.name] = seriesStr;
					}
				}
			}
		}

		const rows = Array.from(byKey.values());

		if (aggMode === "cumulative-sum") {
			return this.toCumulative(rows);
		}

		return rows;
	}

	private toCumulative(rows: QueryResultRow[]): QueryResultRow[] {
		const bySeries = new Map<string, QueryResultRow[]>();

		for (const r of rows) {
			const key = r.series ?? "__no_series__";
			let list = bySeries.get(key);
			if (!list) {
				list = [];
				bySeries.set(key, list);
			}
			list.push(r);
		}

		const result: QueryResultRow[] = [];

		for (const [, list] of bySeries) {
			const sorted = [...list].sort((a, b) => this.compareX(a.x, b.x));
			let acc = 0;
			for (const r of sorted) {
				const yNum = Number(r.y ?? 0);
				if (Number.isNaN(yNum)) continue;
				acc += yNum;
				result.push({
					...r,
					y: acc,
				});
			}
		}

		return result;
	}

	private buildRowsForScatter(
		groups: any[],
		xProp: SelectedProp,
		yProp: SelectedProp,
		seriesProp: SelectedProp,
	): QueryResultRow[] {
		const rows: QueryResultRow[] = [];

		for (const group of groups) {
			for (const entry of group.entries as any[]) {
				const file = entry.file;

				const xStr = this.readValue(entry, xProp);
				const yStr = this.readValue(entry, yProp);
				if (xStr == null || yStr == null) continue;

				const xNum = Number(xStr);
				const yNum = Number(yStr);
				if (Number.isNaN(xNum) || Number.isNaN(yNum)) continue;

				const seriesStr = this.readValue(entry, seriesProp);
				const series = seriesStr != null ? String(seriesStr) : undefined;

				rows.push({
					x: xNum,
					y: yNum,
					series,
					notes: file?.path ? [file.path] : [],
					props: {},
				} as QueryResultRow);
			}
		}

		return rows;
	}

	// ---------- Gantt ----------
	private buildRowsForGantt(
		groups: any[],
		labelPropFromCall: SelectedProp,
		seriesProp: SelectedProp,
		startProp: SelectedProp,
		endProp: SelectedProp,
		dueProp: SelectedProp,
		scheduledProp: SelectedProp,
		durationProp: SelectedProp,
		groupProp: SelectedProp, // compatibilidade com views antigas
	): QueryResultRow[] {
		const rows: QueryResultRow[] = [];

		const DEFAULT_BLOCK_MINUTES = 60;
		const DEFAULT_BLOCK_MS = DEFAULT_BLOCK_MINUTES * 60_000;

		const groupNameOf = (g: any): string => {
			const cands = [
				g?.label,
				g?.name,
				g?.value,
				g?.key,
				g?.group,
				g?.groupLabel,
			];
			for (const c of cands) {
				if (c != null && String(c).trim() !== "") return String(c);
			}
			// sem agrupamento no Bases
			return "";
		};

		// Task label configurada na view (ganttLabelProperty) tem prioridade
		let labelProp: SelectedProp = labelPropFromCall;
		try {
			const ganttLabel = this.getPropFromConfig("ganttLabelProperty");
			if (ganttLabel && ganttLabel.id) {
				labelProp = ganttLabel;
			}
		} catch {
			// ignora e segue com labelPropFromCall
		}

		const hasManualGroupProp = !!groupProp.id;

		for (const group of groups) {
			const groupName = groupNameOf(group); // "" quando Bases não agrupa

			for (const entry of (group.entries ?? []) as any[]) {
				const file = entry.file;

				const startStr = this.readValue(entry, startProp);
				const endStr = this.readValue(entry, endProp);
				const dueStr = this.readValue(entry, dueProp);
				const scheduledStr = this.readValue(entry, scheduledProp);
				const durationStr = this.readValue(entry, durationProp);

				const durationMin = durationStr != null ? Number(durationStr) : NaN;
				const hasDuration = Number.isFinite(durationMin) && durationMin > 0;
				const durMs = hasDuration ? durationMin * 60_000 : DEFAULT_BLOCK_MS;

				const explicitStart = this.parseDate(startStr);
				const explicitEnd = this.parseDate(endStr);
				const due = this.parseDate(dueStr);
				const scheduled = this.parseDate(scheduledStr);

				let start = explicitStart;
				let end = explicitEnd;

				// 1) Start + End já definidos
				if (!start || !end) {
					// 2) Sem start/end, mas com scheduled
					if (!start && !end && scheduled) {
						if (hasDuration) {
							end = scheduled;
							start = new Date(scheduled.getTime() - durMs);
						} else {
							start = scheduled;
							end = new Date(scheduled.getTime() + DEFAULT_BLOCK_MS);
						}
					}

					// 3) Sem start/end, sem scheduled, mas com due
					if ((!start || !end) && !scheduled && due) {
						if (hasDuration) {
							end = due;
							start = new Date(due.getTime() - durMs);
						} else if (!start && !end) {
							start = due;
							end = new Date(due.getTime() + DEFAULT_BLOCK_MS);
						}
					}

					// 4) Start + duração (sem end)
					if ((!start || !end) && explicitStart && hasDuration && !explicitEnd) {
						start = explicitStart;
						end = new Date(explicitStart.getTime() + durMs);
					}

					// 5) End + duração (sem start)
					if ((!start || !end) && explicitEnd && hasDuration && !explicitStart) {
						end = explicitEnd;
						start = new Date(explicitEnd.getTime() - durMs);
					}

					// 6) Só start -> bloco curto
					if (start && !end && !hasDuration) {
						end = new Date(start.getTime() + DEFAULT_BLOCK_MS);
					}

					// 7) Só end -> bloco curto
					if (!start && end && !hasDuration) {
						start = new Date(end.getTime() - DEFAULT_BLOCK_MS);
					}
				}

				if (!start || !end) continue;

				// garante start <= end
				if (start.getTime() > end.getTime()) {
					const tmp = start;
					start = end;
					end = tmp;
				}

				// -------- label ----------
				let label = this.readValue(entry, labelProp);

				if (label == null || String(label).trim() === "") {
					if (file?.name) {
						label = String(file.name).replace(/\.md$/i, "");
					} else if (file?.path) {
						label = String(file.path);
					} else {
						label = "(sem título)";
					}
				}

				// série (cores / legenda)
				const seriesVal = this.readValue(entry, seriesProp);
				const series = seriesVal != null ? String(seriesVal) : undefined;

				const props: Record<string, any> = {};

				// Agrupamento vindo do Bases
				if (groupName) {
					props["__basesGroup"] = groupName;
				}

				// Compatibilidade com Group property antigo (se ainda estiver configurado)
				if (hasManualGroupProp) {
					const gVal = this.readValue(entry, groupProp);
					if (gVal != null && groupProp.name) {
						props[groupProp.name] = gVal;
					}
				}

				if (labelProp.name) props[labelProp.name] = label;
				props["label"] = label;

				if (startProp.name && startStr != null) props[startProp.name] = startStr;
				if (endProp.name && endStr != null) props[endProp.name] = endStr;
				if (dueProp.name && dueStr != null) props[dueProp.name] = dueStr;
				if (scheduledProp.name && scheduledStr != null)
					props[scheduledProp.name] = scheduledStr;
				if (hasDuration && durationProp.name)
					props[durationProp.name] = durationMin;

				const notePath = file?.path;

				rows.push({
					x: label,
					y: 0, // Gantt não usa Y, mas o tipo exige
					series,
					start,
					end,
					due: due ?? undefined,
					notes: notePath ? [notePath] : [],
					props,
				});
			}
		}

		// ordena por início (fica mais previsível)
		rows.sort((a, b) => {
			if (!a.start || !b.start) return 0;
			return a.start.getTime() - b.start.getTime();
		});

		return rows;
	}

	private buildEncoding(fields: {
		x: SelectedProp;
		y: SelectedProp;
		series: SelectedProp;
		start: SelectedProp;
		end: SelectedProp;
		due: SelectedProp;
		duration: SelectedProp;
		group: SelectedProp;
		label: SelectedProp;
		aggMode: AggregationMode;
		xBucket: XBucket;
		chartType: AllowedChartType;
	}): any {
		// IMPORTANTE: x/y aqui são nomes de propriedades,
		// não rótulos bonitinhos. O renderer usa isso pra procurar
		// os campos nos dados. O label humano fica por conta dele.
		const xKey = fields.x.name ?? "x";
		const yKey = fields.y.name ?? "y";
		const labelKey =
			fields.label.name ?? fields.x.name ?? fields.group.name ?? "label";
		const groupKeyName =
			fields.chartType === "gantt"
				? "__basesGroup"           // <- usar o agrupamento nativo do Bases
				: (fields.group.name ?? "group");
		return {
			x: xKey,
			y: yKey,
			series: fields.series.name ?? "series",
			start: fields.start.name ?? "start",
			end: fields.end.name ?? "end",
			due: fields.due.name ?? "due",
			duration: fields.duration.name ?? "duration",
			group: groupKeyName,  
			label: labelKey,
		};
	}
}

