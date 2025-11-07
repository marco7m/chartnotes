// src/bases-view.ts
import {
  BasesView,
  type QueryController,
  parsePropertyId,
} from "obsidian";

import type { ChartSpec, QueryResult, QueryResultRow } from "./types";
import type { PropChartsRenderer, RenderContext } from "./renderer";

export const CHARTNOTES_BASES_VIEW_TYPE = "chartnotes-view";

type SelectedProp = {
  id: string | null;
  name: string | null;
};

type ChartNotesBasesSettings = {
  chartType: string;
  xProperty: string | null;
  yProperty: string | null;
  seriesProperty: string | null;
  startProperty: string | null;
  endProperty: string | null;
  dueProperty: string | null;
  durationProperty: string | null;
  groupProperty: string | null;
};

const ALLOWED_CHART_TYPES = [
  "bar",
  "stacked-bar",
  "line",
  "area",
  "pie",
  "scatter",
  "gantt",
] as const;

type AllowedChartType = (typeof ALLOWED_CHART_TYPES)[number];

function normalizeChartType(raw: unknown): AllowedChartType {
  const t = String(raw ?? "bar").trim().toLowerCase();
  return (ALLOWED_CHART_TYPES.includes(t as AllowedChartType)
    ? t
    : "bar") as AllowedChartType;
}

export class ChartNotesBasesView extends BasesView {
  readonly type = CHARTNOTES_BASES_VIEW_TYPE;

  private containerEl: HTMLElement;
  private controlsEl: HTMLElement;
  private chartEl: HTMLElement;
  private renderer: PropChartsRenderer;

  private settings: ChartNotesBasesSettings = {
    chartType: "bar",
    xProperty: null,
    yProperty: null,
    seriesProperty: null,
    startProperty: null,
    endProperty: null,
    dueProperty: null,
    durationProperty: null,
    groupProperty: null,
  };

  private groupedData: any[] = [];
  private initializedFromConfig = false;

  constructor(
    controller: QueryController,
    parentEl: HTMLElement,
    renderer: PropChartsRenderer
  ) {
    super(controller);

    this.renderer = renderer;

    // usa diretamente o container que o Bases passa
    this.containerEl = parentEl;
    this.containerEl.empty();
    this.containerEl.addClass("chartnotes-bases-root");

    // barra de controles
    this.controlsEl = this.containerEl.createDiv(
      "chartnotes-bases-controls"
    );
    this.chartEl = this.containerEl.createDiv(
      "chartnotes-bases-chart"
    );

    // estilo bem chamativo pra não ter dúvida que apareceu
    const cs = this.controlsEl.style;
    cs.display = "flex";
    cs.flexWrap = "wrap";
    cs.alignItems = "flex-end";
    cs.gap = "8px";
    cs.margin = "8px 0";
    cs.padding = "6px 8px";
    cs.borderBottom = "1px solid var(--background-modifier-border)";
    cs.backgroundColor = "var(--background-secondary)";

    const title = this.controlsEl.createEl("div");
    title.textContent = "Chart Notes – controles (UI interna)";
    title.style.fontWeight = "bold";
    title.style.marginRight = "12px";
  }

  public onDataUpdated(): void {
    const data: any = (this as any).data;
    this.groupedData = (data?.groupedData ?? []) as any[];

    if (!this.initializedFromConfig) {
      this.loadSettingsFromConfig();
      this.ensureDefaultsFromOrder();
      this.initializedFromConfig = true;
    }

    this.buildControlsUI();
    this.renderChart();
  }

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  private loadSettingsFromConfig(): void {
    const cfg: any = (this as any).config;
    if (!cfg) return;

    const readString = (key: string): string | null => {
      try {
        const v = cfg.get(key);
        if (typeof v === "string" && v.trim().length > 0) {
          return v;
        }
      } catch {
        // ignore
      }
      return null;
    };

    const ct = readString("chartType");
    if (ct) {
      this.settings.chartType = ct;
    }

    this.settings.xProperty = readString("xProperty");
    this.settings.yProperty = readString("yProperty");
    this.settings.seriesProperty = readString("seriesProperty");
    this.settings.startProperty = readString("startProperty");
    this.settings.endProperty = readString("endProperty");
    this.settings.dueProperty = readString("dueProperty");
    this.settings.durationProperty = readString("durationProperty");
    this.settings.groupProperty = readString("groupProperty");
  }

