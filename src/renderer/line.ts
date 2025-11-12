/**
 * Line and Stacked Area Chart Renderer
 * 
 * Renders line charts and stacked area charts with support for:
 * - Date-aware X-axis with proportional time spacing
 * - Multiple series with different colors
 * - Cumulative sum aggregation
 * - Interactive tooltips and drilldown
 */

import type { ChartSpec, QueryResult } from "../types";
import {
	ensureContainer,
	colorFor,
	showTooltip,
	hideTooltip,
	openDetails,
	DEFAULT_H,
	formatDateShort,
} from "./renderer-common";

// ============================================================================
// Types
// ============================================================================

interface ChartRow {
	x: any;
	y: number;
	series?: any;
	notes?: string[];
}

interface StackedPoint {
	x: any;
	seriesValues: Map<string, number>; // series -> value (may already be cumulative)
	stackedValues: Map<string, number>; // series -> base value for stacking
}

// ============================================================================
// Constants
// ============================================================================

const PADDING_LEFT = 40;
const PADDING_RIGHT = 16;
const PADDING_TOP = 18;
const PADDING_BOTTOM = 28;

const MIN_DATE_THRESHOLD = 0.6; // At least 60% of points must be valid dates
const MIN_DATES_REQUIRED = 2;

const DEFAULT_SERIES_KEY = "__default__";
const NO_SERIES_KEY = "__no_series__";

const DATE_TICK_CANDIDATES = [1, 2, 3, 5, 7, 10, 14, 21, 30, 60, 90, 180, 365];
const IDEAL_PIXELS_PER_TICK = 90;
const MIN_TICKS = 3;
const MAX_TICKS = 10;
const DOMAIN_PADDING = 0.02; // 2% padding on each side

const Y_TICKS_COUNT = 4;
const LARGE_NUMBER_THRESHOLD = 100;

const EMPTY_DATA_MESSAGE = "No data available.";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Attempts to parse a value as a Date.
 * - If already a valid Date → returns as-is
 * - If string in ISO format (YYYY-MM-DD) → attempts new Date()
 * - Otherwise → returns null
 * 
 * @param value - Value to parse as date
 * @returns Parsed Date or null if invalid
 */
function parseDateLike(value: any): Date | null {
	if (!value) return null;

	if (value instanceof Date) {
		const timestamp = value.getTime();
		return Number.isNaN(timestamp) ? null : value;
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return null;

		// Avoid treating pure numbers as timestamps by accident
		if (/^\d+$/.test(trimmed)) return null;

		const date = new Date(trimmed);
		if (!Number.isNaN(date.getTime())) return date;
	}

	return null;
}

/**
 * Groups rows by series key
 */
function groupBySeries(rows: ChartRow[]): Map<string, ChartRow[]> {
	const seriesMap = new Map<string, ChartRow[]>();

	for (const row of rows) {
		const key =
			row.series != null && row.series !== ""
				? String(row.series)
				: DEFAULT_SERIES_KEY;
		const arr = seriesMap.get(key) ?? [];
		arr.push(row);
		seriesMap.set(key, arr);
	}

	return seriesMap;
}

/**
 * Detects if X-axis should be treated as temporal (date-based)
 */
function detectDateAxis(rows: ChartRow[]): boolean {
	const parsedDates = rows
		.map((row) => parseDateLike(row.x))
		.filter((d): d is Date => !!d);

	return (
		parsedDates.length >= MIN_DATES_REQUIRED &&
		parsedDates.length >= rows.length * MIN_DATE_THRESHOLD
	);
}

// ============================================================================
// X-Axis Scale Functions
// ============================================================================

interface XScaleConfig {
	xScale: (x: any) => number;
	xLabelOf: (x: any) => string;
}

/**
 * Creates X-axis scale for date-based axis
 */
