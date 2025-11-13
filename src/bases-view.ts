/**
 * Bases View Integration
 * 
 * Integrates Chart Notes as a layout option in Obsidian Bases.
 * Handles data transformation from Bases format to chart-ready format.
 */

import {
	BasesView,
	type QueryController,
	parsePropertyId,
} from "obsidian";
import type { ChartSpec, QueryResult, QueryResultRow } from "./types";
import type { PropChartsRenderer, RenderContext } from "./renderer";
import { toDate } from "./utils";

// ============================================================================
// Constants
// ============================================================================

export const CHARTNOTES_BASES_VIEW_TYPE = "chartnotes-view";

const CHART_TYPES = [
	"bar",
	"stacked-bar",
	"line",
	"stacked-area",
	"pie",
	"scatter",
	"gantt",
	"metric",
] as const;

const AGGREGATION_MODES = ["sum", "count", "cumulative-sum"] as const;

const X_BUCKETS = ["auto", "none", "day", "week", "month", "quarter", "year"] as const;

const MISSING_LABEL = "(missing)";
const NO_SERIES_KEY = "__no_series__";
const DEFAULT_BLOCK_MINUTES = 60;
const MILLISECONDS_PER_MINUTE = 60000;

// ============================================================================
// Types
// ============================================================================

type AllowedChartType = (typeof CHART_TYPES)[number];
type AggregationMode = (typeof AGGREGATION_MODES)[number];
type XBucket = (typeof X_BUCKETS)[number];

interface SelectedProp {
	id: string | null;
	name: string | null;
}

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalizes chart type from user input to allowed type.
 */
function normalizeChartType(raw: unknown): AllowedChartType {
	const type = String(raw ?? "bar").trim().toLowerCase();
	return (CHART_TYPES.includes(type as AllowedChartType)
		? type
		: "bar") as AllowedChartType;
}

/**
 * Normalizes aggregation mode from user input to allowed mode.
 */
function normalizeAggregationMode(raw: unknown): AggregationMode {
	const mode = String(raw ?? "sum").trim().toLowerCase();
	return (AGGREGATION_MODES.includes(mode as AggregationMode)
		? mode
		: "sum") as AggregationMode;
}


export class ChartNotesBasesView extends BasesView {
	readonly type = CHARTNOTES_BASES_VIEW_TYPE;

	private rootEl: HTMLElement;
	private renderer: PropChartsRenderer;

	constructor(
		controller: QueryController,
		containerEl: HTMLElement,
		renderer: PropChartsRenderer,
	) {
		super(controller);
		this.renderer = renderer;
		this.rootEl = containerEl.createDiv("chartnotes-bases-view");
	}

