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

const AGGREGATION_MODES = ["sum","count","cumulative-sum"] as const;
type AggregationMode = (typeof AGGREGATION_MODES)[number];

function normalizeAggregationMode(raw: unknown): AggregationMode {
  const t = String(raw ?? "sum").trim().toLowerCase();
  return (AGGREGATION_MODES.includes(t as AggregationMode) ? t : "sum") as AggregationMode;
}

const X_BUCKETS = ["auto","none","day","week","month","quarter","year"] as const;
type XBucket = (typeof X_BUCKETS)[number];

function normalizeXBucket(raw: unknown): XBucket {
  const t = String(raw ?? "auto").trim().toLowerCase();
  return (X_BUCKETS.includes(t as XBucket) ? t : "auto") as XBucket;
}

type SelectedProp = { id: string | null; name: string | null };
type PropsMap = Record<string, any>;

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
    const aggModeCfg = normalizeAggregationMode(cfg?.get("aggregateMode"));
    const allowCumulative = chartType === "line" || chartType === "area";
    const aggMode: AggregationMode =
      aggModeCfg === "cumulative-sum" && !allowCumulative ? "sum" : aggModeCfg;

    const xBucket = normalizeXBucket(cfg?.get("xBucket"));

    const xProp = this.getPropFromConfig("xProperty");
    const yProp = this.getPropFromConfig("yProperty");

    let seriesProp = this.getPropFromConfig("seriesProperty");
    const isPie = chartType === "pie";
    if (isPie) {
      // Pra Pie, sempre agregar só por X independentemente de série salva
      seriesProp = { id: null, name: null };
    }

    const startProp = this.getPropFromConfig("startProperty");
    const endProp = this.getPropFromConfig("endProperty");
    const dueProp = this.getPropFromConfig("dueProperty");
    const scheduledProp = this.getPropFromConfig("scheduledProperty");
    const durationProp = this.getPropFromConfig("durationProperty");
    const groupProp = this.getPropFromConfig("groupProperty");

    const isGantt = chartType === "gantt";
    const isScatter = chartType === "scatter";

    if (!isGantt && !xProp.id) {
      this.rootEl.createDiv({
        cls: "prop-charts-empty",
        text: "Configure the 'Category / X axis' property in view options.",
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
      rows = this.buildRowsForAggregatedCharts(
        grouped,
        xProp,
        yProp,
        seriesProp,
        aggMode,
        xBucket,
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

  // ---------- builders ----------

  private buildRowsForAggregatedCharts(
    groups: any[],
    xProp: SelectedProp,
    yProp: SelectedProp,
    seriesProp: SelectedProp,
    aggMode: AggregationMode,
    xBucket: XBucket,
  ): QueryResultRow[] {
    const byKey = new Map<string, QueryResultRow & { props: PropsMap }>();

    const treatAsCount =
      aggMode === "count" || (!yProp.id && aggMode !== "sum");

    for (const group of groups) {
      for (const entry of group.entries as any[]) {
        const file = entry.file;

        const rawX =
          this.readValue(entry, xProp) ??
          (file?.name ? String(file.name) : String(file?.path ?? ""));
        const xStr = this.bucketX(rawX, xBucket);

        let yNum = 1;
        let yStr: string | null = null;

        if (!treatAsCount && yProp.id) {
          yStr = this.readValue(entry, yProp);
          if (yStr == null) continue;
          const n = Number(yStr);
          if (Number.isNaN(n)) continue;
          yNum = n;
        } else {
          yNum = 1;
        }

        const seriesStr = this.readValue(entry, seriesProp);
        const series = seriesStr != null ? String(seriesStr) : undefined;

        const key = `${xStr}@@${series ?? ""}`;
        let row = byKey.get(key);
        if (!row) {
          row = { x: xStr, y: 0, series, notes: [], props: {} };
          byKey.set(key, row);
        }

        row.y += yNum;
        if (file?.path) row.notes!.push(file.path);

        if (row.props && xProp.name) row.props[xProp.name] = xStr;
        if (!treatAsCount && row.props && yProp.name && yStr != null) {
          row.props[yProp.name] = row.y;
        }
        if (row.props && seriesProp.name && seriesStr != null) {
          row.props[seriesProp.name] = seriesStr;
        }
      }
    }

    const rows = Array.from(byKey.values());
    if (aggMode === "cumulative-sum") return this.toCumulative(rows);
    return rows;
  }

  private toCumulative(rows: QueryResultRow[]): QueryResultRow[] {
    const bySeries = new Map<string, QueryResultRow[]>();
    for (const r of rows) {
      const key = r.series ?? "__no_series__";
      (bySeries.get(key) ?? bySeries.set(key, []).get(key)!).push(r);
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

    for (const group of groups) {
      for (const entry of group.entries as any[]) {
        const file = entry.file;

        const startStr = this.readValue(entry, startProp);
        const endStr = this.readValue(entry, endProp);
        const dueStr = this.readValue(entry, dueProp);
        const scheduledStr = this.readValue(entry, scheduledProp);
        const durationStr = this.readValue(entry, durationProp);

        const durationMin = durationStr != null ? Number(durationStr) : NaN;
        const hasDuration = Number.isFinite(durationMin);

        let start = this.parseDate(startStr);
        let end = this.parseDate(endStr);
        const due = this.parseDate(dueStr);
        const scheduled = this.parseDate(scheduledStr);

        // Fallbacks:
        if (!start && hasDuration) {
          if (scheduled) {
            start = new Date(scheduled.getTime() - durationMin * 60_000);
          } else if (due) {
            start = new Date(due.getTime() - durationMin * 60_000);
          } else if (end) {
            start = new Date(end.getTime() - durationMin * 60_000);
          }
        }

        if (!end && start && hasDuration) {
          end = new Date(start.getTime() + durationMin * 60_000);
        }

        if (!start || !end) continue;

        const label =
          this.readValue(entry, xProp) ??
          (file?.name
            ? String(file.name).replace(/\.md$/i, "")
            : String(file?.path ?? ""));

        const seriesStr = this.readValue(entry, seriesProp);
        const series = seriesStr != null ? String(seriesStr) : undefined;

        const groupVal = this.readValue(entry, groupProp);

        const props: PropsMap = {};
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
  }): any {
    const isCount =
      fields.aggMode === "count" ||
      (!fields.y.id && fields.aggMode !== "sum");

    let yName: string;
    if (isCount) yName = "Count";
    else if (fields.aggMode === "cumulative-sum")
      yName = fields.y.name ? `${fields.y.name} (cumulative)` : "Cumulative";
    else yName = fields.y.name ? `${fields.y.name} (sum)` : "Value";

    const xSuffix =
      fields.xBucket && fields.xBucket !== "none"
        ? ` (${fields.xBucket})`
        : "";

    return {
      x: fields.x.name ? `${fields.x.name}${xSuffix}` : "x",
      y: yName,
      series: fields.series.name ?? "series",
      start: fields.start.name ?? "start",
      end: fields.end.name ?? "end",
      due: fields.due.name ?? "due",
      duration: fields.duration.name ?? "duration",
      group: fields.group.name ?? "group",
    };
  }
}