function createDateXScale(
	rows: ChartRow[],
	plotWidth: number,
	paddingLeft: number
): XScaleConfig {
	const DAY_MS = 24 * 60 * 60 * 1000;

	const parsedDates = rows
		.map((row) => parseDateLike(row.x))
		.filter((d): d is Date => !!d);

	const timestamps = parsedDates
		.map((d) => d.getTime())
		.sort((a, b) => a - b);

	let minTimestamp = timestamps[0];
	let maxTimestamp = timestamps[timestamps.length - 1];

	// If all points are on the same day, add padding
	if (minTimestamp === maxTimestamp) {
		minTimestamp -= DAY_MS;
		maxTimestamp += DAY_MS;
	}

	const span = maxTimestamp - minTimestamp || DAY_MS;
	const domainMin = minTimestamp - span * DOMAIN_PADDING;
	const domainMax = maxTimestamp + span * DOMAIN_PADDING;

	const xScale = (x: any): number => {
		const date = parseDateLike(x);
		if (!date) return paddingLeft;
		const timestamp = date.getTime();
		return (
			paddingLeft +
			((timestamp - domainMin) / (domainMax - domainMin || 1)) * plotWidth
		);
	};

	const xLabelOf = (x: any): string => {
		const date = parseDateLike(x);
		return date ? formatDateShort(date) : String(x);
	};

	return { xScale, xLabelOf };
}

/**
 * Creates X-axis scale for categorical axis
 */
function createCategoricalXScale(
	rows: ChartRow[],
	plotWidth: number,
	paddingLeft: number
): XScaleConfig {
	const xValues: any[] = [];
	const seenX = new Set<string>();

	for (const row of rows) {
		const key = String(row.x);
		if (!seenX.has(key)) {
			seenX.add(key);
			xValues.push(row.x);
		}
	}

	const categoryCount = xValues.length || 1;

	const xScale = (x: any): number => {
		const key = String(x);
		const index = xValues.findIndex((v) => String(v) === key);
		if (index < 0) return paddingLeft;
		if (categoryCount === 1) return paddingLeft + plotWidth / 2;
		return paddingLeft + (index / (categoryCount - 1)) * plotWidth;
	};

	const xLabelOf = (x: any): string => String(x);

	return { xScale, xLabelOf };
}

/**
 * Renders date axis with grid lines and labels
 */
function renderDateAxis(
	svg: SVGSVGElement,
	domainMin: number,
	domainMax: number,
	plotWidth: number,
	plotHeight: number,
	paddingLeft: number,
	paddingTop: number,
	paddingRight: number,
	width: number
): void {
	const DAY_MS = 24 * 60 * 60 * 1000;
	const axisY = paddingTop + plotHeight;

	// Draw axis line
	const axisLine = document.createElementNS(
		svg.namespaceURI,
		"line"
	) as SVGLineElement;
	axisLine.setAttribute("x1", String(paddingLeft));
	axisLine.setAttribute("y1", String(axisY));
	axisLine.setAttribute("x2", String(width - paddingRight));
	axisLine.setAttribute("y2", String(axisY));
	axisLine.setAttribute("stroke", "#111111");
	axisLine.setAttribute("stroke-width", "1");
	svg.appendChild(axisLine);

	// Calculate tick spacing
	const spanDays = (domainMax - domainMin) / DAY_MS;
	const maxTicks = Math.max(
		MIN_TICKS,
		Math.min(MAX_TICKS, Math.floor(plotWidth / IDEAL_PIXELS_PER_TICK) || MIN_TICKS)
	);
	const rawStepDays = spanDays / maxTicks;

	let stepDays = DATE_TICK_CANDIDATES[DATE_TICK_CANDIDATES.length - 1];
	for (const candidate of DATE_TICK_CANDIDATES) {
		if (candidate >= rawStepDays) {
			stepDays = candidate;
			break;
		}
	}

	const floorToDay = (timestamp: number): number => {
		const date = new Date(timestamp);
		date.setHours(0, 0, 0, 0);
		return date.getTime();
	};

	// Draw ticks and labels
	const firstTick = floorToDay(domainMin);
	for (
		let timestamp = firstTick;
		timestamp <= domainMax + 0.5 * DAY_MS;
		timestamp += stepDays * DAY_MS
	) {
		const x = paddingLeft + ((timestamp - domainMin) / (domainMax - domainMin)) * plotWidth;

		// Grid line
		const gridLine = document.createElementNS(
			svg.namespaceURI,
			"line"
		) as SVGLineElement;
		gridLine.setAttribute("x1", String(x));
		gridLine.setAttribute("y1", String(paddingTop));
		gridLine.setAttribute("x2", String(x));
		gridLine.setAttribute("y2", String(axisY));
		gridLine.setAttribute("stroke", "#111111");
		gridLine.setAttribute("stroke-opacity", "0.18");
		gridLine.setAttribute("stroke-dasharray", "2,4");
		svg.appendChild(gridLine);

		// Label
		const label = document.createElementNS(
			svg.namespaceURI,
			"text"
		) as SVGTextElement;
		label.setAttribute("x", String(x));
		label.setAttribute("y", String(axisY + 12));
		label.setAttribute("text-anchor", "middle");
		label.setAttribute("font-size", "10");
		label.setAttribute("fill", "#111111");
		label.textContent = formatDateShort(new Date(timestamp));
		svg.appendChild(label);
	}
}