	public onDataUpdated(): void {
		this.rootEl.empty();

		const data: any = (this as any).data;
		const grouped = (data?.groupedData ?? []) as any[];

		if (!grouped.length) {
			this.rootEl.createDiv({
				cls: "prop-charts-empty",
				text: "No data in this view.",
			});
			return;
		}

		const cfg: any = (this as any).config;

		const chartType = normalizeChartType(cfg?.get("chartType") ?? "bar");
		const isPie = chartType === "pie";
		const isScatter = chartType === "scatter";
		const isGantt = chartType === "gantt";
		const isMetric = chartType === "metric";

		const aggModeCfg = normalizeAggregationMode(cfg?.get("aggregateMode"));
		const allowCumulative = chartType === "line" || chartType === "stacked-area";
		const aggMode: AggregationMode =
			aggModeCfg === "cumulative-sum" && !allowCumulative ? "sum" : aggModeCfg;

		// Always use "auto" for date bucketing (equivalent to automatic date grouping)
		const xBucket: XBucket = isPie || isScatter || isGantt ? "none" : "auto";

		const xProp = this.getPropFromConfig("xProperty");
		const ganttLabelProp = this.getPropFromConfig("ganttLabelProperty");
		const yProp = this.getPropFromConfig("yProperty");
		let seriesProp = this.getPropFromConfig("seriesProperty");
		if (isPie) {
			// Pie charts never use series: always aggregate by category only
			seriesProp = { id: null, name: null };
		}
		const startProp = this.getPropFromConfig("startProperty");
		const endProp = this.getPropFromConfig("endProperty");
		const dueProp = this.getPropFromConfig("dueProperty");
		const durationProp = this.getPropFromConfig("durationProperty");
		const groupProp = this.getPropFromConfig("groupProperty");

		if (!isGantt && !isMetric && !xProp.id) {
			this.rootEl.createDiv({
				cls: "prop-charts-empty",
				text: "Configure the 'X axis / category' property in view options.",
			});
			return;
		}

		if (isScatter && (!xProp.id || !yProp.id)) {
			this.rootEl.createDiv({
				cls: "prop-charts-empty",
				text: "Scatter plots need both X and Y numeric properties.",
			});
			return;
		}

		if (isGantt && !(startProp.id || endProp.id || dueProp.id)) {
			this.rootEl.createDiv({
				cls: "prop-charts-empty",
				text: "Gantt needs Start/End or Due with Duration.",
			});
			return;
		}

		// For Gantt, label comes from a dedicated property if it exists;
		// otherwise falls back to the default X property
		const labelPropForGantt: SelectedProp =
			isGantt && ganttLabelProp.id
				? ganttLabelProp
				: isGantt
					? xProp
					: { id: null, name: null };

		let rows: QueryResultRow[];

		if (isMetric) {
			const metricProp = this.getPropFromConfig("metricProperty");
			const metricOp = String(cfg?.get("metricOperation") ?? "count");
			const metricDataType = String(cfg?.get("metricDataType") ?? "auto");
			rows = this.buildRowsForMetric(
				grouped,
				metricProp,
				metricOp,
				metricDataType,
			);
		} else if (isGantt) {
			rows = this.buildRowsForGantt(
				grouped,
				labelPropForGantt,
				seriesProp,
				startProp,
				endProp,
				dueProp,
				durationProp,
				groupProp,
			);
		} else if (isScatter) {
			rows = this.buildRowsForScatter(grouped, xProp, yProp, seriesProp);
		} else {
			const forceCountForPie = isPie;
			rows = this.buildRowsForAggregatedCharts(
				grouped,
				xProp,
				yProp,
				seriesProp,
				aggMode,
				xBucket,
				forceCountForPie,
			);
		}

		if (!rows.length) {
			this.rootEl.createDiv({
				cls: "prop-charts-empty",
				text: "No rows to display (check X/Y/aggregation).",
			});
			return;
		}

		const result: QueryResult = { rows };

		const titleRaw = (cfg?.get("title") as string | undefined) ?? "";
		const title = titleRaw.trim() || cfg?.name || "Chart Notes (Bases)";

		const drilldownCfg = cfg?.get("drilldown");
		const drilldown = typeof drilldownCfg === "boolean" ? drilldownCfg : true;

		const encoding = this.buildEncoding({
			x: xProp,
			y: yProp,
			series: seriesProp,
			start: startProp,
			end: endProp,
			due: dueProp,
			duration: durationProp,
			group: groupProp,
			label: labelPropForGantt,
			aggMode,
			chartType,
		});

		// Build options object with metric-specific configuration
		const options: any = {
			title,
			drilldown,
		};

		if (isMetric) {
			options.metricLabel = (cfg?.get("metricLabel") as string | undefined) ?? "";
			options.metricLabelPosition = (cfg?.get("metricLabelPosition") as string | undefined) ?? "above";
			options.metricDecimals = (cfg?.get("metricDecimals") as string | undefined) ?? "0";
			options.metricPrefix = (cfg?.get("metricPrefix") as string | undefined) ?? "";
			options.metricSuffix = (cfg?.get("metricSuffix") as string | undefined) ?? "";
			options.metricColor = (cfg?.get("metricColor") as string | undefined) ?? "auto";
		}

		const spec: ChartSpec = {
			type: chartType as any,
			source: { type: "properties", query: "" } as any,
			encoding: encoding as any,
			options,
		};

		const ctx: RenderContext = {
			refresh: () => this.onDataUpdated(),
		};

		this.renderer.render(this.rootEl, spec, result, ctx);
	}

	// ============================================================================
	// Property and Value Helpers
	// ============================================================================

	private getPropFromConfig(key: string): SelectedProp {
		const cfg: any = (this as any).config;
		const raw = cfg?.get?.(key) as string | undefined;
		if (!raw) return { id: null, name: null };

		const trimmed = raw.trim();
		if (!trimmed || trimmed === "undefined" || trimmed === "null") {
			return { id: null, name: null };
		}

		const id = trimmed;
		try {
			const parsed = parsePropertyId(
				id as `note.${string}` | `file.${string}`,
			);
			return { id, name: (parsed as any).name ?? id };
		} catch {
			return { id, name: id };
		}
	}

