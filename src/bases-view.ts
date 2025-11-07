// src/bases-view.ts
import {
	BasesView,
	type QueryController,
	parsePropertyId,
} from "obsidian";

import type { ChartSpec, QueryResult, QueryResultRow } from "./types";
import type { PropChartsRenderer, RenderContext } from "./renderer";

export const CHARTNOTES_BASES_VIEW_TYPE = "chartnotes-view";

const CHART_TYPES = ["bar","stacked-bar","line","area","pie","scatter","gantt"] as const;
type AllowedChartType = (typeof CHART_TYPES)[number];

function normalizeChartType(raw: unknown): AllowedChartType {
	const t = String(raw ?? "bar").trim().toLowerCase();
	return (CHART_TYPES.includes(t as AllowedChartType) ? t : "bar") as AllowedChartType;
}

const AGGREGATION_MODES = ["normal","cumulative-sum"] as const;
type AggregationMode = (typeof AGGREGATION_MODES)[number];

function normalizeAggregationMode(raw: unknown): AggregationMode {
	const t = String(raw ?? "normal").trim().toLowerCase();
	return (AGGREGATION_MODES.includes(t as AggregationMode) ? t : "normal") as AggregationMode;
}

const X_BUCKETS = ["auto","none","day","week","month","quarter","year"] as const;
type XBucket = (typeof X_BUCKETS)[number];

function normalizeXBucket(raw: unknown): XBucket {
	const t = String(raw ?? "auto").trim().toLowerCase();
	return (X_BUCKETS.includes(t as XBucket) ? t : "auto") as XBucket;
}