// ============================================================================
// Y-Axis Scale Functions
// ============================================================================

/**
 * Calculates Y-axis scale range from data
 */
function calculateYScaleRange(rows: ChartRow[]): { min: number; max: number } {
	let minY = Number.POSITIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const row of rows) {
		if (row.y < minY) minY = row.y;
		if (row.y > maxY) maxY = row.y;
	}

	if (!isFinite(minY) || !isFinite(maxY)) {
		return { min: 0, max: 1 };
	}

	if (minY === maxY) {
		return minY === 0 ? { min: 0, max: 1 } : { min: 0, max: maxY };
	}

	return { min: minY, max: maxY };
}

/**
 * Creates Y-axis scale function
 */
function createYScale(
	minY: number,
	maxY: number,
	plotHeight: number,
	paddingTop: number
): (value: number) => number {
	return (value: number) =>
		paddingTop +
		plotHeight -
		((value - minY) / (maxY - minY || 1)) * plotHeight;
}

/**
 * Renders Y-axis grid lines and labels
 */
function renderYAxis(
	svg: SVGSVGElement,
	minY: number,
	maxY: number,
	yScale: (v: number) => number,
	plotWidth: number,
	paddingLeft: number,
	paddingRight: number
): void {
	for (let i = 0; i <= Y_TICKS_COUNT; i++) {
		const tickValue = minY + ((maxY - minY) * i) / Y_TICKS_COUNT;
		const y = yScale(tickValue);

		// Grid line
		const line = document.createElementNS(
			svg.namespaceURI,
			"line"
		) as SVGLineElement;
		line.setAttribute("x1", String(paddingLeft));
		line.setAttribute("y1", String(y));
		line.setAttribute("x2", String(plotWidth + paddingLeft + paddingRight));
		line.setAttribute("y2", String(y));
		line.setAttribute("stroke", "#cccccc");
		line.setAttribute("stroke-opacity", "0.25");
		svg.appendChild(line);

		// Label
		const label = document.createElementNS(
			svg.namespaceURI,
			"text"
		) as SVGTextElement;
		label.setAttribute("x", String(paddingLeft - 4));
		label.setAttribute("y", String(y + 3));
		label.setAttribute("text-anchor", "end");
		label.setAttribute("font-size", "10");
		label.setAttribute("fill", "#111111");
		label.textContent =
			Math.abs(tickValue) >= LARGE_NUMBER_THRESHOLD
				? String(Math.round(tickValue))
				: String(Math.round(tickValue * 10) / 10);
		svg.appendChild(label);
	}
}

// ============================================================================
// Legend Functions
// ============================================================================

/**
 * Renders chart legend
 */
function renderLegend(
	container: HTMLElement,
	seriesKeys: string[],
	filterDefault: boolean = true
): void {
	const displaySeries = filterDefault
		? seriesKeys.filter((k) => k !== DEFAULT_SERIES_KEY)
		: seriesKeys;

	if (displaySeries.length <= 1) return;

	const legend = container.createDiv({ cls: "chart-notes-legend" });
	displaySeries.forEach((key, index) => {
		const item = legend.createDiv({ cls: "chart-notes-legend-item" });
		const swatch = item.createDiv();
		swatch.style.width = "10px";
		swatch.style.height = "10px";
		swatch.style.borderRadius = "999px";
		swatch.style.backgroundColor = colorFor(key, index);
		item.createSpan({ text: key });
	});
}

// ============================================================================
// Series Rendering Functions
// ============================================================================

/**
 * Sorts rows by X value (date or category)
 */