	private readValue(entry: any, prop: SelectedProp): string | null {
		if (!prop.id) return null;

		let value: any;
		try {
			value = entry.getValue(prop.id);
		} catch {
			return null;
		}

		if (!value) return null;

		try {
			if (typeof value.isEmpty === "function" && value.isEmpty()) {
				return null;
			}
		} catch {}

		try {
			const s = value.toString();
			if (s == null) return null;
			const trimmed = String(s).trim();
			return trimmed.length ? trimmed : null;
		} catch {
			return null;
		}
	}

	private parseDate(raw: string | null): Date | null {
		if (!raw) return null;
		const d = new Date(raw.trim());
		return Number.isNaN(d.getTime()) ? null : d;
	}

	private compareX(a: any, b: any): number {
		const da = this.parseDate(a != null ? String(a) : null);
		const db = this.parseDate(b != null ? String(b) : null);
		if (da && db) return da.getTime() - db.getTime();

		const na = Number(a);
		const nb = Number(b);
		if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;

		return String(a ?? "").localeCompare(String(b ?? ""));
	}

	// ============================================================================
	// Date Bucketing Functions
	// ============================================================================

	/**
	 * Formats a date as YYYY-MM-DD string
	 */
	private fmtDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	/**
	 * Gets the start of the week (Monday as first day)
	 */
	private startOfWeek(date: Date): Date {
		const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const dayOfWeek = (result.getDay() + 6) % 7; // Monday as start (0 = Monday)
		result.setDate(result.getDate() - dayOfWeek);
		result.setHours(0, 0, 0, 0);
		return result;
	}

	private bucketX(rawX: string, mode: XBucket): string {
		const d = this.parseDate(rawX);
		if (!d) return rawX;

		switch (mode) {
			case "none":
				return rawX;
			case "auto":
			case "day": {
				const s = this.fmtDate(
					new Date(d.getFullYear(), d.getMonth(), d.getDate()),
				);
				return s;
			}
			case "week": {
				const s = this.startOfWeek(d);
				return `${this.fmtDate(s)} (W)`;
			}
			case "month": {
				const m = String(d.getMonth() + 1).padStart(2, "0");
				return `${d.getFullYear()}-${m}`;
			}
			case "quarter": {
				const q = Math.floor(d.getMonth() / 3) + 1;
				return `${d.getFullYear()}-Q${q}`;
			}
			case "year":
				return `${d.getFullYear()}`;
			default:
				return rawX;
		}
	}

	// ============================================================================
	// Multi-Value X Handling (used for Pie / tags)
	// ============================================================================

	/**
	 * Extracts X values from an entry, handling multi-value cases (tags, lists, etc.)
	 * 
	 * @param entry - Base entry to extract values from
	 * @param xProp - X property configuration
	 * @param xBucket - Date bucketing mode
	 * @param multi - Whether to explode multi-values (true for pie charts)
	 * @returns Array of X values (may be multiple for tags/lists)
	 */
	private getXValuesForEntry(
		entry: any,
		xProp: SelectedProp,
		xBucket: XBucket,
		multi: boolean,
	): string[] {
		const values: string[] = [];

		const applyBucket = (value: string) => this.bucketX(value, xBucket);

		// If no X property defined, use file name/path
		if (!xProp.id) {
			const file = entry.file;
			const raw = file?.name
				? String(file.name)
				: String(file?.path ?? MISSING_LABEL);
			values.push(applyBucket(raw));
			return values;
		}

		// Simple case: don't explode multi-values (bars/lines/etc.)
		if (!multi) {
			const value = this.readValue(entry, xProp) ?? MISSING_LABEL;
			values.push(applyBucket(value));
			return values;
		}

		// multi = true → try to explode multi-value (tags, lists, etc.)
		let raw: any = null;
		try {
			raw = entry.getValue(xProp.id);
		} catch {
			raw = null;
		}

		const pushStr = (s: string | null | undefined) => {
			if (!s) return;
			const trimmed = String(s).trim();
			if (!trimmed) return;
			values.push(applyBucket(trimmed));
		};

		if (raw == null) {
			pushStr(MISSING_LABEL);
		} else if (typeof raw === "string") {
			// Heuristic for multi-tag/string values: "#tag1 #tag2 ..."
			const trimmed = raw.trim();
			if (trimmed) {
				const parts = trimmed.split(/\s+/);
				for (const part of parts) {
					pushStr(part);
				}
			}
		} else if (Array.isArray(raw)) {
			for (const item of raw) {
				if (item == null) continue;
				let s: string;
				try {
					s = item.toString();
				} catch {
					continue;
				}
				pushStr(s);
			}
		} else if (typeof (raw as any).toArray === "function") {
			const arr = (raw as any).toArray();
			if (Array.isArray(arr)) {
				for (const item of arr) {
					if (item == null) continue;
					let s: string;
					try {
						s = item.toString();
					} catch {
						continue;
					}
					pushStr(s);
				}
			} else {
				let s: string;
				try {
					s = (raw as any).toString();
				} catch {
					s = "";
				}
				pushStr(s);
			}
		} else {
			let s: string;
			try {
				s = (raw as any).toString();
			} catch {
				s = "";
			}
			pushStr(s);
		}

		if (!values.length) {
			pushStr(MISSING_LABEL);
		}

		return values;
	}

