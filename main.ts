import { App, Plugin, PluginManifest, TFile } from "obsidian";
import {
  CHARTNOTES_BASES_VIEW_TYPE,
  ChartNotesBasesView,
} from "./src/bases-view";
import { PropChartsIndexer } from "./src/indexer";
import { PropChartsQueryEngine } from "./src/query";
import { PropChartsRenderer } from "./src/renderer";

export default class ChartNotesPlugin extends Plugin {
  private indexer!: PropChartsIndexer;
  private query!: PropChartsQueryEngine;
  private renderer!: PropChartsRenderer;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
  }

  async onload() {
    console.log("Chart Notes: loading plugin (Bases-only)");

    // -----------------------------
    // Indexador das notas
    // -----------------------------
    this.indexer = new PropChartsIndexer(this.app);
    await this.indexer.buildIndex();

    this.query = new PropChartsQueryEngine(
      () => this.indexer.getAll(),
      [],
    );

    // Renderer compartilhado (apenas Bases agora)
    this.renderer = new PropChartsRenderer();

    // Atualização incremental do índice
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (file instanceof TFile) {
          await this.indexer.updateFile(file);
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        if (file instanceof TFile) {
          await this.indexer.updateFile(file);
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", async (file) => {
        if (file instanceof TFile) {
          this.indexer.removeFile(file);
        }
      }),
    );

    // -----------------------------------------------------------------
    // Bases view (Obsidian 1.10+)
    // -----------------------------------------------------------------
    this.registerBasesView(CHARTNOTES_BASES_VIEW_TYPE, {
      name: "Chart Notes",
      icon: "lucide-chart-area",
      factory: (controller, containerEl) =>
        new ChartNotesBasesView(controller, containerEl, this.renderer),
      options: () => {
        const chartType: any = {
          type: "dropdown",
          key: "chartType",
          displayName: "Chart type",
          default: "bar",
          options: {
            bar: "Bar",
            "stacked-bar": "Stacked bar",
            line: "Line",
            area: "Area",
            pie: "Pie",
            scatter: "Scatter",
            gantt: "Gantt",
          },
        };

        const xProp: any = {
          type: "property",
          key: "xProperty",
          displayName: "X axis / category (bars & slices)",
          shouldHide: (config: any) =>
            String(config.get("chartType") ?? "bar") === "gantt",
        };

        const ganttLabelProp: any = {
          type: "property",
          key: "ganttLabelProperty",
          displayName: "Task label (Gantt)",
          description:
            "Texto mostrado em cada tarefa. Se vazio, usa o nome da nota.",
          shouldHide: (config: any) =>
            String(config.get("chartType") ?? "bar") !== "gantt",
        };

        const yProp: any = {
          type: "property",
          key: "yProperty",
          displayName: "Y value (empty = count)",
          shouldHide: (config: any) => {
            const t = String(config.get("chartType") ?? "bar");
            return t === "pie" || t === "gantt";
          },
        };

        const seriesProp: any = {
          type: "property",
          key: "seriesProperty",
          displayName: "Series / color (optional)",
          shouldHide: (config: any) =>
            String(config.get("chartType") ?? "bar") === "pie",
        };

        const aggMode: any = {
          type: "dropdown",
          key: "aggregateMode",
          displayName: "Value aggregation (Y)",
          default: "sum",
          options: {
            sum: "Sum",
            count: "Count (ignore Y)",
            "cumulative-sum": "Cumulative sum (line/area only)",
          },
          shouldHide: (config: any) => {
            const t = String(config.get("chartType") ?? "bar");
            return t !== "line" && t !== "area";
          },
        };

        const xBucket: any = {
          type: "dropdown",
          key: "xBucket",
          displayName: "X bucketing (dates)",
          default: "auto",
          options: {
            auto: "Auto (keep date/time)",
            none: "None (raw)",
            day: "Day",
            week: "Week",
            month: "Month",
            quarter: "Quarter",
            year: "Year",
          },
          shouldHide: (config: any) => {
            const t = String(config.get("chartType") ?? "bar");
            return t === "pie" || t === "scatter" || t === "gantt";
          },
        };

        const mkGantt = (
          key: string,
          label: string,
          description?: string,
        ): any => ({
          type: "property",
          key,
          displayName: label,
          description,
          shouldHide: (config: any) =>
            String(config.get("chartType") ?? "") !== "gantt",
        });

        const startPropG = mkGantt(
          "startProperty",
          "Start (Gantt)",
          "Data/hora de início. Se faltar, tentamos inferir via fim + duração.",
        );

        const endPropG = mkGantt(
          "endProperty",
          "End (Gantt)",
          "Data/hora de fim da barra (geralmente 'scheduled' ou 'finish').",
        );

        const duePropG = mkGantt(
          "dueProperty",
          "Due (deadline, optional)",
          "Deadline. Usado como fallback quando há due + duração, e mostrado no tooltip.",
        );

        const durationPropG = mkGantt(
          "durationProperty",
          "Duration in minutes (optional)",
          "Estimativa em minutos. Usada para inferir start/end quando só um dos lados existe.",
        );

        const groupPropG = mkGantt(
          "groupProperty",
          "Group / lane (optional)",
          "Projeto/área usada como lane no lado esquerdo do Gantt.",
        );

        const drilldown: any = {
          type: "toggle",
          key: "drilldown",
          displayName: "Drilldown (click opens notes)",
          default: true,
        };

        const title: any = {
          type: "text",
          key: "title",
          displayName: "Title (optional)",
        };

        return [
          chartType,
          xProp,
          ganttLabelProp,
          yProp,
          seriesProp,
          aggMode,
          xBucket,
          startPropG,
          endPropG,
          duePropG,
          durationPropG,
          groupPropG,
          drilldown,
          title,
        ];
      },
    });
  }

  onunload() {
    console.log("Chart Notes: unloading plugin");
  }
}