function sortRowsByX(rows: ChartRow[], isDateAxis: boolean): ChartRow[] {
	const sorted = [...rows];

	if (isDateAxis) {
		sorted.sort((a, b) => {
			const dateA = parseDateLike(a.x);
			const dateB = parseDateLike(b.x);
			const timeA = dateA ? dateA.getTime() : 0;
			const timeB = dateB ? dateB.getTime() : 0;
			return timeA - timeB;
		});
	}
	// For categorical, keep original order (already sorted by query)

	return sorted;
}

/**
 * Creates SVG path for line or area
 */
function createPath(
	rows: ChartRow[],
	xScale: (x: any) => number,
	yScale: (y: number) => number,
	isArea: boolean,
	minY: number
): string {
	let pathData = "";

	rows.forEach((row, index) => {
		const x = xScale(row.x);
		const y = yScale(row.y);
		pathData += index === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
	});

	if (isArea && rows.length > 0) {
		const first = rows[0];
		const last = rows[rows.length - 1];
		const xFirst = xScale(first.x);
		const xLast = xScale(last.x);
		const baselineY = yScale(minY);

		pathData += ` L ${xLast} ${baselineY} L ${xFirst} ${baselineY} Z`;
	}

	return pathData;
}

/**
 * Renders data points with tooltips and drilldown
 */
function renderDataPoints(
	svg: SVGSVGElement,
	rows: ChartRow[],
	xScale: (x: any) => number,
	yScale: (y: number) => number,
	xLabelOf: (x: any) => string,
	color: string,
	seriesName: string,
	container: HTMLElement,
	tooltip: HTMLElement,
	details: HTMLElement,
	drilldown: boolean
): void {
	rows.forEach((row) => {
		const x = xScale(row.x);
		const y = yScale(row.y);

		const dot = document.createElementNS(
			svg.namespaceURI,
			"circle"
		) as SVGCircleElement;
		dot.setAttribute("cx", String(x));
		dot.setAttribute("cy", String(y));
		dot.setAttribute("r", "3");
		dot.setAttribute("fill", "#ffffff");
		dot.setAttribute("stroke", color);
		dot.setAttribute("stroke-width", "1.5");
		dot.style.cursor = "pointer";

		const xLabel = xLabelOf(row.x);
		const title = seriesName ? `${seriesName} @ ${xLabel}` : xLabel;
		const body = `value: ${Math.round(row.y * 100) / 100}`;

		dot.addEventListener("mouseenter", (ev: MouseEvent) =>
			showTooltip(
				container,
				tooltip,
				title,
				body,
				row.notes?.length ?? 0,
				ev
			)
		);
		dot.addEventListener("mouseleave", () => hideTooltip(tooltip));
		dot.addEventListener("click", (ev: MouseEvent) => {
			ev.preventDefault();
			openDetails(
				container,
				details,
				title,
				row.y,
				row.notes ?? [],
				drilldown
			);
		});

		svg.appendChild(dot);
	});
}

// ============================================================================
// Main Render Functions
// ============================================================================

/**
 * Renders a line or area chart
 * 
 * @param container - Container element to render into
 * @param spec - Chart specification
 * @param data - Query result data
 * @param isArea - Whether to render as area (true) or line (false)
 */
