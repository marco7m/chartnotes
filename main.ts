/**
 * Chart Notes Plugin
 * 
 * Main plugin entry point. Integrates with Obsidian Bases to provide
 * chart visualization capabilities from note properties.
 */

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

		// Indexer
		this.indexer = new PropChartsIndexer(this.app);
		await this.indexer.buildIndex();

		this.query = new PropChartsQueryEngine(
			() => this.indexer.getAll(),
			[],
		);

		// Shared renderer (Bases-only now)
		this.renderer = new PropChartsRenderer();

		// Incremental index updates
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

		// =================================================================
		// Bases View Registration (Obsidian 1.10+)
		// =================================================================
		this.registerBasesView(CHARTNOTES_BASES_VIEW_TYPE, {
			name: "Chart Notes",
			icon: "lucide-chart-area",
			factory: (controller, containerEl) =>
				new ChartNotesBasesView(controller, containerEl, this.renderer),
			options: () => {
				const opts: any[] = [];

				// Chart type
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
						"stacked-area": "Stacked area",
						pie: "Pie",
						scatter: "Scatter",
						gantt: "Gantt",
						metric: "Indicator",
					} as Record<string, string>,
				} as any);

				// X / category (used in all charts except Gantt)
				opts.push({
					type: "property",
					key: "xProperty",
					displayName: "X axis / category (bars & slices)",
					description:
						"Property used for the X axis or categories (for pie, this is the slice).",
					shouldHide: (config: any) => {
						const chartType = String(config.get("chartType") ?? "bar");
						return chartType === "gantt" || chartType === "metric";
					},
				} as any);

				// Gantt-specific label (optional – if empty uses note title)
				opts.push({
					type: "property",
					key: "ganttLabelProperty",
					displayName: "Task label (Gantt)",
					description:
						"Label for each task bar.\nIf empty, uses the note title.",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") !== "gantt",
				} as any);

				// Y (numeric value). Empty = count
				opts.push({
					type: "property",
					key: "yProperty",
					displayName: "Y value (empty = count)",
					description:
						"Numeric property summed on the Y axis.\nLeave empty to just count notes.",
					shouldHide: (config: any) => {
						const chartType = String(config.get("chartType") ?? "bar");
						return chartType === "pie" || chartType === "gantt" || chartType === "metric";
					},
				} as any);

				// Series / color
				opts.push({
					type: "property",
					key: "seriesProperty",
					displayName: "Series / color (optional)",
					description:
						"Property that defines series / color for bars, lines and stacked area.",
					shouldHide: (config: any) => {
						const chartType = String(config.get("chartType") ?? "bar");
						return chartType === "pie" || chartType === "metric";
					},
				} as any);

				// Value aggregation (Y) – how to combine multiple notes with same X/series
				opts.push({
					type: "dropdown",
					key: "aggregateMode", // Correct key, matches bases-view.ts
					displayName: "Value aggregation (Y)",
					description:
						"How to aggregate Y when multiple notes share the same X/series.\n" +
						"For line/stacked-area, 'Cumulative sum' turns the series into a running total.",
					default: "sum",
					options: {
						sum: "Sum",
						count: "Count (ignore Y)",
						"cumulative-sum": "Cumulative sum",
					} as Record<string, string>,
					shouldHide: (config: any) => {
						const chartType = String(config.get("chartType") ?? "bar");
						// Doesn't make sense for scatter and gantt, which are row-by-row
						// Stacked-bar always uses sum aggregation
						// Metric has its own operation selector
						return chartType === "scatter" || chartType === "gantt" || chartType === "stacked-bar" || chartType === "metric";
					},
				} as any);

				// Gantt-specific options
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
					"Duration of the task in minutes.\nUsed together with start/end/due.",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") !== "gantt",
				} as any);

				// Drilldown
				opts.push({
					type: "toggle",
					key: "drilldown",
					displayName: "Drilldown (click opens notes)",
					default: true,
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") === "metric",
				} as any);

				// Título
				opts.push({
					type: "text",
					key: "title",
					displayName: "Title (optional)",
					description: "Custom chart title.\nFalls back to the view name.",
				} as any);

				// =================================================================
				// Metric/Indicator Widget Configuration
				// =================================================================

				// Section 1: What to Measure
				opts.push({
					type: "property",
					key: "metricProperty",
					displayName: "Property",
					description:
						"Property to measure.\nLeave empty to count all notes in this view.",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") !== "metric",
				} as any);

				// Section 2: Data Type (shown before How to Calculate)
				opts.push({
					type: "dropdown",
					key: "metricDataType",
					displayName: "Data type",
					description:
						"Type of data in the property.",
					default: "number",
					options: {
						number: "Number",
						date: "Date",
						text: "Text/Other (count only)",
					} as Record<string, string>,
					shouldHide: (config: any) => {
						const chartType = String(config.get("chartType") ?? "bar");
						if (chartType !== "metric") return true;
						// Hide when property is empty
						const metricProperty = config.get("metricProperty") as string | undefined;
						return !metricProperty || metricProperty.trim() === "" || metricProperty === "undefined" || metricProperty === "null";
					},
				} as any);

				// Section 2: How to Calculate (for Number type only)
				opts.push({
					type: "dropdown",
					key: "metricOperation",
					displayName: "How to calculate",
					description:
						"Operation to perform on numeric values.",
					default: "countAll",
					options: {
						countAll: "Count all notes",
						countNonEmpty: "Count notes where property is set",
						sum: "Sum of values",
						avg: "Average of values",
						min: "Smallest value",
						max: "Largest value",
					} as Record<string, string>,
					shouldHide: (config: any) => {
						const chartType = String(config.get("chartType") ?? "bar");
						if (chartType !== "metric") return true;
						const dataType = String(config.get("metricDataType") ?? "number");
						const metricProperty = config.get("metricProperty") as string | undefined;
						const hasProperty = metricProperty && metricProperty.trim() !== "" && metricProperty !== "undefined" && metricProperty !== "null";
						if (!hasProperty) return false; // Show if no property
						// Hide if date or text type is selected
						return dataType === "date" || dataType === "text";
					},
				} as any);

				// Text-specific operations (only shown when type is text)
				opts.push({
					type: "dropdown",
					key: "metricTextOperation",
					displayName: "How to calculate",
					description:
						"Operation to perform on text values.\n" +
						"Only count operations are available for text properties.",
					default: "countAll",
					options: {
						countAll: "Count all notes",
						countNonEmpty: "Count notes where property is set",
					} as Record<string, string>,
					shouldHide: (config: any) => {
						const chartType = String(config.get("chartType") ?? "bar");
						if (chartType !== "metric") return true;
						const metricProperty = config.get("metricProperty") as string | undefined;
						const hasProperty = metricProperty && metricProperty.trim() !== "" && metricProperty !== "undefined" && metricProperty !== "null";
						if (!hasProperty) return true;
						const dataType = String(config.get("metricDataType") ?? "number");
						// Show only if text type is selected
						return dataType !== "text";
					},
				} as any);

				// Date-specific operations (only shown when type is date)
				opts.push({
					type: "dropdown",
					key: "metricDateOperation",
					displayName: "Date operation",
					description:
						"Operation to perform on date values.\n" +
						"Only shown when data type is Date.",
					default: "countNonEmpty",
					options: {
						countAll: "Count all notes",
						countNonEmpty: "Count notes with date",
						oldest: "Oldest date",
						newest: "Newest date",
						dateRange: "Date range (newest - oldest)",
					} as Record<string, string>,
					shouldHide: (config: any) => {
						const chartType = String(config.get("chartType") ?? "bar");
						if (chartType !== "metric") return true;
						const metricProperty = config.get("metricProperty") as string | undefined;
						const hasProperty = metricProperty && metricProperty.trim() !== "" && metricProperty !== "undefined" && metricProperty !== "null";
						if (!hasProperty) return true;
						const dataType = String(config.get("metricDataType") ?? "number");
						// Show only if date type is selected
						return dataType !== "date";
					},
				} as any);

				// Section 3: How to Display
				opts.push({
					type: "text",
					key: "metricLabel",
					displayName: "Label",
					description: "Text to display with the number.\ne.g., Total tasks, Average duration",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") !== "metric",
				} as any);

				opts.push({
					type: "dropdown",
					key: "metricLabelPosition",
					displayName: "Label position",
					description: "Where to show the label relative to the number.",
					default: "above",
					options: {
						above: "Label above number",
						below: "Label below number",
					} as Record<string, string>,
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") !== "metric",
				} as any);

				opts.push({
					type: "dropdown",
					key: "metricDecimals",
					displayName: "Decimal places",
					description: "Number of decimal places to show.",
					default: "0",
					options: {
						"0": "0",
						"1": "1",
						"2": "2",
						"3": "3",
					} as Record<string, string>,
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") !== "metric",
				} as any);

				opts.push({
					type: "text",
					key: "metricPrefix",
					displayName: "Prefix (optional)",
					description: "Text to show before the number.\ne.g., R$, %, #",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") !== "metric",
				} as any);

				opts.push({
					type: "text",
					key: "metricSuffix",
					displayName: "Suffix (optional)",
					description: "Text to show after the number.\ne.g., h, days, units, %",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") !== "metric",
				} as any);

				opts.push({
					type: "dropdown",
					key: "metricColor",
					displayName: "Highlight color",
					description: "Color for the number display.",
					default: "auto",
					options: {
						auto: "Automatic (theme)",
						accent: "Accent color",
						green: "Green",
						red: "Red",
						blue: "Blue",
						orange: "Orange",
						purple: "Purple",
					} as Record<string, string>,
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") !== "metric",
				} as any);

				return opts as any;
			},
		});
	}

	onunload() {
		console.log("Chart Notes: unloading plugin");
	}
}