  private saveSettingsToConfig(): void {
    const cfg: any = (this as any).config;
    if (!cfg || typeof cfg.set !== "function") return;

    const set = (key: string, value: string | null) => {
      try {
        cfg.set(key, value ?? null);
      } catch {
        // ignore
      }
    };

    set("chartType", this.settings.chartType);
    set("xProperty", this.settings.xProperty);
    set("yProperty", this.settings.yProperty);
    set("seriesProperty", this.settings.seriesProperty);
    set("startProperty", this.settings.startProperty);
    set("endProperty", this.settings.endProperty);
    set("dueProperty", this.settings.dueProperty);
    set("durationProperty", this.settings.durationProperty);
    set("groupProperty", this.settings.groupProperty);
  }

  private ensureDefaultsFromOrder(): void {
    const cfg: any = (this as any).config;
    const order = (cfg?.getOrder?.() as string[] | undefined) ?? [];
    if (!order.length) return;

    const pick = (index: number): string | null =>
      index >= 0 && index < order.length ? order[index] : null;

    if (!this.settings.xProperty) {
      this.settings.xProperty = pick(0);
    }
    if (!this.settings.yProperty) {
      this.settings.yProperty = pick(1);
    }
    if (!this.settings.seriesProperty) {
      this.settings.seriesProperty = pick(2);
    }
  }

  // ---------------------------------------------------------------------------
  // UI de controles
  // ---------------------------------------------------------------------------

  private buildControlsUI(): void {
    // limpa tudo, menos o título que já foi criado no constructor
    const children = Array.from(this.controlsEl.children);
    // mantém só o primeiro (o título)
    for (let i = 1; i < children.length; i++) {
      children[i].remove();
    }

    const cfg: any = (this as any).config;
    const order = (cfg?.getOrder?.() as string[] | undefined) ?? [];

    // Tipo do gráfico
    const typeWrapper = this.controlsEl.createDiv(
      "chartnotes-control"
    );
    const typeLabel = typeWrapper.createEl("label");
    typeLabel.textContent = "Tipo:";
    typeLabel.style.marginRight = "4px";

    const typeSelect = typeWrapper.createEl(
      "select"
    ) as HTMLSelectElement;

    for (const type of ALLOWED_CHART_TYPES) {
      const opt = typeSelect.createEl("option");
      opt.value = type;
      opt.text = type;
    }

    typeSelect.value = normalizeChartType(
      this.settings.chartType
    ) as string;

    typeSelect.onchange = () => {
      this.settings.chartType = typeSelect.value;
      this.saveSettingsToConfig();
      this.renderChart();
    };

    const makePropSelect = (
      key: keyof ChartNotesBasesSettings,
      labelText: string
    ) => {
      const wrapper = this.controlsEl.createDiv(
        "chartnotes-control"
      );
      const label = wrapper.createEl("label");
      label.textContent = labelText;
      label.style.marginRight = "4px";

      const select = wrapper.createEl(
        "select"
      ) as HTMLSelectElement;

      const emptyOpt = select.createEl("option");
      emptyOpt.value = "";
      emptyOpt.text = "(auto)";

      for (const propId of order) {
        let display = propId;
        try {
          const parsed = parsePropertyId(
            propId as
              | `note.${string}`
              | `file.${string}`
              | `formula.${string}`
          );
          const type = (parsed as any).type ?? "";
          const name = (parsed as any).name ?? propId;
          display = type ? `${name} (${type})` : name;
        } catch {
          // ignore
        }

        const opt = select.createEl("option");
        opt.value = propId;
        opt.text = display;
      }

      const current = (this.settings[key] ?? "") as string | null;
      if (current) {
        select.value = current;
      }

      select.onchange = () => {
        const value = select.value || null;
        (this.settings as any)[key] = value;
        this.saveSettingsToConfig();
        this.renderChart();
      };
    };

    // X / Y / Série
    makePropSelect("xProperty", "X:");
    makePropSelect("yProperty", "Y:");
    makePropSelect("seriesProperty", "Série:");

    // Gantt
    makePropSelect("startProperty", "Início:");
    makePropSelect("endProperty", "Fim:");
    makePropSelect("dueProperty", "Due:");
    makePropSelect("durationProperty", "Duração:");
    makePropSelect("groupProperty", "Grupo:");
  }