export function renderLine(
	container: HTMLElement,
	spec: ChartSpec,
	data: QueryResult,
	isArea: boolean
): void {
	const options = spec.options ?? {};
	const background: string | undefined = options.background;
	const drilldown: boolean = options.drilldown ?? true;

	const rows = (data.rows ?? []) as ChartRow[];
	if (!rows.length) {
		container.createDiv({ cls: "prop-charts-empty", text: EMPTY_DATA_MESSAGE });
		return;
	}

	const { inner, svg, tooltip, details } = ensureContainer(container, background);

	const viewportWidth = container.getBoundingClientRect().width || 600;
	const width = Math.max(viewportWidth, 480);
	inner.style.width = width + "px";

	const height = DEFAULT_H;
	svg.setAttribute("height", String(height));

	const plotWidth = width - PADDING_LEFT - PADDING_RIGHT;
	const plotHeight = height - PADDING_TOP - PADDING_BOTTOM;

	const isDateAxis = detectDateAxis(rows);
	const seriesMap = groupBySeries(rows);
	const seriesKeys = Array.from(seriesMap.keys());

	// Create X-axis scale
	const xScaleConfig = isDateAxis
		? createDateXScale(rows, plotWidth, PADDING_LEFT)
		: createCategoricalXScale(rows, plotWidth, PADDING_LEFT);

	const { xScale, xLabelOf } = xScaleConfig;

	// Render date axis if needed
	if (isDateAxis) {
		const parsedDates = rows
			.map((row) => parseDateLike(row.x))
			.filter((d): d is Date => !!d);
		const timestamps = parsedDates.map((d) => d.getTime()).sort((a, b) => a - b);

		let minTs = timestamps[0];
		let maxTs = timestamps[timestamps.length - 1];
		const DAY_MS = 24 * 60 * 60 * 1000;
		if (minTs === maxTs) {
			minTs -= DAY_MS;
			maxTs += DAY_MS;
		}
		const span = maxTs - minTs || DAY_MS;
		const domainMin = minTs - span * DOMAIN_PADDING;
		const domainMax = maxTs + span * DOMAIN_PADDING;

		renderDateAxis(
			svg,
			domainMin,
			domainMax,
			plotWidth,
			plotHeight,
			PADDING_LEFT,
			PADDING_TOP,
			PADDING_RIGHT,
			width
		);
	}

	// Calculate and render Y-axis
	const { min: minY, max: maxY } = calculateYScaleRange(rows);
	const yScale = createYScale(minY, maxY, plotHeight, PADDING_TOP);
	renderYAxis(svg, minY, maxY, yScale, plotWidth, PADDING_LEFT, PADDING_RIGHT);

	// Render legend
	renderLegend(container, seriesKeys);

	// Render series
	seriesKeys.forEach((seriesKey, seriesIndex) => {
		const seriesRows = seriesMap.get(seriesKey)!;
		if (!seriesRows?.length) return;

		const color =
			seriesKey === DEFAULT_SERIES_KEY
				? colorFor("line", seriesIndex)
				: colorFor(seriesKey, seriesIndex);

		const orderedRows = sortRowsByX(seriesRows, isDateAxis);
		const pathData = createPath(orderedRows, xScale, yScale, isArea, minY);

		// Create path element
		const path = document.createElementNS(
			svg.namespaceURI,
			"path"
		) as SVGPathElement;
		path.setAttribute("d", pathData);
		path.setAttribute("fill", isArea ? color : "none");
		path.setAttribute("fill-opacity", isArea ? "0.18" : "0");
		path.setAttribute("stroke", color);
		path.setAttribute("stroke-width", isArea ? "1.5" : "2");
		svg.appendChild(path);

		// Render data points
		const seriesName = seriesKey === DEFAULT_SERIES_KEY ? "" : String(seriesKey);
		renderDataPoints(
			svg,
			orderedRows,
			xScale,
			yScale,
			xLabelOf,
			color,
			seriesName,
			container,
			tooltip,
			details,
			drilldown
		);
	});
}

/**
 * Renders a stacked area chart
 * 
 * @param container - Container element to render into
 * @param spec - Chart specification
 * @param data - Query result data
 */
