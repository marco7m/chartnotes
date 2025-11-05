// main.ts
import {
  App,
  MarkdownPostProcessorContext,
  Plugin,
  PluginManifest,
  TFile,
  parseYaml,
} from "obsidian";

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
    console.log("loading Chart Notes plugin");

    // indexador
    this.indexer = new PropChartsIndexer(this.app);
    await this.indexer.buildIndex();

    // engine de query (sem defaultPaths fixos aqui)
    this.query = new PropChartsQueryEngine(() => this.indexer.getAll(), []);

    // renderer
    this.renderer = new PropChartsRenderer();

    // manter índice atualizado – agora tipado pra TFile
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        if (file instanceof TFile) {
          await this.indexer.updateFile(file);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        if (file instanceof TFile) {
          await this.indexer.updateFile(file);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", async (file) => {
        if (file instanceof TFile) {
          this.indexer.removeFile(file);
        }
      })
    );

    // ```chart
    this.registerMarkdownCodeBlockProcessor(
      "chart",
      async (src: string, el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
        let spec: ChartSpec;
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
            text: "Chart Notes: erro ao ler YAML: " + err.message,
          });
          return;
        }

        // type é obrigatório
        if (!spec.type) {
          el.createEl("div", { text: "Chart Notes: 'type' obrigatório." });
          return;
        }

        // ── validação encoding por tipo ─────────────────────────────
        const isGantt = spec.type === "gantt";
        const isTable = spec.type === "table";
        const needsXY = !isGantt && !isTable;

        if (needsXY) {
          // x sempre obrigatório pra tipos "normais"
          if (!spec.encoding || !spec.encoding.x) {
            el.createEl("div", {
              text: "Chart Notes: 'encoding.x' é obrigatório.",
            });
            return;
          }

          // y opcional SOMENTE se aggregate.y == 'count'
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

        // para gantt/table, garantimos pelo menos um objeto vazio
        if (!spec.encoding) spec.encoding = {};
        if (!spec.source) spec.source = {};

        let result;
        try {
          result = this.query.run(spec);
        } catch (err: any) {
          el.createEl("div", {
            text: "Chart Notes: erro na query: " + err.message,
          });
          return;
        }

        this.renderer.render(el, spec, result);
      }
    );
  }

  onunload() {
    console.log("unloading Chart Notes plugin");
  }
}