	// ============================================================================
	// Row Builders
	// ============================================================================

	private buildRowsForAggregatedCharts(
		groups: any[],
		xProp: SelectedProp,
		yProp: SelectedProp,
		seriesProp: SelectedProp,
		aggMode: AggregationMode,
		xBucket: XBucket,
		forceCount: boolean,
	): QueryResultRow[] {
		const byKey = new Map<string, QueryResultRow>();

		const treatAsCount =
			forceCount ||
			aggMode === "count" ||
			(!yProp.id && aggMode !== "sum");

		const yPropName = yProp.name || "y";

		for (const group of groups) {
			for (const entry of group.entries as any[]) {
				const file = entry.file;

				const xValues = this.getXValuesForEntry(
					entry,
					xProp,
					xBucket,
					forceCount,
				);

				let baseYNum = 1;
				let yStr: string | null = null;

				if (!treatAsCount && yProp.id) {
					yStr = this.readValue(entry, yProp);
					if (yStr == null) continue;
					const n = Number(yStr);
					if (Number.isNaN(n)) continue;
					baseYNum = n;
				} else {
					baseYNum = 1;
				}

				const seriesStr = this.readValue(entry, seriesProp);
				const series = seriesStr != null ? String(seriesStr) : undefined;

				for (const xStr of xValues) {
					const key = `${xStr}@@${series ?? ""}`;
					let row = byKey.get(key);
					if (!row) {
						row = {
							x: xStr,
							y: 0,
							series,
							notes: [],
							props: {},
						} as QueryResultRow;
						byKey.set(key, row);
					}

					row.y += baseYNum;

					if (file?.path) row.notes!.push(file.path);

					if (row.props && xProp.name) {
						row.props[xProp.name] = xStr;
					}

					if (!treatAsCount && row.props && yPropName && yStr != null) {
						row.props[yPropName] = row.y;
					}

					if (treatAsCount && row.props) {
						row.props[yPropName] = row.y;
					}

					if (row.props && seriesProp.name && seriesStr != null) {
						row.props[seriesProp.name] = seriesStr;
					}
				}
			}
		}

		const rows = Array.from(byKey.values());

		if (aggMode === "cumulative-sum") {
			return this.toCumulative(rows);
		}

		return rows;
	}

	/**
	 * Applies cumulative sum transformation to rows, grouped by series.
	 * 
	 * @param rows - Rows to transform
	 * @returns Rows with cumulative Y values, globally sorted by X
	 */
	private toCumulative(rows: QueryResultRow[]): QueryResultRow[] {
		const bySeries = new Map<string, QueryResultRow[]>();

		// Group rows by series
		for (const row of rows) {
			const key = row.series ?? NO_SERIES_KEY;
			let list = bySeries.get(key);
			if (!list) {
				list = [];
				bySeries.set(key, list);
			}
			list.push(row);
		}

		const result: QueryResultRow[] = [];

		// Apply cumulative sum per series
		for (const [, list] of bySeries) {
			const sorted = [...list].sort((a, b) => this.compareX(a.x, b.x));
			let accumulator = 0;
			for (const row of sorted) {
				const yValue = Number(row.y ?? 0);
				if (Number.isNaN(yValue)) continue;
				accumulator += yValue;
				result.push({
					...row,
					y: accumulator,
				});
			}
		}

		// Re-sort globally by X to ensure consistent order
		result.sort((a, b) => this.compareX(a.x, b.x));

		return result;
	}