type SelectedProp = { id: string | null; name: string | null };
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
			aggModeCfg === "cumulative-sum" && !allowCumulative
				? "normal"
				: aggModeCfg;

		// Não expomos mais X bucketing na UI. Aqui deixo um "auto" fixo:
		// se o X parecer uma data/hora, agrupa por dia; senão usa o valor cru.
		const xBucket: XBucket = "auto";

		const xProp = this.getPropFromConfig("xProperty");
		const yProp = this.getPropFromConfig("yProperty");

		let seriesProp = this.getPropFromConfig("seriesProperty");
		if (isPie) {
			// Em Pie, nunca usamos série – sempre agregamos só por categoria.
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

		let rows: QueryResultRow[];

		if (isGantt) {
			rows = this.buildRowsForGantt(
				grouped,
				xProp,
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
		const drilldown =
			typeof drilldownCfg === "boolean" ? drilldownCfg : true;

		const encoding = this.buildEncoding({
			x: xProp,
			y: yProp,
			series: seriesProp,
			start: startProp,
			end: endProp,
			due: dueProp,
			duration: durationProp,
			group: groupProp,
			aggMode,
			xBucket,
			chartType,
		});

		const spec: ChartSpec = {
			type: chartType as any,
			source: { type: "properties", query: "" } as any,
			encoding: encoding as any,
			options: { title, drilldown },
		};

		const ctx: RenderContext = { refresh: () => this.onDataUpdated() };
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
			return {
				id,
				name: (parsed as any).name ?? id,
			};
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


	private parseDate(raw: any): Date | null {
		if (raw instanceof Date) {
			return Number.isNaN(raw.getTime()) ? null : raw;
		}
		if (raw == null) return null;
		const d = new Date(String(raw).trim());
		return Number.isNaN(d.getTime()) ? null : d;
	}

	private compareX(a: any, b: any): number {
		const da = this.parseDate(a);
		const db = this.parseDate(b);
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

  private makeLocalDate(d: Date): Date {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private endOfDay(d: Date): Date {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    return x;
  }

  // ISO puro (YYYY-MM-DD) como data local (00:00)
  private parseISODateLocal(s: string): Date | null {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const x = new Date(y, mo, d);
    x.setHours(0, 0, 0, 0);
    return Number.isNaN(x.getTime()) ? null : x;
  }

  // Parser tolerante: Date | ISO | dd/mm/yyyy | mm/dd/yyyy | ISO com hora
  private parseDateLoose(raw: any): Date | null {
    if (raw instanceof Date) return this.makeLocalDate(raw);
    if (raw == null) return null;

    const s = String(raw).trim();
    if (!s) return null;

    // 1) ISO puro → local
    const isoLocal = this.parseISODateLocal(s);
    if (isoLocal) return isoLocal;

    // 2) ISO com hora (Z ou offset) → usa JS e normaliza pra local-dia
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) return this.makeLocalDate(d);
    }

    // 3) dd/mm/yyyy ou mm/dd/yyyy → heurística
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      let d = Number(m[1]);
      let mo = Number(m[2]);
      const y = Number(m[3]);
      // se primeiro > 12 → é dd/mm
      if (d > 12) {
        // já está dd/mm
      } else {
        // assume mm/dd → inverte
        const tmp = d;
        d = mo;
        mo = tmp;
      }
      const x = new Date(y, mo - 1, d);
      x.setHours(0, 0, 0, 0);
      return Number.isNaN(x.getTime()) ? null : x;
    }

    // 4) Fallback: Date do JS e normaliza pra dia local
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : this.makeLocalDate(d);
  }

  // Lê uma property de data do Bases de forma segura
  private readDate(entry: any, prop: { id: string | null }): Date | null {
    if (!prop?.id) return null;
    let v: any;
    try {
      v = entry.getValue(prop.id);
    } catch {
      return null;
    }
    if (v == null) return null;

    // Alguns tipos do Bases/metadata podem expor toDate()/toISODate()
    try {
      if (typeof v.toDate === "function") {
        const d = v.toDate();
        if (d instanceof Date && !Number.isNaN(d.getTime())) return this.makeLocalDate(d);
      }
    } catch {}

    try {
      if (typeof v.toISODate === "function") {
        const s = v.toISODate();
        const d = this.parseISODateLocal(String(s));
        if (d) return d;
      }
    } catch {}

    if (v instanceof Date) return this.makeLocalDate(v);

    try {
      return this.parseDateLoose(v.toString());
    } catch {
      return null;
    }
  }
	// Início do mês (dia 1 às 00:00)
	private startOfMonth(d: Date): Date {
		const x = new Date(d.getFullYear(), d.getMonth(), 1);
		x.setHours(0, 0, 0, 0);
		return x;
	}

	// Início do trimestre (Jan/Apr/Jul/Oct, dia 1 às 00:00)
	private startOfQuarter(d: Date): Date {
		const q = Math.floor(d.getMonth() / 3); // 0,1,2,3
		const x = new Date(d.getFullYear(), q * 3, 1);
		x.setHours(0, 0, 0, 0);
		return x;
	}

	// Início do ano (1º de janeiro às 00:00)
	private startOfYear(d: Date): Date {
		const x = new Date(d.getFullYear(), 0, 1);
		x.setHours(0, 0, 0, 0);
		return x;
	}
	private bucketX(rawX: string, mode: XBucket): any {
		const d = this.parseDate(rawX);
		if (!d) return rawX; // não é data → deixa como está

		if (mode === "none") return rawX;

		// Sempre trabalhamos com o "dia" (00:00)
		const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
		base.setHours(0, 0, 0, 0);

		if (mode === "auto" || mode === "day") {
			// Line / area / bar vão receber um Date de dia em dia
			return base;
		}

		switch (mode) {
			case "week":
				return this.startOfWeek(base);
			case "month":
				return this.startOfMonth(base);
			case "quarter":
				return this.startOfQuarter(base);
			case "year":
				return this.startOfYear(base);
			default:
				return base;
		}
	}


	// ---------- X multi-valor (usado para Pie / tags) ----------


	private getXValuesForEntry(
		entry: any,
		xProp: SelectedProp,
		xBucket: XBucket,
		multi: boolean,
	): any[] {
		const values: any[] = [];

		const applyBucket = (s: string) => this.bucketX(s, xBucket);

		// Sem property X → usa nome/path do arquivo
		if (!xProp.id) {
			const file = entry.file;
			const raw =
				file?.name ? String(file.name) : String(file?.path ?? MISSING_LABEL);
			values.push(applyBucket(raw));
			return values;
		}

		// Caso simples: um único valor de X
		if (!multi) {
			const v = this.readValue(entry, xProp) ?? MISSING_LABEL;
			values.push(applyBucket(v));
			return values;
		}

		// multi = true → explode listas/tags etc.
		let raw: any = null;
		try {
			raw = entry.getValue(xProp.id);
		} catch {
			raw = null;
		}

		const pushRaw = (s: string | null | undefined) => {
			if (!s) return;
			const trimmed = String(s).trim();
			if (!trimmed) return;
			values.push(applyBucket(trimmed));
		};

		if (raw == null) {
			pushRaw(MISSING_LABEL);
		} else if (typeof raw === "string") {
			const trimmed = raw.trim();
			if (trimmed) {
				const parts = trimmed.split(/\s+/);
				for (const part of parts) pushRaw(part);
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
				pushRaw(s);
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
					pushRaw(s);
				}
			} else {
				let s: string;
				try {
					s = (raw as any).toString();
				} catch {
					s = "";
				}
				pushRaw(s);
			}
		} else {
			let s: string;
			try {
				s = (raw as any).toString();
			} catch {
				s = "";
			}
			pushRaw(s);
		}

		if (!values.length) {
			pushRaw(MISSING_LABEL);
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
		const byKey = new Map<string, QueryResultRow & { props: PropsMap }>();

		// Regra simples:
		// - se não tiver Y definido → count
		// - se for Pie → sempre count
		// - se tiver Y definido → sum
		const treatAsCount = forceCount || !yProp.id;

		const yPropName = yProp.name || "y";

		for (const group of groups) {
			for (const entry of group.entries as any[]) {
				const file = entry.file;

				const xValues = this.getXValuesForEntry(
					entry,
					xProp,
					xBucket,
					forceCount, // Pie = multi (tags etc.)
				);

				let baseYNum = 1;
				let yStr: string | null = null;

				if (!treatAsCount && yProp.id) {
					// Temos um Y numérico definido → somar
					yStr = this.readValue(entry, yProp);
					if (yStr == null) continue;
					const n = Number(yStr);
					if (Number.isNaN(n)) continue;
					baseYNum = n;
				} else {
					// Modo "count"
					baseYNum = 1;
				}

				const seriesStr = this.readValue(entry, seriesProp);
				const series = seriesStr != null ? String(seriesStr) : undefined;

				for (const xStr of xValues) {
					const key = `${xStr}@@${series ?? ""}`;

					let row = byKey.get(key);
					if (!row) {
						row = { x: xStr, y: 0, series, notes: [], props: {} };
						byKey.set(key, row);
					}

					row.y += baseYNum;

					if (file?.path) row.notes!.push(file.path);


					if (row.props && xProp.name) {
						const label =
							xStr instanceof Date ? this.fmtDate(xStr) : String(xStr);
						row.props[xProp.name] = label;
					}


					// Sempre expõe o valor agregado em uma "property" Y,
					// pra bater com encoding.y ("y" quando não há Y real).
					if (row.props && yPropName) {
						row.props[yPropName] = row.y;
					}

					if (row.props && seriesProp.name && seriesStr != null) {
						row.props[seriesProp.name] = seriesStr;
					}
				}
			}
		}

		const rows = Array.from(byKey.values());

		// Só faz acumulado se o modo for "cumulative-sum"
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
				result.push({ ...r, y: acc });
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
				});
			}
		}

		return rows;
	}


  private buildRowsForGantt(
    groups: any[],
    xProp: { id: string | null; name: string | null },
    seriesProp: { id: string | null; name: string | null },
    startProp: { id: string | null; name: string | null },
    endProp: { id: string | null; name: string | null },
    dueProp: { id: string | null; name: string | null },
    scheduledProp: { id: string | null; name: string | null },
    durationProp: { id: string | null; name: string | null },
    groupProp: { id: string | null; name: string | null },
  ): QueryResultRow[] {
    const rows: QueryResultRow[] = [];

    for (const group of groups) {
      for (const entry of group.entries as any[]) {
        const file = entry.file;

        const start = this.readDate(entry, startProp);
        const endRaw = this.readDate(entry, endProp);
        const due = this.readDate(entry, dueProp);
        const scheduled = this.readDate(entry, scheduledProp);

        const durationStr = this.readValue(entry, durationProp);
        const durationMin = durationStr != null ? Number(durationStr) : NaN;
        const hasDuration = Number.isFinite(durationMin);

        let s = start ? new Date(start) : null;
        let e = endRaw ? new Date(endRaw) : null;

        // Regras de fallback:
        // 1) se não há start mas há end e duração → start = end - duração
        if (!s && e && hasDuration) {
          s = new Date(e.getTime() - durationMin * 60_000);
          s = this.makeLocalDate(s);
        }

        // 2) se não há end mas há start e duração → end = start + duração
        if (s && !e && hasDuration) {
          e = new Date(s.getTime() + durationMin * 60_000);
        }

        // 3) se não há end/start mas há "scheduled" (tratado como fim) + duração
        if (!s && !e && scheduled && hasDuration) {
          e = new Date(scheduled);
          s = new Date(e.getTime() - durationMin * 60_000);
          s = this.makeLocalDate(s);
        }

        // 4) se não há end/start mas há "due" + duração
        if (!s && !e && due && hasDuration) {
          e = new Date(due);
          s = new Date(e.getTime() - durationMin * 60_000);
          s = this.makeLocalDate(s);
        }

        // 5) se só há start (sem duração nem end), não dá pra desenhar
        if (!s || !e) continue;

        // Ajuste de “dia inteiro” para datas-calendário:
        // se s e e são datas de dia (00:00), mostra o END como inclusivo (fim do dia)
        const sIs00 = s.getHours() === 0 && s.getMinutes() === 0 && s.getSeconds() === 0;
        const eIs00 = e.getHours() === 0 && e.getMinutes() === 0 && e.getSeconds() === 0;
        if (sIs00 && eIs00) {
          e = this.endOfDay(e);
        }

        // Label (nome da tarefa)
        const label =
          this.readValue(entry, xProp) ??
          (file?.name ? String(file.name).replace(/\.md$/i, "") : String(file?.path ?? ""));

        const seriesStr = this.readValue(entry, seriesProp);
        const series = seriesStr != null ? String(seriesStr) : undefined;

        const groupVal = this.readValue(entry, groupProp);

        const props: Record<string, any> = {};
        if (hasDuration && durationProp.name) props[durationProp.name] = durationMin;
        if (groupProp.name && groupVal != null) props[groupProp.name] = groupVal;

        rows.push({
          x: label,
          y: 0,
          series,
          start: s,
          end: e,
          due: due ?? undefined,
          notes: file?.path ? [file.path] : [],
          props,
        });
      }
    }

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
		aggMode: AggregationMode;
		xBucket: XBucket;
		chartType: AllowedChartType;
	}): any {
		// IMPORTANTE: x/y aqui são nomes de propriedades,
		// não rótulos bonitinhos. O renderer usa isso pra procurar
		// os campos nos dados. O label humano fica por conta dele.
		const xKey = fields.x.name ?? "x";
		const yKey = fields.y.name ?? "y";

		return {
			x: xKey,
			y: yKey,
			series: fields.series.name ?? "series",
			start: fields.start.name ?? "start",
			end: fields.end.name ?? "end",
			due: fields.due.name ?? "due",
			duration: fields.duration.name ?? "duration",
			group: fields.group.name ?? "group",
		};
	}
}

