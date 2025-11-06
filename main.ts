// main.ts
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
		console.log("loading Chart Notes plugin");

		// Indexador
		this.indexer = new PropChartsIndexer(this.app);
		await this.indexer.buildIndex();

		// Engine de query (usa o índice em memória)
		this.query = new PropChartsQueryEngine(
			() => this.indexer.getAll(),
			[]
		);

		// Renderer
		this.renderer = new PropChartsRenderer();

		// Manter índice atualizado
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

		// ---------------------------------------------------------------------
		// ```chart
		// ---------------------------------------------------------------------
		this.registerMarkdownCodeBlockProcessor(
			"chart",
			async (
				src: string,
				el: HTMLElement,
				_ctx: MarkdownPostProcessorContext
			) => {
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
					el.createEl("div", {
						text: "Chart Notes: 'type' obrigatório.",
					});
					return;
				}

				// validação encoding por tipo
				const isGantt = spec.type === "gantt";
				const isTable = spec.type === "table";
				const needsXY = !isGantt && !isTable;

				if (needsXY) {
					// x sempre obrigatório pra tipos normais
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

				// defaults
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

		// ---------------------------------------------------------------------
		// Bases view (Chart Notes)
		// ---------------------------------------------------------------------
		this.registerBasesView(CHARTNOTES_BASES_VIEW_TYPE, {
			name: "Chart Notes",
			icon: "lucide-chart-area",
			factory: (controller, containerEl) =>
				new ChartNotesBasesView(controller, containerEl),

			// Opções que aparecem no menu da view do Bases
			// (tudo como 'text' pra evitar tipos esquisitos quebrando a UI)
			options: () => [
				{
					type: "text",
					key: "chartType",
					displayName:
						"Tipo do gráfico (bar, line, area, pie, scatter, gantt, stacked-bar)",
					default: "bar",
				},
				{
					type: "text",
					key: "xProperty",
					displayName:
						"Propriedade X / label (ex: file.name, note.status)",
					default: "file.name",
				},
				{
					type: "text",
					key: "yProperty",
					displayName:
						"Propriedade Y / valor numérico (vazio = conta linhas)",
					default: "",
				},
				{
					type: "text",
					key: "seriesProperty",
					displayName:
						"Série / legenda (opcional, ex: note.priority)",
					default: "",
				},
				{
					type: "text",
					key: "startProperty",
					displayName: "Início (Gantt, ex: note.startDate)",
					default: "",
				},
				{
					type: "text",
					key: "endProperty",
					displayName: "Fim (Gantt, ex: note.scheduled)",
					default: "",
				},
				{
					type: "text",
					key: "dueProperty",
					displayName: "Due date (Gantt, opcional)",
					default: "",
				},
				{
					type: "text",
					key: "durationProperty",
					displayName:
						"Duração em minutos (Gantt, opcional, ex: note.timeEstimate)",
					default: "",
				},
				{
					type: "text",
					key: "groupProperty",
					displayName:
						"Grupo (Gantt / séries, opcional, ex: note.projects)",
					default: "",
				},
			] as any,
		});
	}

	onunload() {
		console.log("unloading Chart Notes plugin");
	}
}

