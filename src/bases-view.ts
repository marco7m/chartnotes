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
import type {
  PropChartsRenderer,
  RenderContext,
} from "./renderer";

export const CHARTNOTES_BASES_VIEW_TYPE = "chartnotes-view";

/** Par (id, name) de uma propriedade do Bases. */
type SelectedProp = {
  id: string | null;
  name: string | null;
};

type LocalKV = Record<string, unknown>;

/**
 * View Chart Notes integrada ao Bases com UI PRÓPRIA.
 * Funciona no Obsidian 1.9.x (sem options()) e depois podemos migrar
 * para a UI nativa do Bases (options()) no 1.10+.
 */
export class ChartNotesBasesView extends BasesView {
  readonly type = CHARTNOTES_BASES_VIEW_TYPE;

  private hostEl: HTMLElement;     // raiz da view (painel + chart)
  private toolbarEl!: HTMLElement; // painel de controles
  private chartEl!: HTMLElement;   // container do gráfico
  private styleInjected = false;

  private renderer: PropChartsRenderer;

  // fallback de estado quando this.config.set/get não existe:
  private localConfig: LocalKV = {};

  // refs dos inputs (pra ler/escrever sem ficar buscando na DOM):
  private inputs: {
    type?: HTMLSelectElement;
    x?: HTMLInputElement;
    y?: HTMLInputElement;
    series?: HTMLInputElement;
    start?: HTMLInputElement;
    end?: HTMLInputElement;
    due?: HTMLInputElement;
    duration?: HTMLInputElement;
    group?: HTMLInputElement;
    drilldown?: HTMLInputElement; // checkbox
    background?: HTMLInputElement;
    tooltip?: HTMLInputElement;   // comma list
    hidePanel?: HTMLInputElement; // checkbox
  } = {};