export function renderStackedArea(
	container: HTMLElement,
	spec: ChartSpec,
	data: QueryResult
): void {
	const options = spec.options ?? {};
	const background: string | undefined = options.background;
	const drilldown: boolean = options.drilldown ?? true;

	const rows = (data.rows ?? []) as ChartRow[];
	if (!rows.length) {
		container.createDiv({ cls: "prop-charts-empty", text: EMPTY_DATA_MESSAGE });
		return;
	}

	// Group by series
	const seriesMap = groupBySeries(rows);
	const seriesKeys = Array.from(seriesMap.keys()).filter(
		(k) => k !== DEFAULT_SERIES_KEY
	);

	// If no multiple series, fall back to regular area chart
	if (seriesKeys.length === 0) {
		renderLine(container, spec, data, true);
		return;
	}

	// Create container only if we're actually rendering stacked area
	const { inner, svg, tooltip, details } = ensureContainer(container, background);

	const viewportWidth = container.getBoundingClientRect().width || 600;
	const width = Math.max(viewportWidth, 480);
	inner.style.width = width + "px";

	const height = DEFAULT_H;
	svg.setAttribute("height", String(height));

	const plotWidth = width - PADDING_LEFT - PADDING_RIGHT;
	const plotHeight = height - PADDING_TOP - PADDING_BOTTOM;

	const isDateAxis = detectDateAxis(rows);

	// Collect all unique X values
	const xValues: any[] = [];
	const seenX = new Set<string>();

	for (const row of rows) {
		const key = String(row.x);
		if (!seenX.has(key)) {
			seenX.add(key);
			xValues.push(row.x);
		}
	}

	// Create X-axis scale
	const xScaleConfig = isDateAxis
		? createDateXScale(rows, plotWidth, PADDING_LEFT)
		: createCategoricalXScale(rows, plotWidth, PADDING_LEFT);

	const { xScale, xLabelOf } = xScaleConfig;

	// Sort X values if date axis
	if (isDateAxis) {
		xValues.sort((a, b) => {
			const dateA = parseDateLike(a);
			const dateB = parseDateLike(b);
			const timeA = dateA ? dateA.getTime() : 0;
			const timeB = dateB ? dateB.getTime() : 0;
			return timeA - timeB;
		});
	}

	// Render date axis if needed
	if (isDateAxis) {
		const parsedDates = rows
			.map((row) => parseDateLike(row.x))
			.filter((d): d is Date => !!d);
		const timestamps = parsedDates.map((d) => d.getTime()).sort((a, b) => a - b);

		let minTs = timestamps[0];
		let maxTs = timestamps[timestamps.length - 1];
		const DAY_MS = 24 * 60 * 60 * 1000;
		if (minTs === maxTs) {
			minTs -= DAY_MS;
			maxTs += DAY_MS;
		}
		const span = maxTs - minTs || DAY_MS;
		const domainMin = minTs - span * DOMAIN_PADDING;
		const domainMax = maxTs + span * DOMAIN_PADDING;

		renderDateAxis(
			svg,
			domainMin,
			domainMax,
			plotWidth,
			plotHeight,
			PADDING_LEFT,
			PADDING_TOP,
			PADDING_RIGHT,
			width
		);
	}

	// Calculate stacked values with carry-forward for gaps
	const seriesValuesByX = new Map<string, Map<string, number>>(); // x -> series -> value
	const seriesIndexByX = new Map<string, Map<string, number>>(); // series -> x -> value

	// Initialize all X values
	for (const xVal of xValues) {
		seriesValuesByX.set(String(xVal), new Map());
	}

	// Build index of actual values per series
	for (const seriesKey of seriesKeys) {
		const seriesRows = seriesMap.get(seriesKey) ?? [];
		const index = new Map<string, number>();

		for (const row of seriesRows) {
			const xKey = String(row.x);
			index.set(xKey, row.y ?? 0);
		}

		seriesIndexByX.set(seriesKey, index);
	}

	// Fill with carry-forward (important for cumulative sum continuity)
	for (const seriesKey of seriesKeys) {
		const index = seriesIndexByX.get(seriesKey) ?? new Map();
		let lastValue = 0;

		for (const xVal of xValues) {
			const xKey = String(xVal);
			const value = index.get(xKey);

			if (value !== undefined) {
				lastValue = value;
			}
			// If not found, use last known value (carry forward)
			// This is important for cumulative sum to maintain continuity

			const xMap = seriesValuesByX.get(xKey);
			if (xMap) {
				xMap.set(seriesKey, lastValue);
			}
		}
	}

	// Calculate stacked points
	const stackedPoints: StackedPoint[] = [];

	for (const xVal of xValues) {
		const xKey = String(xVal);
		const seriesValues = new Map<string, number>();
		const stackedValues = new Map<string, number>();

		// Collect values for each series at this X
		const xMap = seriesValuesByX.get(xKey);
		for (const seriesKey of seriesKeys) {
			const value = xMap?.get(seriesKey) ?? 0;
			seriesValues.set(seriesKey, value);
		}

		// Calculate stacked values
		// base_S1 = 0, top_S1 = v_S1
		// base_S2 = top_S1, top_S2 = base_S2 + v_S2
		// etc.
		let accumulator = 0;
		for (const seriesKey of seriesKeys) {
			const value = seriesValues.get(seriesKey) ?? 0;
			stackedValues.set(seriesKey, accumulator); // base of series
			accumulator += value; // top of series = base + value
		}

		stackedPoints.push({
			x: xVal,
			seriesValues,
			stackedValues,
		});
	}

	// Calculate Y-axis scale based on maximum stacked total
	let maxY = 0;
	for (const point of stackedPoints) {
		let sum = 0;
		for (const seriesKey of seriesKeys) {
			sum += point.seriesValues.get(seriesKey) ?? 0;
		}
		if (sum > maxY) maxY = sum;
	}
	if (!isFinite(maxY) || maxY <= 0) maxY = 1;

	const yScale = createYScale(0, maxY, plotHeight, PADDING_TOP);
	renderYAxis(svg, 0, maxY, yScale, plotWidth, PADDING_LEFT, PADDING_RIGHT);

	// Render legend
	if (seriesKeys.length > 0) {
		renderLegend(container, seriesKeys, false);
	}

	// Render stacked areas
	seriesKeys.forEach((seriesKey, seriesIndex) => {
		const color = colorFor(seriesKey, seriesIndex);

		// Build path: top line (left to right)
		let topPath = "";
		stackedPoints.forEach((point, index) => {
			const x = xScale(point.x);
			const stackedBottom = point.stackedValues.get(seriesKey) ?? 0;
			const value = point.seriesValues.get(seriesKey) ?? 0;
			const stackedTop = stackedBottom + value;
			const yTop = yScale(stackedTop);

			topPath += index === 0 ? `M ${x} ${yTop}` : ` L ${x} ${yTop}`;
		});

		// Bottom line (right to left, reversed)
		const reversedBottom = stackedPoints
			.slice()
			.reverse()
			.map((point) => {
				const x = xScale(point.x);
				const stackedBottom = point.stackedValues.get(seriesKey) ?? 0;
				const yBottom = yScale(stackedBottom);
				return `${x} ${yBottom}`;
			})
			.join(" L ");

		// Close path
		const fullPath = `${topPath} L ${reversedBottom} Z`;

		const path = document.createElementNS(
			svg.namespaceURI,
			"path"
		) as SVGPathElement;
		path.setAttribute("d", fullPath);
		path.setAttribute("fill", color);
		path.setAttribute("fill-opacity", "0.18");
		path.setAttribute("stroke", color);
		path.setAttribute("stroke-width", "1.5");
		svg.appendChild(path);

		// Render data points (only where real data exists)
		const seriesDataIndex = seriesIndexByX.get(seriesKey);

		stackedPoints.forEach((point) => {
			const xKey = String(point.x);
			const hasRealData = seriesDataIndex?.has(xKey);

			if (!hasRealData) {
				return; // Skip points where there's no real data (carry-forward)
			}

			const x = xScale(point.x);
			const stackedBottom = point.stackedValues.get(seriesKey) ?? 0;
			const value = point.seriesValues.get(seriesKey) ?? 0;
			const stackedTop = stackedBottom + value;
			const y = yScale(stackedTop);

			const dot = document.createElementNS(
				svg.namespaceURI,
				"circle"
			) as SVGCircleElement;
			dot.setAttribute("cx", String(x));
			dot.setAttribute("cy", String(y));
			dot.setAttribute("r", "3");
			dot.setAttribute("fill", "#ffffff");
			dot.setAttribute("stroke", color);
			dot.setAttribute("stroke-width", "1.5");
			dot.style.cursor = "pointer";

			const xLabel = xLabelOf(point.x);
			const title = `${seriesKey} @ ${xLabel}`;
			const body = `value: ${Math.round(value * 100) / 100}`;

			// Find original row for notes
			const seriesRows = seriesMap.get(seriesKey) ?? [];
			const row = seriesRows.find((r) => String(r.x) === String(point.x));

			dot.addEventListener("mouseenter", (ev: MouseEvent) =>
				showTooltip(
					container,
					tooltip,
					title,
					body,
					row?.notes?.length ?? 0,
					ev
				)
			);
			dot.addEventListener("mouseleave", () => hideTooltip(tooltip));
			dot.addEventListener("click", (ev: MouseEvent) => {
				ev.preventDefault();
				openDetails(
					container,
					details,
					title,
					value,
					row?.notes ?? [],
					drilldown
				);
			});

			svg.appendChild(dot);
		});
	});
}
