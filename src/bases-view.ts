// src/bases-view.ts

import {
  BasesView,
  type QueryController,
  parsePropertyId,
} from "obsidian";

import type { ChartSpec, QueryResult, QueryResultRow } from "./types";
import { PropChartsRenderer, type RenderContext } from "./renderer";

export const CHARTNOTES_BASES_VIEW_TYPE = "chartnotes-view";

type SelectedProp = {
  /** ID completo da propriedade no Bases, ex: "note.status", "file.name", "formula.due". */
  id: string | null;
  /** Nome curto (sem prefixo), ex: "status" ou "name". */
  name: string | null;
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
  private renderer: PropChartsRenderer;

  constructor(controller: QueryController, parentEl: HTMLElement) {
    super(controller);
    this.containerEl = parentEl.createDiv("chartnotes-bases-view");
    this.renderer = new PropChartsRenderer();
  }

  public onDataUpdated(): void {
    this.containerEl.empty();

    const grouped = (this.data?.groupedData ?? []) as any[];

    if (!grouped.length) {
      this.containerEl.createDiv({
        cls: "prop-charts-empty",
        text: "Sem dados (Base vazia ou sem resultados).",
      });
      return;
    }

    const chartType = normalizeChartType(this.config.get("chartType"));

    let rows: QueryResultRow[];
    if (chartType === "gantt") {
      rows = this.buildRowsForGantt(grouped);
    } else if (chartType === "scatter") {
      rows = this.buildRowsForScatter(grouped);
    } else {
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

    const spec: ChartSpec = {
      type: chartType,
      // Bases já fez o filtro, então o source aqui é só um placeholder neutro.
      source: {
        type: "properties",
        query: "",
      } as any,
      encoding: encoding as any,
      options: {
        title: (this.config as any).name ?? "Chart Notes (Bases)",
        drilldown: true, // mantém clique pra abrir notas
      },
    };

    const ctx: RenderContext = {
      // usado pelo Gantt pra forçar re-render depois de edição
      refresh: () => this.onDataUpdated(),
    };

    this.renderer.render(this.containerEl, spec, result, ctx);
  }

  // -------------------------------------------------------------------------
  // Helpers de propriedades / valores
  // -------------------------------------------------------------------------

  /**
   * Lê o ID de propriedade configurado na view.
   * Se estiver vazio, tenta usar a ordem padrão do Bases (Properties → Order). :contentReference[oaicite:1]{index=1}
   */
  private getSelectedProp(configKey: string): SelectedProp {
    // 1) valor salvo na configuração da view
    let rawId = this.config.get(configKey) as string | null | undefined;

    // 2) se não houver nada configurado, tenta usar a ordem padrão do Bases
    if (!rawId) {
      const order = this.config.getOrder?.() as string[] | undefined;
      if (order && order.length) {
        if (configKey === "xProperty") rawId = order[0];
        else if (configKey === "yProperty") rawId = order[1];
        else if (configKey === "seriesProperty") rawId = order[2];
        else if (configKey === "groupProperty") rawId = order[0];
      }
    }

    if (!rawId || typeof rawId !== "string") {
      return { id: null, name: null };
    }

    try {
      const parsed = parsePropertyId(rawId);
      return {
        id: rawId,
        // parsePropertyId devolve um objeto com `name`, que é o "apelido" sem prefixo. :contentReference[oaicite:2]{index=2}
        name: (parsed as any)?.name ?? rawId,
      };
    } catch {
      // se der erro no parse, ainda assim devolve algo usável
      return { id: rawId, name: rawId };
    }
  }

  /**
   * Lê um valor da entry e devolve string simples (ou null se vazio).
   */
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
      if (typeof value.isEmpty === "function" && value.isEmpty()) return null;
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
   * agrega por (x, series). Se não houver yProperty, faz "count" de linhas.
   */
  private buildRowsForAggregatedCharts(groups: any[]): QueryResultRow[] {
    const xProp = this.getSelectedProp("xProperty");
    const yProp = this.getSelectedProp("yProperty");
    const seriesProp = this.getSelectedProp("seriesProperty");

    const byKey = new Map<string, QueryResultRow>();

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

        if (file?.path) {
          row.notes!.push(file.path);
        }

        if (row.props && xProp.name) row.props[xProp.name] = xStr;
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

  /**
   * Para scatter: uma linha por entry, X e Y numéricos.
   */
  private buildRowsForScatter(groups: any[]): QueryResultRow[] {
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

  /**
   * Para Gantt: uma linha por tarefa com start/end/due/etc.
   */
  private buildRowsForGantt(groups: any[]): QueryResultRow[] {
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
        const series = seriesStr != null ? String(seriesStr) : undefined;

        const groupVal = this.readValue(entry, groupProp);

        const props: Record<string, unknown> = {};
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