  // ---------------------------------------------------------------------------
  // Render do gráfico
  // ---------------------------------------------------------------------------

  private renderChart(): void {
    this.chartEl.empty();

    if (!this.groupedData || this.groupedData.length === 0) {
      this.chartEl.createDiv({
        cls: "prop-charts-empty",
        text: "Sem dados (Base vazia ou sem resultados).",
      });
      return;
    }

    const chartType = normalizeChartType(
      this.settings.chartType
    );

    let rows: QueryResultRow[];
    if (chartType === "gantt") {
      rows = this.buildRowsForGantt(this.groupedData);
    } else if (chartType === "scatter") {
      rows = this.buildRowsForScatter(this.groupedData);
    } else {
      rows = this.buildRowsForAggregatedCharts(this.groupedData);
    }

    if (!rows.length) {
      this.chartEl.createDiv({
        cls: "prop-charts-empty",
        text: "Sem linhas para exibir (verifique as propriedades X/Y).",
      });
      return;
    }

    const result: QueryResult = { rows };
    const encoding = this.buildEncoding();

    const cfg: any = (this as any).config;
    const viewName: string =
      cfg?.name ?? "Chart Notes (Bases)";

    const spec: ChartSpec = {
      type: chartType as any,
      source: {
        type: "properties",
        query: "",
      } as any,
      encoding: encoding as any,
      options: {
        title: viewName,
        drilldown: true,
      },
    };

    const ctx: RenderContext = {
      refresh: () => this.onDataUpdated(),
    };

    this.renderer.render(this.chartEl, spec, result, ctx);
  }

  // ---------------------------------------------------------------------------
  // Helpers de propriedades / valores
  // ---------------------------------------------------------------------------

  private getSelectedProp(
    field: keyof ChartNotesBasesSettings
  ): SelectedProp {
    const id = this.settings[field];
    if (!id) {
      return { id: null, name: null };
    }

    try {
      const parsed = parsePropertyId(
        id as
          | `note.${string}`
          | `file.${string}`
          | `formula.${string}`
      );
      return {
        id,
        name: (parsed as any).name ?? id,
      };
    } catch {
      return { id, name: id };
    }
  }

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
      ) {
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
    groups: any[]
  ): QueryResultRow[] {
    const xProp = this.getSelectedProp("xProperty");
    const yProp = this.getSelectedProp("yProperty");
    const seriesProp = this.getSelectedProp("seriesProperty");

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

        const seriesStr = this.readValue(entry, seriesProp);
        const series =
          seriesStr != null ? String(seriesStr) : undefined;

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
        if (row.props && seriesProp.name && seriesStr != null) {
          row.props[seriesProp.name] = seriesStr;
        }
      }
    }

    return Array.from(byKey.values());
  }

  private buildRowsForScatter(
    groups: any[]
  ): QueryResultRow[] {
    const xProp = this.getSelectedProp("xProperty");
    const yProp = this.getSelectedProp("yProperty");
    const seriesProp = this.getSelectedProp("seriesProperty");

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
        const series =
          seriesStr != null ? String(seriesStr) : undefined;

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
    groups: any[]
  ): QueryResultRow[] {
    const xProp = this.getSelectedProp("xProperty");
    const seriesProp = this.getSelectedProp("seriesProperty");
    const startProp = this.getSelectedProp("startProperty");
    const endProp = this.getSelectedProp("endProperty");
    const dueProp = this.getSelectedProp("dueProperty");
    const durationProp = this.getSelectedProp("durationProperty");
    const groupProp = this.getSelectedProp("groupProperty");

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
        const series =
          seriesStr != null ? String(seriesStr) : undefined;

        const groupVal = this.readValue(entry, groupProp);

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

  private buildEncoding(): any {
    const xProp = this.getSelectedProp("xProperty");
    const yProp = this.getSelectedProp("yProperty");
    const seriesProp = this.getSelectedProp("seriesProperty");
    const startProp = this.getSelectedProp("startProperty");
    const endProp = this.getSelectedProp("endProperty");
    const dueProp = this.getSelectedProp("dueProperty");
    const durationProp = this.getSelectedProp("durationProperty");
    const groupProp = this.getSelectedProp("groupProperty");

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

