import {
  App,
  MarkdownPostProcessorContext,
  Plugin,
  PluginManifest,
  TFile,
  parseYaml,
} from "obsidian";
import {
  CHARTNOTES_BASES_VIEW_TYPE,
  ChartNotesBasesView,
} from "./src/bases-view";
import { PropChartsIndexer } from "./src/indexer";
import { PropChartsQueryEngine } from "./src/query";
import { PropChartsRenderer } from "./src/renderer";
import type { ChartSpec } from "./src/types";

export default class ChartNotesPlugin extends Plugin {
  private indexer!: PropChartsIndexer;
  private query!: PropChartsQueryEngine;
  private renderer!: PropChartsRenderer;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
  }

  async onload() {
    console.log("Chart Notes: loading plugin");

    // -----------------------------
    // Indexador
    // -----------------------------
    this.indexer = new PropChartsIndexer(this.app);
    await this.indexer.buildIndex();

    this.query = new PropChartsQueryEngine(
      () => this.indexer.getAll(),
      [],
    );

    // Renderer único (markdown + Bases)
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
    // ```chart
    // -----------------------------------------------------------------
    this.registerMarkdownCodeBlockProcessor(
      "chart",
      async (
        src: string,
        el: HTMLElement,
        _ctx: MarkdownPostProcessorContext,
      ) => {
        let spec: ChartSpec;

        // Parse do YAML
        try {
          const parsed = parseYaml(src);
          if (!parsed || typeof parsed !== "object") {
            el.createEl("div", {
              text: "Chart Notes: bloco vazio ou inválido.",
            });
            return;
          }
          spec = parsed as ChartSpec;
        } catch (err: any) {
          el.createEl("div", {
            text:
              "Chart Notes: erro ao ler YAML: " +
              (err?.message ?? String(err)),
          });
          return;
        }

        if (!spec.type) {
          el.createEl("div", {
            text: "Chart Notes: 'type' obrigatório.",
          });
          return;
        }

        const isGantt = spec.type === "gantt";
        const isTable = spec.type === "table";
        const needsXY = !isGantt && !isTable;

        if (needsXY) {
          if (!spec.encoding || !spec.encoding.x) {
            el.createEl("div", {
              text: "Chart Notes: 'encoding.x' é obrigatório.",
            });
            return;
          }

          const aggY = spec.aggregate?.y;
          const isCount = aggY === "count";

          if (!spec.encoding.y && !isCount) {
            el.createEl("div", {
              text:
                "Chart Notes: 'encoding.y' é obrigatório (exceto quando aggregate.y = 'count').",
            });
            return;
          }
        }

        if (!spec.encoding) spec.encoding = {};
        if (!spec.source) spec.source = {};

        let result;
        try {
          result = this.query.run(spec);
        } catch (err: any) {
          el.createEl("div", {
            text:
              "Chart Notes: erro na query: " +
              (err?.message ?? String(err)),
          });
          return;
        }

        this.renderer.render(el, spec, result);
      },
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
          // Em Pie a “série” só gera confusão
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

