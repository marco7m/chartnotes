/**
 * Query Engine
 * 
 * Processes chart specifications and converts indexed notes into query results
 * suitable for rendering. Handles filtering, aggregation, sorting, and transformations.
 */

import type {
	ChartSpec,
	IndexedNote,
	QueryResult,
	QueryResultRow,
} from "./types";
import {
	matchPath,
	matchTags,
	parseWhere,
	evalCond,
	looksLikeISODate,
	toDate,
} from "./utils";

// ============================================================================
// Types
// ============================================================================

type SortDirection = "asc" | "desc";

interface DateKeyNormalized {
	key: string | number | Date;
	isDate: boolean;
}

interface RawQueryRow {
	x: string | number | Date;
	y: number;
	notes: string[];
	series?: string;
	props?: Record<string, any>;
	_isDate: boolean;
	_origX: any;
}

interface GroupAggregation {
	sum: number;
	count: number;
	min: number;
	max: number;
	notes: string[];
	xRep: any;
	isDate: boolean;
	series?: string;
	props?: Record<string, any>;
}

// ============================================================================
// Constants
// ============================================================================

const NO_SERIES_KEY = "__no_series__";
const SERIES_X_SEPARATOR = "||";
const MILLISECONDS_PER_MINUTE = 60000;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalizes a date key value.
 * Extracts day portion from ISO strings with time, converts ISO strings to Date objects.
 * 
 * @param original - Original value to normalize
 * @returns Normalized key and whether it's a date
 */
function normalizeDateKey(original: any): DateKeyNormalized {
	if (typeof original === "string") {
		// Extract only the day portion if it comes in ISO format with time
		if (/^\d{4}-\d{2}-\d{2}/.test(original)) {
			const day = original.slice(0, 10); // "2025-10-05"
			return { key: day, isDate: true };
		}
	}
	if (looksLikeISODate(original)) {
		const date = toDate(original);
		if (date) return { key: date, isDate: true };
	}
	return { key: original, isDate: false };
}

/**
 * Compares two rows by X value (ascending).
 * Dates are compared by timestamp, other values as strings.
 */
function compareXAsc(a: QueryResultRow, b: QueryResultRow): number {
	const ax = a.x;
	const bx = b.x;
	if (ax instanceof Date && bx instanceof Date) {
		return ax.getTime() - bx.getTime();
	}
	const strA = String(ax);
	const strB = String(bx);
	if (strA < strB) return -1;
	if (strA > strB) return 1;
	return 0;
}

/**
 * Compares two rows by X value, then by series (ascending).
 */
function compareXSeriesAsc(a: QueryResultRow, b: QueryResultRow): number {
	const xComparison = compareXAsc(a, b);
	if (xComparison !== 0) return xComparison;
	const seriesA = a.series ?? "";
	const seriesB = b.series ?? "";
	if (seriesA < seriesB) return -1;
	if (seriesA > seriesB) return 1;
	return 0;
}

/**
 * Parses rolling window size from configuration.
 * 
 * @param rolling - Rolling window value (number or string)
 * @returns Window size in number of points
 * @throws Error if value is invalid
 */
function parseRollingWindow(rolling: any): number {
	if (rolling == null) return 0;
	if (typeof rolling === "number") {
		return rolling > 0 ? Math.floor(rolling) : 0;
	}
	if (typeof rolling === "string") {
		const match = rolling.trim().match(/^(\d+)/);
		if (match) {
			const num = Number(match[1]);
			return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
		}
	}
	throw new Error(`Invalid aggregate.rolling: ${String(rolling)}`);
}

/**
 * Applies cumulative sum transformation PER SERIES in the current row order.
 * 
 * Note: This should be called AFTER applying sort.x (asc/desc).
 * 
 * @param rows - Rows to transform (should already be sorted)
 * @returns Rows with cumulative Y values
 */
