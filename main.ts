// main.ts
import {
	App,
	MarkdownPostProcessorContext,
	Notice,
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
			[]
		);

		// Renderer único compartilhado (markdown + Bases)
		this.renderer = new PropChartsRenderer();

		// Atualização do índice
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

		// -----------------------------
		// Bloco ```chart
		// -----------------------------
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
						text:
							"Chart Notes: erro ao ler YAML: " +
							err?.message,
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
							err?.message,
					});
					return;
				}

				this.renderer.render(el, spec, result);
			}
		);

		// -----------------------------
		// Integração com Bases (SE existir)
		// -----------------------------
		const anyPlugin = this as any;

		if (typeof anyPlugin.registerBasesView === "function") {
			console.log(
				"Chart Notes: registerBasesView disponível, registrando view do Bases."
			);

			anyPlugin.registerBasesView(CHARTNOTES_BASES_VIEW_TYPE, {
				name: "Chart Notes",
				icon: "lucide-chart-area",

				factory: (controller: any, containerEl: HTMLElement) => {
					return new ChartNotesBasesView(
						controller,
						containerEl,
						this.renderer
					);
				},

				// Mesmas opções que eu te mandei antes
				options: () =>
					[
						{
							type: "dropdown",
							key: "chartType",
							displayName: "Tipo do gráfico",
							default: "bar",
							options: {
								bar: "Barra",
								"stacked-bar": "Barra empilhada",
								line: "Linha",
								area: "Área",
								pie: "Pizza",
								scatter: "Dispersão",
								gantt: "Gantt",
							},
						},
						{
							type: "text",
							key: "title",
							displayName: "Título (opcional)",
							placeholder:
								"(vazio = usa nome da view)",
						},
						{
							type: "property",
							key: "xProperty",
							displayName:
								"Propriedade X / label",
						},
						{
							type: "property",
							key: "yProperty",
							displayName:
								"Propriedade Y / valor (vazio = contagem)",
						},
						{
							type: "property",
							key: "seriesProperty",
							displayName:
								"Série (opcional, gera legenda / cores)",
						},
						// Gantt
						{
							type: "property",
							key: "startProperty",
							displayName: "Início (Gantt)",
						},
						{
							type: "property",
							key: "endProperty",
							displayName: "Fim (Gantt)",
						},
						{
							type: "property",
							key: "dueProperty",
							displayName:
								"Due date (Gantt, opcional)",
						},
						{
							type: "property",
							key: "durationProperty",
							displayName:
								"Duração em minutos (Gantt, opcional)",
						},
						{
							type: "property",
							key: "groupProperty",
							displayName:
								"Grupo / lane (Gantt / séries, opcional)",
						},
						// Opções gerais
						{
							type: "toggle",
							key: "drilldown",
							displayName:
								"Drilldown (clicar abre lista de notas)",
							default: true,
						},
						{
							type: "text",
							key: "background",
							displayName:
								"Cor de fundo (ex: #ffffff, opcional)",
							placeholder: "#ffffff",
						},
						{
							type: "multitext",
							key: "tooltipFields",
							displayName:
								"Campos extras no tooltip (ex: status,priority)",
							default: [],
						},
					] as any,
			});
		} else {
			console.warn(
				"Chart Notes: registerBasesView não existe nesta versão do Obsidian. Integração com Bases desabilitada."
			);

			// Aviso visível uma vez pro usuário
			new Notice(
				"Chart Notes: sua versão do Obsidian ainda não expõe a API do Bases. A integração com Bases ficará desabilitada até uma atualização futura."
			);
		}
	}

	onunload() {
		console.log("Chart Notes: unloading plugin");
	}
}

