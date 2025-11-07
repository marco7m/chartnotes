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

		// Indexador
		this.indexer = new PropChartsIndexer(this.app);
		await this.indexer.buildIndex();

		this.query = new PropChartsQueryEngine(
			() => this.indexer.getAll(),
			[],
		);

		// Renderer ÚNICO (markdown + Bases)
		this.renderer = new PropChartsRenderer();

		// Atualização de índice
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
						text: "Chart Notes: erro na query: " + err.message,
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
				// truque com `any` pra evitar erro de TS se o obsidian.d.ts ainda
				// não tiver o campo `shouldHide` atualizado
				const chartTypeOption: any = {
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

				const xOption: any = {
					type: "property",
					key: "xProperty",
					displayName: "X axis / label",
				};

				const yOption: any = {
					type: "property",
					key: "yProperty",
					displayName: "Y axis / value (empty = count)",
				};

				const seriesOption: any = {
					type: "property",
					key: "seriesProperty",
					displayName: "Series / color (optional)",
				};

				// 🔢 modo de agregação
				const aggregateModeOption: any = {
					type: "dropdown",
					key: "aggregateMode",
					displayName: "Aggregation (Y)",
					default: "sum",
					options: {
						sum: "Sum",
						count: "Count (ignore Y)",
						"cumulative-sum": "Cumulative sum",
					},
					shouldHide: (config: any) => {
						const t = String(config.get("chartType") ?? "bar");
						// agregação só faz sentido pra charts agregados
						return t === "scatter" || t === "gantt";
					},
				};

				// opções específicas de Gantt – escondidas se não for Gantt
				const startOption: any = {
					type: "property",
					key: "startProperty",
					displayName: "Start (Gantt)",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "") !== "gantt",
				};

				const endOption: any = {
					type: "property",
					key: "endProperty",
					displayName: "End (Gantt)",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "") !== "gantt",
				};

				const dueOption: any = {
					type: "property",
					key: "dueProperty",
					displayName: "Due (Gantt, optional)",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "") !== "gantt",
				};

				const durationOption: any = {
					type: "property",
					key: "durationProperty",
					displayName: "Duration in minutes (Gantt, optional)",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "") !== "gantt",
				};

				const groupOption: any = {
					type: "property",
					key: "groupProperty",
					displayName: "Group / lane (Gantt, optional)",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "") !== "gantt",
				};

				const drilldownOption: any = {
					type: "toggle",
					key: "drilldown",
					displayName: "Drilldown (click opens notes)",
					default: true,
				};

				const titleOption: any = {
					type: "text",
					key: "title",
					displayName: "Title (optional)",
				};

				return [
					chartTypeOption,
					xOption,
					yOption,
					seriesOption,
					aggregateModeOption,
					startOption,
					endOption,
					dueOption,
					durationOption,
					groupOption,
					drilldownOption,
					titleOption,
				];
			},
		});

	}

	onunload() {
		console.log("Chart Notes: unloading plugin");
	}
}