function applyCumulativeInOrder(rows: QueryResultRow[]): QueryResultRow[] {
	const accumulatorBySeries = new Map<string, number>();
	const output: QueryResultRow[] = [];

	for (const row of rows) {
		const seriesKey = row.series ?? NO_SERIES_KEY;
		const previous = accumulatorBySeries.get(seriesKey) ?? 0;
		const next = previous + row.y;
		accumulatorBySeries.set(seriesKey, next);
		output.push({ ...row, y: next });
	}
	return output;
}

/**
 * Applies rolling average transformation PER SERIES in the current row order.
 * 
 * Example: rolling = 7 → uses up to the last 7 points of that series.
 * 
 * @param rows - Rows to transform (should already be sorted)
 * @param rolling - Rolling window configuration
 * @returns Rows with rolling average Y values
 */
function applyRollingInOrder(
	rows: QueryResultRow[],
	rolling: any
): QueryResultRow[] {
	const windowSize = parseRollingWindow(rolling);
	if (!windowSize || windowSize <= 1) {
		return [...rows];
	}

	const bufferBySeries = new Map<string, number[]>();
	const sumBySeries = new Map<string, number>();
	const output: QueryResultRow[] = [];

	for (const row of rows) {
		const seriesKey = row.series ?? NO_SERIES_KEY;

		let buffer = bufferBySeries.get(seriesKey);
		if (!buffer) {
			buffer = [];
			bufferBySeries.set(seriesKey, buffer);
		}
		let sum = sumBySeries.get(seriesKey) ?? 0;

		buffer.push(row.y);
		sum += row.y;
		if (buffer.length > windowSize) {
			const removed = buffer.shift()!;
			sum -= removed;
		}
		sumBySeries.set(seriesKey, sum);

		const denominator = buffer.length || 1;
		const average = sum / denominator;

		output.push({ ...row, y: average });
	}

	return output;
}

// ============================================================================
// Query Engine Class
// ============================================================================

export class PropChartsQueryEngine {
	private getIndex: () => IndexedNote[];
	private defaultPaths: string[];

	constructor(getIndex: () => IndexedNote[], defaultPaths: string[]) {
		this.getIndex = getIndex;
		this.defaultPaths = defaultPaths;
	}

	/**
	 * Main entry point: runs a query based on chart specification.
	 */
	run(spec: ChartSpec): QueryResult {
		const allNotes = this.getIndex();

		// Apply basic filters: paths + tags
		const sourcePaths =
			spec.source?.paths && spec.source.paths.length
				? spec.source.paths
				: this.defaultPaths;

		const sourceTags =
			spec.source?.tags && spec.source.tags.length
				? spec.source.tags
				: [];

		const filtered: IndexedNote[] = [];

		for (const note of allNotes) {
			// Path filter: if no paths specified (neither in spec nor default), don't filter by path
			const passesPath =
				sourcePaths && sourcePaths.length
					? matchPath(note.path, sourcePaths)
					: true;

			// Tag filter: if no tags in spec, don't filter by tag
			const passesTag =
				sourceTags && sourceTags.length
					? matchTags(note.props, sourceTags)
					: true;

			// Note must pass BOTH path AND tag filters
			if (!passesPath || !passesTag) continue;

			// Where conditions
			let passesWhere = true;
			if (spec.source?.where && spec.source.where.length > 0) {
				for (const conditionStr of spec.source.where) {
					let parsed;
					try {
						parsed = parseWhere(conditionStr);
					} catch (err) {
						throw new Error(
							`Invalid condition: ${conditionStr} (${(err as Error).message})`
						);
					}
					if (!evalCond(note.props, parsed)) {
						passesWhere = false;
						break;
					}
				}
			}
			if (!passesWhere) continue;

			filtered.push(note);
		}

		// Route to specialized handlers
		if (spec.type === "gantt") {
			return this.runGantt(spec, filtered);
		}
		if (spec.type === "table") {
			return this.runTable(spec, filtered);
		}

		// Standard charts (bar / line / stacked-area / pie / scatter / stacked-bar)
		return this.runStandard(spec, filtered);
	}

	// ============================================================================
	// Specialized Query Handlers
	// ============================================================================

