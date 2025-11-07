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
  return (CHART_TYPES.includes(t as AllowedChartType)
    ? t
    : "bar") as AllowedChartType;
}

// agregações possíveis pra Y
const AGGREGATION_MODES = [
  "sum",
  "count",
  "cumulative-sum",
] as const;

type AggregationMode = (typeof AGGREGATION_MODES)[number];

function normalizeAggregationMode(raw: unknown): AggregationMode {
  const t = String(raw ?? "sum").trim().toLowerCase();
  return (AGGREGATION_MODES.includes(t as AggregationMode)
    ? t
    : "sum") as AggregationMode;
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

    const rawType = (cfg?.get("chartType") as string | undefined) ?? "bar";
    const chartType = normalizeChartType(rawType);

    const aggRaw = cfg?.get("aggregateMode");
    const aggMode = normalizeAggregationMode(aggRaw);

    const xProp = this.getPropFromConfig("xProperty");
    const yProp = this.getPropFromConfig("yProperty");
    const seriesProp = this.getPropFromConfig("seriesProperty");
    const startProp = this.getPropFromConfig("startProperty");
    const endProp = this.getPropFromConfig("endProperty");
    const dueProp = this.getPropFromConfig("dueProperty");
    const durationProp = this.getPropFromConfig("durationProperty");
    const groupProp = this.getPropFromConfig("groupProperty");

    const isGantt = chartType === "gantt";
    const isScatter = chartType === "scatter";

    // validações básicas pra dar feedback claro
    if (!isGantt && !xProp.id) {
      this.rootEl.createDiv({
        cls: "prop-charts-empty",
        text: "Configure the 'X axis / label' property in view options.",
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

    if (isGantt && (!startProp.id || !endProp.id)) {
      this.rootEl.createDiv({
        cls: "prop-charts-empty",
        text: "Gantt charts need Start and End properties configured.",
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
    });

    const titleRaw = (cfg?.get("title") as string | undefined) ?? "";
    const title = titleRaw.trim() || cfg?.name || "Chart Notes (Bases)";

    const drilldownCfg = cfg?.get("drilldown");
    const drilldown =
      typeof drilldownCfg === "boolean" ? drilldownCfg : true;

    const spec: ChartSpec = {
      type: chartType as any,
      source: {
        type: "properties",
        query: "",
      } as any,
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

  // ---------------------------------------------------------------------------
  // Helpers de propriedades
  // ---------------------------------------------------------------------------

  private getPropFromConfig(key: string): SelectedProp {
    const cfg: any = (this as any).config;
    const raw = cfg?.get?.(key) as string | undefined;
    const id = raw && raw.trim().length ? raw.trim() : null;

    if (!id) return { id: null, name: null };

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

  private compareX(a: any, b: any): number {
    const da = this.parseDate(a != null ? String(a) : null);
    const db = this.parseDate(b != null ? String(b) : null);
    if (da && db) return da.getTime() - db.getTime();

    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;

    return String(a ?? "").localeCompare(String(b ?? ""));
  }

  // ---------------------------------------------------------------------------
  // Builders de linhas
  // ---------------------------------------------------------------------------

  private buildRowsForAggregatedCharts(
    groups: any[],
    xProp: SelectedProp,
    yProp: SelectedProp,
    seriesProp: SelectedProp,
    aggMode: AggregationMode,
  ): QueryResultRow[] {
    const byKey = new Map<string, QueryResultRow & { props: PropsMap }>();

    const treatAsCount =
      aggMode === "count" || (!yProp.id && aggMode !== "sum");

    for (const group of groups) {
      for (const entry of group.entries as any[]) {
        const file = entry.file;

        const xStr =
          this.readValue(entry, xProp) ??
          (file?.name ? String(file.name) : String(file?.path ?? ""));

        let yNum = 1;
        let yStr: string | null = null;

        if (!treatAsCount && yProp.id) {
          yStr = this.readValue(entry, yProp);
          if (yStr == null) continue;
          const n = Number(yStr);
          if (Number.isNaN(n)) continue;
          yNum = n;
        } else {
          // count: sempre 1
          yNum = 1;
        }

        const seriesStr = this.readValue(entry, seriesProp);
        const series = seriesStr != null ? String(seriesStr) : undefined;

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

    if (aggMode === "cumulative-sum") {
      return this.toCumulative(rows);
    }

    return rows;
  }

  private toCumulative(rows: QueryResultRow[]): QueryResultRow[] {
    const bySeries = new Map<string, QueryResultRow[]>();

    for (const row of rows) {
      const key = row.series ?? "__no_series__";
      let list = bySeries.get(key);
      if (!list) {
        list = [];
        bySeries.set(key, list);
      }
      list.push(row);
    }

    const result: QueryResultRow[] = [];

    for (const [, list] of bySeries) {
      const sorted = [...list].sort((a, b) => this.compareX(a.x, b.x));
      let acc = 0;
      for (const r of sorted) {
        const yNum = Number(r.y ?? 0);
        if (Number.isNaN(yNum)) continue;
        acc += yNum;
        r.y = acc;
        result.push(r);
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
    durationProp: SelectedProp,
    groupProp: SelectedProp,
  ): QueryResultRow[] {
    const rows: QueryResultRow[] = [];

    for (const group of groups) {
      for (const entry of group.entries as any[]) {
        const file = entry.file;

        const startStr = this.readValue(entry, startProp);
        const endStr = this.readValue(entry, endProp);
        if (!startStr || !endStr) continue;

        const start = this.parseDate(startStr);
        const end = this.parseDate(endStr);
        if (!start || !end) continue;

        const label =
          this.readValue(entry, xProp) ??
          (file?.name
            ? String(file.name).replace(/\.md$/i, "")
            : String(file?.path ?? ""));

        const dueStr = this.readValue(entry, dueProp);
        const due = this.parseDate(dueStr ?? null);

        const durationStr = this.readValue(entry, durationProp);
        const durationMinutes =
          durationStr != null ? Number(durationStr) : undefined;
        const hasDuration =
          typeof durationMinutes === "number" &&
          !Number.isNaN(durationMinutes);

        const seriesStr = this.readValue(entry, seriesProp);
        const series = seriesStr != null ? String(seriesStr) : undefined;

        const groupVal = this.readValue(entry, groupProp);

        const props: PropsMap = {};
        if (durationProp.name && hasDuration) {
          props[durationProp.name] = durationMinutes;
        }
        if (groupProp.name && groupVal != null) {
          props[groupProp.name] = groupVal;
        }

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
  }): any {
    // se estiver em modo "count" explícito, faz sentido chamar o eixo de "Count"
    const yName =
      fields.aggMode === "count"
        ? "Count"
        : fields.y.name ?? "y";

    return {
      x: fields.x.name ?? "x",
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

