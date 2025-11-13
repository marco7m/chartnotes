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
					} as Record<string, string>,
				} as any);

				// X / category (used in all charts except Gantt)
				opts.push({
					type: "property",
					key: "xProperty",
					displayName: "X axis / category (bars & slices)",
					description:
						"Property used for the X axis or categories (for pie, this is the slice).",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") === "gantt",
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
						return chartType === "pie" || chartType === "gantt";
					},
				} as any);

				// Series / color
				opts.push({
					type: "property",
					key: "seriesProperty",
					displayName: "Series / color (optional)",
					description:
						"Property that defines series / color for bars, lines and stacked area.",
					shouldHide: (config: any) =>
						String(config.get("chartType") ?? "bar") === "pie",
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
						return chartType === "scatter" || chartType === "gantt" || chartType === "stacked-bar";
					},
				} as any);

				// Date bucketing on X axis (line / area only)
				opts.push({
					type: "dropdown",
					key: "xBucket",
					displayName: "X bucket (dates)",
					description:
						"How to bucket dates on the X axis for line / stacked area charts (day, week, month...).",
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
						const chartType = String(config.get("chartType") ?? "bar");
						return !(chartType === "line" || chartType === "stacked-area");
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
				} as any);

				// Título
				opts.push({
					type: "text",
					key: "title",
					displayName: "Title (optional)",
					description: "Custom chart title.\nFalls back to the view name.",
				} as any);

				return opts as any;
			},
		});
	}

	onunload() {
		console.log("Chart Notes: unloading plugin");
	}
}

