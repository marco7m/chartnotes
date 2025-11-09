// main.ts
import {
	App,
	Plugin,
	PluginManifest,
	TFile,
	type ViewOption,
} from "obsidian";
import {
	CHARTNOTES_BASES_VIEW_TYPE,
	ChartNotesBasesView,
} from "./src/bases-view";
import { PropChartsIndexer } from "./src/indexer";
import { PropChartsQueryEngine } from "./src/query";
import { PropChartsRenderer } from "./src/renderer";

/**
 * Gera a lista de opções usadas pelo Bases para configurar o layout "Chart Notes".
 * Cada item é forçado para ViewOption via `as any` para não esbarrar nas frescuras
 * de inferência de união do TypeScript com os dropdowns.
 */
function buildChartNotesOptions(): ViewOption[] {
	const options: ViewOption[] = [
		// Tipo de gráfico
		{
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
			},
		} as any,

		// X / categoria (geral). Para Pie é a categoria das fatias.
		{
			type: "property",
			key: "xProperty",
			displayName: "X axis / category (bars & slices)",
			description:
				"Property used for the X axis or categories (for pie, this is the slice).",
		} as any,

		// Label específico do Gantt (se vazio, usa xProperty)
		{
			type: "property",
			key: "ganttLabelProperty",
			displayName: "Task label (Gantt)",
			description:
				"Label for each task bar. If empty, uses the X / category.",
			shouldHide: (config: any) =>
				String(config.get("chartType") ?? "bar") !== "gantt",
		} as any,

		// Y numérico (em branco = count). Não se aplica a Pie nem Gantt.
		{
			type: "property",
			key: "yProperty",
			displayName: "Y value (empty = count)",
			description:
				"Numeric property summed on the Y axis. Leave empty to just count notes.",
			shouldHide: (config: any) => {
				const t = String(config.get("chartType") ?? "bar");
				return t === "pie" || t === "gantt";
			},
		} as any,

		// Série / cor. Não se aplica a Pie.
		{
			type: "property",
			key: "seriesProperty",
			displayName: "Series / color (optional)",
			description:
				"Property that defines series / color for bars, lines and area.",
			shouldHide: (config: any) =>
				String(config.get("chartType") ?? "bar") === "pie",
		} as any,

		// Bucketing de datas do eixo X – só line/area.
		{
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
			},
			shouldHide: (config: any) => {
				const t = String(config.get("chartType") ?? "bar");
				return !(t === "line" || t === "area");
			},
		} as any,

		// Agregação do Y – não se aplica a pie/scatter/gantt.
		{
			type: "dropdown",
			key: "aggregateMode",
			displayName: "Value aggregation (Y)",
			description: "How to aggregate Y values with the same X / series.",
			default: "sum",
			options: {
				sum: "Sum",
				count: "Count (ignore Y)",
				"cumulative-sum": "Cumulative sum (line/area only)",
			},
			shouldHide: (config: any) => {
				const t = String(config.get("chartType") ?? "bar");
				return t === "pie" || t === "scatter" || t === "gantt";
			},
		} as any,

		// --------- campos específicos do Gantt ---------
		{
			type: "property",
			key: "startProperty",
			displayName: "Start (Gantt)",
			description: "Start date/datetime for the task.",
			shouldHide: (config: any) =>
				String(config.get("chartType") ?? "bar") !== "gantt",
		} as any,
		{
			type: "property",
			key: "endProperty",
			displayName: "End (Gantt)",
			description: "End date/datetime for the task.",
			shouldHide: (config: any) =>
				String(config.get("chartType") ?? "bar") !== "gantt",
		} as any,
		{
			type: "property",
			key: "dueProperty",
			displayName: "Due (deadline, optional)",
			description: "Due date / deadline for the task.",
			shouldHide: (config: any) =>
				String(config.get("chartType") ?? "bar") !== "gantt",
		} as any,
		{
			type: "property",
			key: "scheduledProperty",
			displayName: "Scheduled (optional)",
			description:
				"Scheduled date used for fallback when computing bars.",
			shouldHide: (config: any) =>
				String(config.get("chartType") ?? "bar") !== "gantt",
		} as any,
		{
			type: "property",
			key: "durationProperty",
			displayName: "Duration in minutes (optional)",
			description:
				"Duration of the task in minutes. Used together with start/scheduled/due.",
			shouldHide: (config: any) =>
				String(config.get("chartType") ?? "bar") !== "gantt",
		} as any,

		// *** SEM Group property aqui ***
		// Agrupamento do Gantt vem do próprio Bases (group-by), via __basesGroup.

		// Drilldown
		{
			type: "toggle",
			key: "drilldown",
			displayName: "Drilldown (click opens notes)",
			default: true,
		} as any,

		// Título
		{
			type: "text",
			key: "title",
			displayName: "Title (optional)",
			description:
				"Custom chart title. Falls back to the view name.",
		} as any,

		// Largura da coluna de labels do Gantt
		{
			type: "text",
			key: "labelWidth",
			displayName: "Gantt label column width",
			description:
				"Optional width for the left label column in the Gantt chart.",
			shouldHide: (config: any) =>
				String(config.get("chartType") ?? "bar") !== "gantt",
		} as any,
	];

	return options;
}

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

		// Renderer compartilhado
		this.renderer = new PropChartsRenderer();

		// Atualização incremental de índice
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

		// Bases view (Obsidian 1.10+)
		this.registerBasesView(CHARTNOTES_BASES_VIEW_TYPE, {
			name: "Chart Notes",
			icon: "lucide-chart-area",
			factory: (controller, containerEl) =>
				new ChartNotesBasesView(controller, containerEl, this.renderer),
			options: buildChartNotesOptions,
		});
	}

	onunload() {
		console.log("Chart Notes: unloading plugin");
	}
}

