// main.ts
import {
  App,
  MarkdownPostProcessorContext,
  Plugin,
  PluginManifest,
  parseYaml,
} from "obsidian";
import { PropChartsIndexer } from "./src/indexer";
import { PropChartsQueryEngine } from "./src/query";
import { PropChartsRenderer } from "./src/renderer";
import type { ChartSpec } from "./src/types";

export default class ChartNotesPlugin extends Plugin {
  private indexer: PropChartsIndexer;
  private query: PropChartsQueryEngine;
  private renderer: PropChartsRenderer;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
  }

  async onload() {
    console.log("loading Chart Notes plugin");

    // monta índice inicial
    this.indexer = new PropChartsIndexer(this.app);
    await this.indexer.buildIndex();

    // defaultPaths = [] → sem filtro se o bloco não disser nada
    this.query = new PropChartsQueryEngine(() => this.indexer.getAll(), []);

    this.renderer = new PropChartsRenderer();

    // manter índice atualizado
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        await this.indexer.updateFile(file);
      })
    );
    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        await this.indexer.updateFile(file);
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", async (file) => {
        this.indexer.removeFile(file);
      })
    );

    // ```chart
    this.registerMarkdownCodeBlockProcessor(
      "chart",
      async (src: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
        let spec: ChartSpec;

        // 1) parse do YAML
        try {
          const parsed = parseYaml(src);
          if (!parsed || typeof parsed !== "object") {
            el.createEl("div", { text: "Chart Notes: bloco vazio ou inválido." });
            return;
          }
          spec = parsed as ChartSpec;
        } catch (err: any) {
          el.createEl("div", {
            text: "Chart Notes: erro ao ler YAML: " + err.message,
          });
          return;
        }

        // 2) type obrigatório
        if (!spec.type) {
          el.createEl("div", { text: "Chart Notes: 'type' obrigatório." });
          return;
        }

        // 3) validação de encoding APENAS para tipos "normais"
        const isGantt = spec.type === "gantt";
        const isTable = spec.type === "table";
        const needsXY = !isGantt && !isTable;

        if (needsXY) {
          // encoding.x sempre obrigatório
          if (!spec.encoding || !spec.encoding.x) {
            el.createEl("div", {
              text: "Chart Notes: 'encoding.x' é obrigatório.",
            });
            return;
          }

          // encoding.y obrigatório, exceto quando aggregate.y == 'count'
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

        // para gantt/table: garantimos que existam objects básicos
        if (!spec.encoding) spec.encoding = {};
        if (!spec.source) spec.source = {};

        // 4) roda a query
        let result;
        try {
          result = this.query.run(spec);
        } catch (err: any) {
          el.createEl("div", {
            text: "Chart Notes: erro na query: " + err.message,
          });
          return;
        }

        // 5) renderiza
        this.renderer.render(el, spec, result);
      }
    );
  }

  onunload() {
    console.log("unloading Chart Notes plugin");
  }
}