	/**
	 * Handles table chart queries.
	 */
	private runTable(spec: ChartSpec, notes: IndexedNote[]): QueryResult {
		const rows: QueryResultRow[] = notes.map((note) => ({
			x: note.path,
			y: 0,
			notes: [note.path],
			props: note.props,
		}));

		return {
			rows,
			xField: spec.encoding?.x,
			yField: spec.encoding?.y,
		};
	}

	/**
	 * Handles Gantt chart queries.
	 */
	private runGantt(spec: ChartSpec, notes: IndexedNote[]): QueryResult {
		const encoding: any = spec.encoding ?? {};
		const startField: string | undefined = encoding.start;
		const endField: string | undefined = encoding.end;
		const labelField: string | undefined = encoding.label ?? encoding.x;
		const seriesField: string | undefined = encoding.series;
		const durationField: string | undefined = encoding.duration;
		const dueField: string | undefined = encoding.due;

		const rows: QueryResultRow[] = [];

		for (const note of notes) {
			const props = note.props ?? {};
			const pickScalar = (value: any) => (Array.isArray(value) ? value[0] : value);

			// End date is required
			let endDate: Date | null = null;
			if (endField) {
				const rawEnd = pickScalar(props[endField]);
				const date = toDate(rawEnd);
				if (date) endDate = date;
			}
			if (!endDate) continue;

			// Start date: from field or derived from duration
			let startDate: Date | null = null;
			if (startField) {
				const rawStart = pickScalar(props[startField]);
				const date = toDate(rawStart);
				if (date) startDate = date;
			}
			if (!startDate && durationField) {
				const rawDuration = pickScalar(props[durationField]);
				const durationMinutes = Number(rawDuration);
				if (!Number.isNaN(durationMinutes)) {
					startDate = new Date(
						endDate.getTime() - durationMinutes * MILLISECONDS_PER_MINUTE
					);
				}
			}
			if (!startDate) startDate = new Date(endDate.getTime());

			// Due date (optional)
			let dueDate: Date | undefined;
			if (dueField) {
				const rawDue = pickScalar(props[dueField]);
				const date = toDate(rawDue);
				if (date) dueDate = date;
			}

			// Label
			let xLabel: any;
			if (labelField) {
				let value = pickScalar(props[labelField]);
				if (value == null || value === "") value = note.path;
				xLabel = value;
			} else {
				xLabel = note.path;
			}

			// Series
			let series: string | undefined;
			if (seriesField) {
				const rawSeries = pickScalar(props[seriesField]);
				if (rawSeries != null) series = String(rawSeries);
			}

			const row: QueryResultRow = {
				x: xLabel,
				y: 0,
				notes: [note.path],
				series,
				start: startDate,
				end: endDate,
				props,
			};
			if (dueDate) (row as any).due = dueDate;
			rows.push(row);
		}

		// Sort by start date
		rows.sort((a, b) => {
			const timeA = a.start ? a.start.getTime() : 0;
			const timeB = b.start ? b.start.getTime() : 0;
			return timeA - timeB;
		});

		return {
			rows,
			xField: labelField,
			yField: endField,
		};
	}