	/**
	 * Builds a single row for metric/indicator widget
	 * 
	 * @param groups - Grouped data from Bases
	 * @param metricProp - Property to measure (null = count notes)
	 * @param operation - Operation to perform (count, sum, avg, min, max, oldest, newest)
	 * @param dataTypeOverride - Data type override ("auto", "number", "date", "text")
	 * @returns Single QueryResultRow with calculated metric value
	 */
	private buildRowsForMetric(
		groups: any[],
		metricProp: SelectedProp,
		operation: string,
		dataTypeOverride: string,
	): QueryResultRow[] {
		const notes: string[] = [];
		const values: Array<{
			value: any;
			isNumber: boolean;
			isDate: boolean;
			parsedNumber: number | null;
			parsedDate: Date | null;
		}> = [];

		// Collect all entries and their values
		for (const group of groups) {
			for (const entry of group.entries as any[]) {
				const file = entry.file;
				if (file?.path) notes.push(file.path);

				if (!metricProp.id) {
					// No property = just count notes
					continue;
				}

				const rawValue = this.readValue(entry, metricProp);
				if (rawValue == null) continue;

				const trimmed = rawValue.trim();
				
				// Check if it looks like an ISO date first (YYYY-MM-DD)
				// This takes priority over number parsing
				const looksLikeDate = /^\d{4}-\d{2}-\d{2}/.test(trimmed);
				
				// Try to parse as date if it looks like a date format
				let isDate = false;
				let date: Date | null = null;
				if (looksLikeDate) {
					date = toDate(rawValue);
					isDate = date !== null;
				}
				
				// Try to parse as number
				// But don't treat pure digit strings as numbers if they're dates
				const num = Number(trimmed);
				const isNumber = !Number.isNaN(num) && Number.isFinite(num) && (!looksLikeDate || !isDate);

				values.push({
					value: rawValue,
					isNumber,
					isDate,
					parsedNumber: isNumber ? num : null,
					parsedDate: date,
				});
			}
		}

		// Determine data type
		let dataType: "number" | "date" | "text" = "text";
		if (dataTypeOverride !== "auto") {
			dataType = dataTypeOverride as "number" | "date" | "text";
		} else if (values.length > 0) {
			// Auto-detect: use voting strategy - count how many values are numbers vs dates
			// This is more robust than checking only the first value
			let numberCount = 0;
			let dateCount = 0;
			
			for (const v of values) {
				if (v.isNumber) numberCount++;
				if (v.isDate) dateCount++;
			}
			
			// If majority are numbers, treat as number
			// If majority are dates, treat as date
			// Otherwise, default to text
			if (numberCount > dateCount && numberCount > 0) {
				dataType = "number";
			} else if (dateCount > numberCount && dateCount > 0) {
				dataType = "date";
			} else if (numberCount > 0) {
				// If we have any numbers but dates are equal or less, prefer number
				dataType = "number";
			} else if (dateCount > 0) {
				// If we have any dates but no numbers, use date
				dataType = "date";
			}
		}

		// Calculate result based on operation
		let resultValue: number | Date | string = 0;
		let errorMessage: string | null = null;

		if (!metricProp.id) {
			// No property = count notes
			resultValue = notes.length;
		} else if (operation === "count" || operation === "count-value" || operation === "count-date") {
			// Count operations
			resultValue = values.length;
		} else if (dataType === "number") {
			// Numeric operations
			const numbers = values
				.map((v) => v.parsedNumber)
				.filter((n): n is number => n !== null);

			if (numbers.length === 0) {
				resultValue = 0;
			} else {
				switch (operation) {
					case "sum":
						resultValue = numbers.reduce((a, b) => a + b, 0);
						break;
					case "avg":
						resultValue = numbers.reduce((a, b) => a + b, 0) / numbers.length;
						break;
					case "min":
						resultValue = Math.min(...numbers);
						break;
					case "max":
						resultValue = Math.max(...numbers);
						break;
					default:
						errorMessage = "Operation incompatible with data type";
						resultValue = 0;
				}
			}
		} else if (dataType === "date") {
			// Date operations
			const dates = values
				.map((v) => v.parsedDate)
				.filter((d): d is Date => d !== null);

			if (dates.length === 0) {
				resultValue = 0;
			} else {
				switch (operation) {
					case "oldest":
						resultValue = new Date(Math.min(...dates.map((d) => d.getTime())));
						break;
					case "newest":
						resultValue = new Date(Math.max(...dates.map((d) => d.getTime())));
						break;
					default:
						errorMessage = "Operation incompatible with data type";
						resultValue = 0;
				}
			}
		} else {
			// Text type - only count is valid
			if (operation !== "count" && operation !== "count-value") {
				errorMessage = "Operation incompatible with data type";
			}
			resultValue = values.length;
		}

		// Return single row
		return [
			{
				x: resultValue instanceof Date ? resultValue.toISOString().slice(0, 10) : String(resultValue),
				y: resultValue instanceof Date ? resultValue.getTime() : (typeof resultValue === "number" ? resultValue : 0),
				notes,
				props: {
					_metricValue: resultValue,
					_metricError: errorMessage,
					_metricDataType: dataType,
					_metricOperation: operation,
				},
			} as QueryResultRow,
		];
	}

