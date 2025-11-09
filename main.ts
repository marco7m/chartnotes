// main.ts
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

		// Indexador
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
				const opts: any[] = [];

				// Tipo de gráfico
				opts.push({
					type: "dropdown",
					key: "chartType",
					displayName: "Chart type",
					description: "Type of chart to render",
					default: "bar",
					options: {
						bar: "Bar",
						"stacked-bar": "Stacked bar",
						line: "Line",
						area: "Area",
						pie: "Pie",
						scatter: "Scatter",
						gantt: "Gantt",
					} as Record<string, string>,
				} as any);

				// X / categoria (usado em todos, exceto Gantt)
				opts.push({
					type: "property",
					key: "xProperty",
					displayName: "X axis / category (bars & slices)",
					description:
						"Property used for the X axis or categories (for pie, this is the slice).",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") === "gantt",
				} as any);

				// Label específico do Gantt (opcional – se vazio usa título da nota)
				opts.push({
					type: "property",
					key: "ganttLabelProperty",
					displayName: "Task label (Gantt)",
					description:
						"Label for each task bar. If empty, uses the note title.",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") !== "gantt",
				} as any);

				// Y (valor numérico). Em branco = count.
				opts.push({
					type: "property",
					key: "yProperty",
					displayName: "Y value (empty = count)",
					description:
						"Numeric property summed on the Y axis. Leave empty to just count notes.",
					shouldHide: (config: any) => {
						const t = String(config.get("chartType") ?? "bar");
						return t === "pie" || t === "gantt";
					},
				} as any);

				// Série / cor
				opts.push({
					type: "property",
					key: "seriesProperty",
					displayName: "Series / color (optional)",
					description:
						"Property that defines series / color for bars, lines and area.",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") === "pie",
				} as any);

				// Bucketing de datas no eixo X (só linha / área)
				opts.push({
					type: "dropdown",
					key: "xBucket",
					displayName: "X bucket (dates)",
					description:
						"How to bucket dates on the X axis for line / area charts (day, week, month...).",
					default: "auto",
					options: {
						auto: "Auto",
						none: "None",
						day: "Day",
						week: "Week",
						month: "Month",
						quarter: "Quarter",
						year: "Year",
					} as Record<string, string>,
					shouldHide: (config: any) => {
						const t = String(config.get("chartType") ?? "bar");
						return !(t === "line" || t === "area");
					},
				} as any);

				// Agregação do Y
				opts.push({
					type: "dropdown",
					key: "aggregateMode",
					displayName: "Value aggregation (Y)",
					description:
						"How to aggregate Y values with the same X / series.",
					default: "sum",
					options: {
						sum: "Sum",
						count: "Count (ignore Y)",
						"cumulative-sum": "Cumulative sum (line/area only)",
					} as Record<string, string>,
					shouldHide: (config: any) => {
						const t = String(config.get("chartType") ?? "bar");
						return t === "pie" || t === "scatter" || t === "gantt";
					},
				} as any);

				// --------- opções específicas do Gantt ---------

				opts.push({
					type: "property",
					key: "startProperty",
					displayName: "Start (Gantt)",
					description: "Start date/datetime for the task.",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") !== "gantt",
				} as any);

				opts.push({
					type: "property",
					key: "endProperty",
					displayName: "End (Gantt)",
					description: "End date/datetime for the task.",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") !== "gantt",
				} as any);

				opts.push({
					type: "property",
					key: "dueProperty",
					displayName: "Due (deadline, optional)",
					description: "Due date / deadline for the task.",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") !== "gantt",
				} as any);

				opts.push({
					type: "property",
					key: "durationProperty",
					displayName: "Duration in minutes (optional)",
					description:
						"Duration of the task in minutes. Used together with start/end/due.",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") !== "gantt",
				} as any);

				// Group property (não usado pelo Gantt – que usa o agrupamento nativo do Bases)
				opts.push({
					type: "property",
					key: "groupProperty",
					displayName: "Group property",
					description:
						"Property to group bars or series. Gantt uses Bases built-in grouping instead.",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") === "gantt",
				} as any);

				// Drilldown
				opts.push({
					type: "toggle",
					key: "drilldown",
					displayName: "Drilldown (click opens notes)",
					default: true,
				} as any);

				// Título
				opts.push({
					type: "text",
					key: "title",
					displayName: "Title (optional)",
					description: "Custom chart title. Falls back to the view name.",
				} as any);

				return opts as any;
			},
		});
	}

	onunload() {
		console.log("Chart Notes: unloading plugin");
	}
}