	/**
	 * Handles standard chart queries (bar, line, stacked-area, pie, scatter, stacked-bar).
	 */
	private runStandard(spec: ChartSpec, notes: IndexedNote[]): QueryResult {
		const xField = spec.encoding?.x;
		const yField = spec.encoding?.y;
		const seriesField = spec.encoding?.series;

		if (!xField) {
			throw new Error("encoding.x is required.");
		}

		const aggregateConfig: any = spec.aggregate ?? {};
		const aggregateMode: string | null = aggregateConfig.y ?? null;
		const cumulative: boolean = !!aggregateConfig.cumulative;
		const rolling = aggregateConfig.rolling;

		if (!yField && aggregateMode !== "count") {
			throw new Error(
				"encoding.y is required (except when aggregate.y = 'count')."
			);
		}

		// Build raw rows from notes
		const rawRows: RawQueryRow[] = [];

		for (const note of notes) {
			const props = note.props ?? {};
			const pickScalar = (value: any) => (Array.isArray(value) ? value[0] : value);

			const rawX = pickScalar(props[xField]);
			if (rawX == null) continue;

			const normalized = normalizeDateKey(rawX);
			const xToUse = normalized.key;
			const isDate = normalized.isDate;

			let series: string | undefined;
			if (seriesField) {
				const rawSeries = pickScalar(props[seriesField]);
				if (rawSeries != null && String(rawSeries).trim() !== "") {
					series = String(rawSeries);
				}
			}

			let yValue: number;
			if (aggregateMode === "count") {
				yValue = 1;
			} else {
				const rawY = pickScalar(props[yField!]);
				if (rawY == null) continue;
				const num = Number(rawY);
				if (Number.isNaN(num)) continue;
				yValue = num;
			}

			rawRows.push({
				x: xToUse,
				y: yValue,
				notes: [note.path],
				series,
				props,
				_isDate: isDate,
				_origX: rawX,
			});
		}

		if (rawRows.length === 0) {
			return { rows: [], xField, yField };
		}

		// Aggregate rows
		let aggregated: QueryResultRow[] = [];

		if (aggregateMode) {
			// Aggregate by (x, series)
			const grouped = new Map<string, GroupAggregation>();

			for (const row of rawRows) {
				const seriesKey = row.series ?? "";
				const xKey =
					row.x instanceof Date
						? row.x.toISOString().slice(0, 10)
						: String(row.x);
				const groupKey = seriesKey + SERIES_X_SEPARATOR + xKey;

				const group: GroupAggregation = grouped.get(groupKey) ?? {
					sum: 0,
					count: 0,
					min: Number.POSITIVE_INFINITY,
					max: Number.NEGATIVE_INFINITY,
					notes: [],
					xRep: row.x,
					isDate: row._isDate,
					series: row.series,
					props: row.props,
				};

				group.sum += row.y;
				group.count += 1;
				if (row.y < group.min) group.min = row.y;
				if (row.y > group.max) group.max = row.y;
				group.notes.push(...row.notes);
				group.props = row.props ?? group.props;

				grouped.set(groupKey, group);
			}

			for (const [, group] of grouped) {
				let y = group.sum;
				switch (aggregateMode) {
					case "sum":
						y = group.sum;
						break;
					case "avg":
						y = group.sum / group.count;
						break;
					case "min":
						y = group.min;
						break;
					case "max":
						y = group.max;
						break;
					case "count":
						y = group.count;
						break;
				}
				aggregated.push({
					x: group.xRep,
					y,
					notes: group.notes,
					series: group.series,
					props: group.props,
				});
			}
		} else {
			aggregated = rawRows.map((row) => ({
				x: row.x,
				y: row.y,
				notes: row.notes,
				series: row.series,
				props: row.props,
			}));
		}

		if (aggregated.length === 0) {
			return { rows: [], xField, yField };
		}

		// Sort: define ORDER before transformations
		const sortDirection: SortDirection =
			spec.sort?.x === "desc" ? "desc" : "asc";
		aggregated.sort((a, b) => {
			const comparison = compareXSeriesAsc(a, b);
			return sortDirection === "asc" ? comparison : -comparison;
		});

		// Transformations: cumulative / rolling only for line/stacked-area
		if (
			(cumulative || rolling) &&
			!(spec.type === "line" || spec.type === "stacked-area")
		) {
			throw new Error(
				"aggregate.cumulative / aggregate.rolling are only supported for type: 'line' or 'stacked-area'."
			);
		}
		if (cumulative && rolling) {
			throw new Error(
				"It is not yet possible to use 'cumulative' and 'rolling' together in the same chart."
			);
		}

		let transformed: QueryResultRow[] = aggregated;

		if (rolling) {
			transformed = applyRollingInOrder(aggregated, rolling);
		} else if (cumulative) {
			transformed = applyCumulativeInOrder(aggregated);
		}

		// Do NOT re-sort after transformations: the order used is the same as sort.x
		return { rows: transformed, xField, yField };
	}
}
