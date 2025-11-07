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
      rows = this.buildRowsForAggregatedCharts(grouped, xProp, yProp, seriesProp);
    }

    if (!rows.length) {
      this.rootEl.createDiv({
        cls: "prop-charts-empty",
        text: "No rows to display (check X/Y properties).",
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

  // ---------------------------------------------------------------------------
  // Builders de linhas
  // ---------------------------------------------------------------------------

  private buildRowsForAggregatedCharts(
    groups: any[],
    xProp: SelectedProp,
    yProp: SelectedProp,
    seriesProp: SelectedProp,
  ): QueryResultRow[] {
    const byKey = new Map<string, QueryResultRow & { props: PropsMap }>();

    for (const group of groups) {
      for (const entry of group.entries as any[]) {
        const file = entry.file;

        const xStr =
          this.readValue(entry, xProp) ??
          (file?.name ? String(file.name) : String(file?.path ?? ""));

        const yStr = this.readValue(entry, yProp);

        let yNum = 1;
        if (yProp.id) {
          if (yStr == null) continue;
          const n = Number(yStr);
          if (Number.isNaN(n)) continue;
          yNum = n;
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
        if (row.props && yProp.name && yStr != null)
          row.props[yProp.name] = yNum;
        if (row.props && seriesProp.name && seriesStr != null)
          row.props[seriesProp.name] = seriesStr;
      }
    }

    return Array.from(byKey.values());
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

  private buildEncoding(fields: {
    x: SelectedProp;
    y: SelectedProp;
    series: SelectedProp;
    start: SelectedProp;
    end: SelectedProp;
    due: SelectedProp;
    duration: SelectedProp;
    group: SelectedProp;
  }): any {
    return {
      x: fields.x.name ?? "x",
      y: fields.y.name ?? "y",
      series: fields.series.name ?? "series",
      start: fields.start.name ?? "start",
      end: fields.end.name ?? "end",
      due: fields.due.name ?? "due",
      duration: fields.duration.name ?? "duration",
      group: fields.group.name ?? "group",
    };
  }
}