  constructor(
    controller: QueryController,
    parentEl: HTMLElement,
    renderer: PropChartsRenderer
  ) {
    super(controller);
    this.renderer = renderer;

    this.hostEl = parentEl.createDiv("chartnotes-bases-view");
    this.ensureScaffolding();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  public onDataUpdated(): void {
    // constrói UI (se ainda não)
    this.ensureScaffolding();

    // lê dados do Bases
    const grouped = (this as any).data?.groupedData as any[] | undefined;

    this.chartEl.empty();

    if (!grouped || grouped.length === 0) {
      this.chartEl.createDiv({
        cls: "prop-charts-empty",
        text: "Sem dados (Base vazia ou sem resultados).",
      });
      return;
    }

    // coleta config (UI + fallback + defaults)
    const chartType = this.getChartType();
    const rows =
      chartType === "gantt"
        ? this.buildRowsForGantt(grouped)
        : chartType === "scatter"
        ? this.buildRowsForScatter(grouped)
        : this.buildRowsForAggregatedCharts(grouped);

    if (!rows.length) {
      this.chartEl.createDiv({
        cls: "prop-charts-empty",
        text:
          "Sem linhas para exibir. Verifique as propriedades X/Y (ou campos Gantt).",
      });
      return;
    }

    const result: QueryResult = { rows };
    const spec: ChartSpec = {
      type: chartType as any,
      source: { type: "properties", query: "" } as any,
      encoding: this.buildEncoding() as any,
      options: {
        title: this.getString("title") || (this as any).config?.name || "Chart Notes (Bases)",
        drilldown: this.getBool("drilldown", true),
        background: this.getString("background") || undefined,
        tooltipFields: this.getCsvArray("tooltip"),
      },
    };

    const ctx: RenderContext = { refresh: () => this.onDataUpdated() };

    this.renderer.render(this.chartEl, spec, result, ctx);
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  private ensureScaffolding() {
    // CSS (uma vez)
    if (!this.styleInjected) {
      this.styleInjected = true;
      const style = document.createElement("style");
      style.textContent = `
        .chartnotes-bases-view {
          display: flex;
          flex-direction: column;
          gap: 8px;
          height: 100%;
        }
        .chartnotes-toolbar {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 8px;
          align-items: end;
          background: var(--background-secondary);
          padding: 8px;
          border-radius: 8px;
        }
        .chartnotes-toolbar .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .chartnotes-toolbar .field label {
          font-size: 12px;
          opacity: 0.8;
        }
        .chartnotes-toolbar input[type="text"],
        .chartnotes-toolbar input[type="search"],
        .chartnotes-toolbar input[type="color"],
        .chartnotes-toolbar select {
          width: 100%;
        }
        .chartnotes-toolbar .row-span-2 {
          grid-column: span 2;
        }
        .chartnotes-chart {
          flex: 1 1 auto;
          min-height: 220px;
        }
        .chartnotes-toolbar .toggle-line {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-top: 10px;
        }
        .chartnotes-hidden { display: none; }
      `;
      this.hostEl.appendChild(style);
    }

    // toolbar + chart containers (uma vez)
    if (!this.toolbarEl) {
      this.toolbarEl = this.hostEl.createDiv("chartnotes-toolbar");
      this.buildControls(this.toolbarEl);
    }
    if (!this.chartEl) {
      this.chartEl = this.hostEl.createDiv("chartnotes-chart");
    }
  }

  private buildControls(root: HTMLElement) {
    root.empty();

    // Lista de propriedades sugeridas (order do Bases)
    const order = this.getOrderProps();

    const mkField = (labelText: string, cls?: string) => {
      const wrap = root.createDiv({ cls: "field" + (cls ? " " + cls : "") });
      const label = wrap.createEl("label", { text: labelText });
      return { wrap, label };
    };

    // Tipo
    {
      const { wrap } = mkField("Tipo do gráfico");
      const sel = wrap.createEl("select");
      [
        ["bar", "Barra"],
        ["stacked-bar", "Barra empilhada"],
        ["line", "Linha"],
        ["area", "Área"],
        ["pie", "Pizza"],
        ["scatter", "Dispersão"],
        ["gantt", "Gantt"],
      ].forEach(([v, txt]) => {
        const opt = sel.createEl("option", { text: txt }) as HTMLOptionElement;
        opt.value = v;
      });
      sel.value = this.getString("chartType") || "bar";
      sel.addEventListener("change", () => {
        this.setConfig("chartType", sel.value);
        this.toggleGanttFields();
        this.onDataUpdated();
      });
      this.inputs.type = sel;
    }

    // helpers input texto + datalist
    const buildPropInput = (
      key: keyof ChartnotesConfigKeys,
      label: string,
      placeholder = ""
    ) => {
      const { wrap } = mkField(label);
      const input = wrap.createEl("input", {
        type: "search",
        placeholder,
      }) as HTMLInputElement;

      // datalist com sugestões
      const listId = `chartnotes-props-${key}-${Math.random().toString(36).slice(2)}`;
      input.setAttr("list", listId);
      const dl = wrap.createEl("datalist");
      dl.id = listId;

      // Popular com order() + algumas comuns
      const suggestions = new Set<string>([
        ...order,
        "note.status",
        "note.priority",
        "note.category",
        "note.tags",
        "note.scheduled",
        "note.due",
        "note.start",
        "note.end",
        "note.duration",
        "file.name",
      ]);
      suggestions.forEach((s) => dl.createEl("option", { value: s }));

      // valor inicial
      input.value = this.getString(key as any) || "";

      input.addEventListener("change", () => {
        this.setConfig(key as any, input.value.trim() || null);
        this.onDataUpdated();
      });

      // salvar ref
      (this.inputs as any)[key] = input;
    };

    type ChartnotesConfigKeys =
      | "xProperty"
      | "yProperty"
      | "seriesProperty"
      | "startProperty"
      | "endProperty"
      | "dueProperty"
      | "durationProperty"
      | "groupProperty"
      | "title"
      | "background"
      | "tooltip"
      | "chartType"
      | "drilldown";

    // X / Y / Série
    buildPropInput("xProperty", "Propriedade X / label", "ex: note.category");
    buildPropInput("yProperty", "Propriedade Y / valor (vazio = contagem)", "ex: note.priority");
    buildPropInput("seriesProperty", "Série (opcional, cores/legenda)", "ex: note.status");

    // Gantt
    buildPropInput("startProperty", "Início (Gantt)", "ex: note.start");
    buildPropInput("endProperty", "Fim (Gantt)", "ex: note.end");
    buildPropInput("dueProperty", "Due date (Gantt, opcional)", "ex: note.due");
    buildPropInput("durationProperty", "Duração em minutos (Gantt, opcional)", "ex: note.duration");
    buildPropInput("groupProperty", "Grupo / lane (Gantt / séries)", "ex: note.category");

    // Título
    {
      const { wrap } = mkField("Título (opcional)");
      const input = wrap.createEl("input", {
        type: "text",
        placeholder: "(vazio = usa nome da view)",
      }) as HTMLInputElement;
      input.value = this.getString("title") || "";
      input.addEventListener("change", () => {
        this.setConfig("title", input.value.trim());
        this.onDataUpdated();
      });
      this.inputs.background = this.inputs.background; // no-op só pra manter ordem
      // guardar? não precisa — não usamos ref pra título depois
    }

    // Background
    {
      const { wrap } = mkField("Cor de fundo (hex opcional)");
      const input = wrap.createEl("input", {
        type: "text",
        placeholder: "#ffffff",
      }) as HTMLInputElement;
      input.value = this.getString("background") || "";
      input.addEventListener("change", () => {
        this.setConfig("background", input.value.trim());
        this.onDataUpdated();
      });
      this.inputs.background = input;
    }

    // Tooltip extra (CSV)
    {
      const { wrap } = mkField("Campos extras (tooltip, separados por vírgula)", "row-span-2");
      const input = wrap.createEl("input", {
        type: "text",
        placeholder: "ex: status,priority,owner",
      }) as HTMLInputElement;
      input.value = (this.getCsvArray("tooltip") || []).join(",");
      input.addEventListener("change", () => {
        this.setConfig("tooltip", input.value);
        this.onDataUpdated();
      });
      this.inputs.tooltip = input;
    }

    // Drilldown + esconder painel
    {
      const { wrap } = mkField("Ações");
      const line = wrap.createDiv("toggle-line");

      const drill = line.createEl("input", { type: "checkbox" }) as HTMLInputElement;
      drill.checked = this.getBool("drilldown", true);
      drill.addEventListener("change", () => {
        this.setConfig("drilldown", !!drill.checked);
        this.onDataUpdated();
      });
      line.createEl("span", { text: "Drilldown (abrir notas ao clicar)" });
      this.inputs.drilldown = drill;

      const hide = line.createEl("input", { type: "checkbox", attr: { style: "margin-left:16px" } }) as HTMLInputElement;
      hide.checked = this.getBool("hidePanel", false);
      hide.addEventListener("change", () => {
        this.setConfig("hidePanel", !!hide.checked);
        this.toggleToolbarVisibility();
      });
      line.createEl("span", { text: "Ocultar painel" });
      this.inputs.hidePanel = hide;
    }

    // Mostrar/ocultar campos de Gantt conforme tipo atual
    this.toggleGanttFields();
    // Aplicar visibilidade do painel
    this.toggleToolbarVisibility();
  }

  private toggleGanttFields() {
    const isGantt = this.getChartType() === "gantt";
    const labels = Array.from(this.toolbarEl.querySelectorAll("label"));
    const wanted = new Set(["Início (Gantt)", "Fim (Gantt)", "Due date (Gantt, opcional)", "Duração em minutos (Gantt, opcional)", "Grupo / lane (Gantt / séries)"]);
    labels.forEach((lab) => {
      const field = lab.closest(".field") as HTMLElement | null;
      if (!field) return;
      if (wanted.has(lab.textContent || "")) {
        field.classList.toggle("chartnotes-hidden", !isGantt);
      }
    });
  }

  private toggleToolbarVisibility() {
    const hide = this.getBool("hidePanel", false);
    this.toolbarEl.classList.toggle("chartnotes-hidden", hide);
  }

  // ---------------------------------------------------------------------------
  // Config helpers (com fallback local)
  // ---------------------------------------------------------------------------

  private getConfigObj(): any {
    return (this as any).config ?? null;
  }

  private getString(key: string): string | null {
    const cfg = this.getConfigObj();
    if (cfg?.get) {
      const v = cfg.get(key);
      return v == null ? null : String(v);
    }
    const v = this.localConfig[key];
    return v == null ? null : String(v);
  }

  private getBool(key: string, def = false): boolean {
    const cfg = this.getConfigObj();
    if (cfg?.get) {
      const v = cfg.get(key);
      return typeof v === "boolean" ? v : def;
    }
    const v = this.localConfig[key];
    return typeof v === "boolean" ? (v as boolean) : def;
  }

  private getCsvArray(key: string): string[] | undefined {
    const raw = this.getString(key);
    if (!raw) return undefined;
    const arr = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return arr.length ? arr : undefined;
  }

  private setConfig(key: string, value: unknown) {
    const cfg = this.getConfigObj();
    if (cfg?.set) {
      try {
        cfg.set(key, value);
        return;
      } catch {
        // ignore e cai no fallback local
      }
    }
    this.localConfig[key] = value as any;
  }

  private getChartType(): "bar" | "stacked-bar" | "line" | "area" | "pie" | "scatter" | "gantt" {
    const t = (this.getString("chartType") || "bar").toLowerCase().trim();
    const allow = new Set(["bar", "stacked-bar", "line", "area", "pie", "scatter", "gantt"]);
    return (allow.has(t) ? t : "bar") as any;
  }

  private getOrderProps(): string[] {
    const cfg = this.getConfigObj();
    const arr = (cfg?.getOrder?.() as string[] | undefined) ?? [];
    return Array.isArray(arr) ? arr : [];
  }

  // ---------------------------------------------------------------------------
  // Propriedades / leitura
  // ---------------------------------------------------------------------------

  private getSelectedProp(configKey: string): SelectedProp {
    // 1) valor escolhido na UI
    let rawId = this.getString(configKey);

    // 2) fallback pelo order() do Bases
    if (!rawId) {
      const order = this.getOrderProps();
      if (order?.length) {
        if (configKey === "xProperty") rawId = order[0];
        else if (configKey === "yProperty") rawId = order[1];
        else if (configKey === "seriesProperty") rawId = order[2];
        else if (configKey === "groupProperty") rawId = order[0];
      }
    }

    if (!rawId) return { id: null, name: null };

    try {
      const parsed = parsePropertyId(rawId as any);
      return {
        id: rawId,
        name: (parsed as any)?.name ?? rawId,
      };
    } catch {
      return { id: rawId, name: rawId };
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

  // ---------------------------------------------------------------------------
  // Builders de linhas
  // ---------------------------------------------------------------------------

  /** bar/line/area/pie/stacked-bar: agrega por (x, série). Y = soma ou contagem. */
  private buildRowsForAggregatedCharts(groups: any[]): QueryResultRow[] {
    const xProp = this.getSelectedProp("xProperty");
    const yProp = this.getSelectedProp("yProperty");
    const seriesProp = this.getSelectedProp("seriesProperty");

    const byKey = new Map<string, QueryResultRow & { props: Record<string, any> }>();

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
          row = { x: xStr, y: 0, series, notes: [], props: {} };
          byKey.set(key, row);
        }

        row.y += yNum;

        if (file?.path) row.notes!.push(file.path);

        if (row.props && xProp.name) row.props[xProp.name] = xStr;
        if (row.props && yProp.name && yStr != null) row.props[yProp.name] = yNum;
        if (row.props && seriesProp.name && seriesStr != null) row.props[seriesProp.name] = seriesStr;
      }
    }

    return Array.from(byKey.values());
  }

  /** scatter: uma linha por entry com X/Y numéricos. */
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

  /** gantt: uma linha por tarefa com start/end/due/duration/group. */
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
          (file?.name ? String(file.name).replace(/\.md$/i, "") : String(file?.path ?? ""));

        const dueStr = this.readValue(entry, dueProp);
        const due = this.parseDate(dueStr ?? null);

        const durationStr = this.readValue(entry, durationProp);
        const durationMinutes = durationStr != null ? Number(durationStr) : undefined;
        const hasDuration = typeof durationMinutes === "number" && !Number.isNaN(durationMinutes);

        const seriesStr = this.readValue(entry, seriesProp);
        const series = seriesStr != null ? String(seriesStr) : undefined;

        const groupVal = this.readValue(entry, groupProp);

        const props: Record<string, any> = {};
        if (durationProp.name && hasDuration) props[durationProp.name] = durationMinutes;
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

  /** encoding básico (gantt usa; os demais ignoram o que não precisam). */
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

