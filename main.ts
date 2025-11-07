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
					displayName: "Category / X axis (slice label)",
				};

				const yProp: any = {
					type: "property",
					key: "yProperty",
					displayName: "Value (Y) – empty = count",
				};

				const seriesProp: any = {
					type: "property",
					key: "seriesProperty",
					displayName: "Series / color (optional)",
					// para Pie isso só confunde, então some da UI
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") === "pie",
				};

				// 🔢 Modo de agregação (tamanho da barra/linha/fatia)
				const aggMode: any = {
					type: "dropdown",
					key: "aggregateMode",
					displayName: "Value aggregation (Y)",
					default: "sum",
					options: {
						sum: "Sum",
						count: "Count (ignore Y)",
						"cumulative-sum": "Cumulative (line/area only)",
					},
					shouldHide: (config: any) => {
						const t = String(config.get("chartType") ?? "bar");
						// scatter não agrega; gantt não usa Y
						return t === "scatter" || t === "gantt";
					},
				};

				// 🧭 Bucket de datas em X (mantém o cumulative correto)
				const xBucket: any = {
					type: "dropdown",
					key: "xBucket",
					displayName: "X bucketing (dates)",
					default: "auto",
					options: {
						auto: "Auto (date → day)",
						none: "None",
						day: "Day",
						week: "Week",
						month: "Month",
						quarter: "Quarter",
						year: "Year",
					},
					shouldHide: (config: any) => {
						const t = String(config.get("chartType") ?? "bar");
						// pie/scatter/gantt: bucket de data geralmente não é o que se quer
						return t === "pie" || t === "scatter" || t === "gantt";
					},
				};

				// ⚙️ Campos de Gantt, só aparecem em Gantt
				const mkGantt = (key: string, label: string): any => ({
					type: "property",
					key,
					displayName: label,
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "") !== "gantt",
				});

				const startPropG = mkGantt("startProperty", "Start (Gantt)");
				const endPropG = mkGantt("endProperty", "End (Gantt)");
				const duePropG = mkGantt("dueProperty", "Due (optional)");
				const scheduledPropG = mkGantt("scheduledProperty", "Scheduled (optional)");
				const durationPropG = mkGantt(
					"durationProperty",
					"Duration in minutes (optional)",
				);
				const groupPropG = mkGantt("groupProperty", "Group / lane (optional)");

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
					yProp,
					seriesProp,
					aggMode,
					xBucket,
					startPropG,
					endPropG,
					duePropG,
					scheduledPropG,
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