	private buildRowsForScatter(
		groups: any[],
		xProp: SelectedProp,
		yProp: SelectedProp,
		seriesProp: SelectedProp,
	): QueryResultRow[] {
		const rows: QueryResultRow[] = [];

		for (const group of groups) {
			for (const entry of group.entries as any[]) {
				const file = entry.file;

				const xStr = this.readValue(entry, xProp);
				const yStr = this.readValue(entry, yProp);
				if (xStr == null || yStr == null) continue;

				const xNum = Number(xStr);
				const yNum = Number(yStr);
				if (Number.isNaN(xNum) || Number.isNaN(yNum)) continue;

				const seriesStr = this.readValue(entry, seriesProp);
				const series = seriesStr != null ? String(seriesStr) : undefined;

				rows.push({
					x: xNum,
					y: yNum,
					series,
					notes: file?.path ? [file.path] : [],
					props: {},
				} as QueryResultRow);
			}
		}

		return rows;
	}

	// ============================================================================
	// Gantt Chart Row Builder
	// ============================================================================

	/**
	 * Builds rows for Gantt chart from grouped Base entries.
	 * Handles date logic: start/end/due/duration combinations.
	 */
	private buildRowsForGantt(
		groups: any[],
		labelPropFromCall: SelectedProp,
		seriesProp: SelectedProp,
		startProp: SelectedProp,
		endProp: SelectedProp,
		dueProp: SelectedProp,
		durationProp: SelectedProp,
		groupProp: SelectedProp, // Compatibility with old views
	): QueryResultRow[] {
		const rows: QueryResultRow[] = [];

		const DEFAULT_BLOCK_MS = DEFAULT_BLOCK_MINUTES * MILLISECONDS_PER_MINUTE;

		/**
		 * Extracts group name from various possible properties
		 */
		const groupNameOf = (group: any): string => {
			const candidates = [
				group?.label,
				group?.name,
				group?.value,
				group?.key,
				group?.group,
				group?.groupLabel,
			];
			for (const candidate of candidates) {
				if (candidate != null && String(candidate).trim() !== "") {
					return String(candidate);
				}
			}
			// No grouping in Bases
			return "";
		};

		// Task label configured in view (ganttLabelProperty) has priority
		let labelProp: SelectedProp = labelPropFromCall;
		try {
			const ganttLabel = this.getPropFromConfig("ganttLabelProperty");
			if (ganttLabel && ganttLabel.id) {
				labelProp = ganttLabel;
			}
		} catch {
			// Ignore and continue with labelPropFromCall
		}

		const hasManualGroupProp = !!groupProp.id;

		for (const group of groups) {
			const groupName = groupNameOf(group); // "" when Bases doesn't group

			for (const entry of (group.entries ?? []) as any[]) {
				const file = entry.file;

				const startStr = this.readValue(entry, startProp);
				const endStr = this.readValue(entry, endProp);
				const dueStr = this.readValue(entry, dueProp);
				const durationStr = this.readValue(entry, durationProp);

				const durationMinutes = durationStr != null ? Number(durationStr) : NaN;
				const hasDuration =
					Number.isFinite(durationMinutes) && durationMinutes > 0;
				const durationMs = hasDuration
					? durationMinutes * MILLISECONDS_PER_MINUTE
					: DEFAULT_BLOCK_MS;

				const explicitStart = this.parseDate(startStr);
				const explicitEnd = this.parseDate(endStr);
				const due = this.parseDate(dueStr);

				let start = explicitStart;
				let end = explicitEnd;

				// Date logic: try to build a valid start/end interval
				// 1) If both start and end exist, use them as-is

				// 2) Only start → use duration forward (or default block)
				if (start && !end) {
					end = new Date(start.getTime() + durationMs);
				}

				// 3) Only end → use duration backward (or default block)
				if (!start && end) {
					start = new Date(end.getTime() - durationMs);
				}

				// 4) No start or end, but has due date
				if (!start && !end && due) {
					if (hasDuration) {
						end = due;
						start = new Date(due.getTime() - durationMs);
					} else {
						// No duration → short block around due date
						start = due;
						end = new Date(due.getTime() + DEFAULT_BLOCK_MS);
					}
				}

				// Still couldn't build interval? Skip this note in Gantt
				if (!start || !end) continue;

				// Ensure start <= end
				if (start.getTime() > end.getTime()) {
					const temp = start;
					start = end;
					end = temp;
				}

				// Label
				let label = this.readValue(entry, labelProp);

				if (label == null || String(label).trim() === "") {
					if (file?.name) {
						label = String(file.name).replace(/\.md$/i, "");
					} else if (file?.path) {
						label = String(file.path);
					} else {
						label = "(no title)";
					}
				}

				// Series (colors / legend)
				const seriesValue = this.readValue(entry, seriesProp);
				const series = seriesValue != null ? String(seriesValue) : undefined;

				const props: Record<string, any> = {};

				// Grouping from Bases
				if (groupName) {
					props["__basesGroup"] = groupName;
				}

				// Compatibility with old Group property (if still configured)
				if (hasManualGroupProp) {
					const groupValue = this.readValue(entry, groupProp);
					if (groupValue != null && groupProp.name) {
						props[groupProp.name] = groupValue;
					}
				}

				if (labelProp.name) props[labelProp.name] = label;
				props["label"] = label;

				if (startProp.name && startStr != null) props[startProp.name] = startStr;
				if (endProp.name && endStr != null) props[endProp.name] = endStr;
				if (dueProp.name && dueStr != null) props[dueProp.name] = dueStr;
				if (hasDuration && durationProp.name)
					props[durationProp.name] = durationMinutes;

				const notePath = file?.path;

				rows.push({
					x: label,
					y: 0, // Gantt doesn't use Y, but type requires it
					series,
					start,
					end,
					due: due ?? undefined,
					notes: notePath ? [notePath] : [],
					props,
				});
			}
		}

		// Sort by start date (makes it more predictable)
		rows.sort((a, b) => {
			if (!a.start || !b.start) return 0;
			return a.start.getTime() - b.start.getTime();
		});

		return rows;
	}

	private buildEncoding(fields: {
		x: SelectedProp;
		y: SelectedProp;
		series: SelectedProp;
		start: SelectedProp;
		end: SelectedProp;
		due: SelectedProp;
		duration: SelectedProp;
		group: SelectedProp;
		label: SelectedProp;
		aggMode: AggregationMode;
		chartType: AllowedChartType;
	}): any {
		// IMPORTANT: x/y here are property names,
		// not pretty labels. The renderer uses these to look up
		// fields in the data. Human-readable labels are handled by the renderer.
		const xKey = fields.x.name ?? "x";
		const yKey = fields.y.name ?? "y";
		const labelKey =
			fields.label.name ?? fields.x.name ?? fields.group.name ?? "label";

		const groupKeyName =
			fields.chartType === "gantt"
				? "__basesGroup" // Use native Bases grouping
				: fields.group.name ?? "group";

		return {
			x: xKey,
			y: yKey,
			series: fields.series.name ?? "series",
			start: fields.start.name ?? "start",
			end: fields.end.name ?? "end",
			due: fields.due.name ?? "due",
			duration: fields.duration.name ?? "duration",
			group: groupKeyName,
			label: labelKey,
		};
	}
}

