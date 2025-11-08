// src/bases-view.ts

import { BasesView, type QueryController, parsePropertyId } from "obsidian";
import type { ChartSpec, QueryResult, QueryResultRow } from "./types";
import type { PropChartsRenderer, RenderContext } from "./renderer";

export const CHARTNOTES_BASES_VIEW_TYPE = "chartnotes-view";

const CHART_TYPES = ["bar", "stacked-bar", "line", "area", "pie", "scatter", "gantt"] as const;
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
    // Pie / Scatter / Gantt não usam bucketing de X
    const xBucket: XBucket = isPie || isScatter || isGantt ? "none" : rawXBucket;

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
        text: "Configure the 'Category / group' property in view options.",
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

    if (value == null) return null;

    try {
      if (typeof value.isEmpty === "function" && value.isEmpty()) {
        return null;
      }
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

  /**
   * Bucketing de X:
   * - "auto" e "none": não truncam por dia → mantêm o valor original (data/hora inclusa).
   * - "day", "week", "month", "quarter", "year": agrupam de fato.
   */
private bucketX(rawX: string, mode: XBucket): string {
  const d = this.parseDate(rawX);
  if (!d) return rawX;

  switch (mode) {
    case "none":
    case "auto":
      // Mantém data/hora original; sem arredondar para o dia.
      // (Se quiser, depois podemos normalizar formato aqui.)
      return rawX;

    case "day": {
      const onlyDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return this.fmtDate(onlyDay);
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

  // ---------- builders (bar/line/area/pie) ----------

  private buildRowsForAggregatedCharts(
    groups: any[],
    xProp: SelectedProp,
    yProp: SelectedProp,
    seriesProp: SelectedProp,
    aggMode: AggregationMode,
    xBucket: XBucket,
    forceCount: boolean,
  ): QueryResultRow[] {
    const byKey = new Map<
      string,
      {
        x: string | number | Date;
        y: number;
        series?: string;
        notes: string[];
        props: PropsMap;
      }
    >();

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
            };
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
        result.push({ ...r, y: acc });
      }
    }

    return result;
  }

  // ---------- Scatter ----------

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

  // ---------- Gantt ----------

  private buildRowsForGantt(
    groups: any[],
    xProp: SelectedProp,
    seriesProp: SelectedProp,
    startProp: SelectedProp,
    endProp: SelectedProp,
    dueProp: SelectedProp,
    scheduledProp: SelectedProp,
    durationProp: SelectedProp,
    groupProp: SelectedProp,
  ): QueryResultRow[] {
    const rows: QueryResultRow[] = [];
    const DEFAULT_BLOCK_MINUTES = 60;
    const DEFAULT_BLOCK_MS = DEFAULT_BLOCK_MINUTES * 60_000;

    for (const group of groups) {
      for (const entry of group.entries as any[]) {
        const file = entry.file;

        const startStr = this.readValue(entry, startProp);
        const endStr = this.readValue(entry, endProp);
        const dueStr = this.readValue(entry, dueProp);
        const scheduledStr = this.readValue(entry, scheduledProp);
        const durationStr = this.readValue(entry, durationProp);

        const durationMin = durationStr != null ? Number(durationStr) : NaN;
        const hasDuration = Number.isFinite(durationMin) && durationMin > 0;

        const explicitStart = this.parseDate(startStr);
        const explicitEnd = this.parseDate(endStr);
        const due = this.parseDate(dueStr);
        const scheduled = this.parseDate(scheduledStr);

        let start: Date | null = explicitStart;
        let end: Date | null = explicitEnd;

        const durMs = hasDuration ? durationMin * 60_000 : DEFAULT_BLOCK_MS;

        // 1. Caso completo: start + end → usa direto
        if (start && end) {
          // ok
        }
        // 2. Start + duração → end = start + duração
        else if (start && hasDuration && !end) {
          end = new Date(start.getTime() + durMs);
        }
        // 3. Sem start, mas Scheduled + duração → Scheduled é o fim; start = scheduled - duração
        else if (!start && scheduled && hasDuration && !end) {
          end = scheduled;
          start = new Date(scheduled.getTime() - durMs);
        }
        // 4. Sem start/scheduled, mas Due + duração → Due é o fim; start = due - duração
        else if (!start && !scheduled && due && hasDuration && !end) {
          end = due;
          start = new Date(due.getTime() - durMs);
        }
        // 5. Sem start/end, só Scheduled (sem duração) → bloco curto começando em Scheduled
        else if (!start && !end && scheduled && !hasDuration) {
          start = scheduled;
          end = new Date(scheduled.getTime() + DEFAULT_BLOCK_MS);
        }
        // 6. Start sozinho (sem end/duração) → bloco curto a partir de start
        else if (start && !end && !hasDuration) {
          end = new Date(start.getTime() + DEFAULT_BLOCK_MS);
        }
        // 7. Só Due (sem start/scheduled/end/duração) → marco curto em Due
        else if (!start && !end && due && !hasDuration) {
          start = due;
          end = new Date(due.getTime() + DEFAULT_BLOCK_MS);
        }
        // 8. Só end + duração → start = end - duração
        else if (!start && end && hasDuration) {
          start = new Date(end.getTime() - durMs);
        }
        // 9. Só end (sem duração) → bloco curto terminando em end
        else if (!start && end && !hasDuration) {
          start = new Date(end.getTime() - DEFAULT_BLOCK_MS);
        }

        if (!start || !end) {
          // Não foi possível determinar um intervalo coerente.
          continue;
        }

        // Garante que start <= end
        if (start.getTime() > end.getTime()) {
          const tmp = start;
          start = end;
          end = tmp;
        }

        const label =
          this.readValue(entry, xProp) ??
          (file?.name
            ? String(file.name).replace(/\.md$/i, "")
            : String(file?.path ?? ""));

        const seriesStr = this.readValue(entry, seriesProp);
        const series = seriesStr != null ? String(seriesStr) : undefined;
        const groupVal = this.readValue(entry, groupProp);

        const props: PropsMap = {};

        // Preenche props pra tooltip/edição no Gantt
        if (startProp.name && start) props[startProp.name] = start;
        if (endProp.name && end) props[endProp.name] = end;
        if (scheduledProp.name && scheduled) props[scheduledProp.name] = scheduled;
        if (dueProp.name && due) props[dueProp.name] = due;
        if (hasDuration && durationProp.name) props[durationProp.name] = durationMin;
        if (groupProp.name && groupVal != null) props[groupProp.name] = groupVal;

        rows.push({
          x: label,
          y: 0,
          series,
          start,
          end,
          due: due ?? undefined,
          notes: file?.path ? [file.path] : [],
          props,
        });
      }
    }

    return rows;
  }

  // ---------- encoding ----------

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

