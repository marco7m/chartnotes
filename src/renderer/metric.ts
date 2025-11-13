// src/renderer/metric.ts
import type { ChartSpec, QueryResult, QueryResultRow } from "../types";
import { openDetails } from "./renderer-common";

declare const app: any;

/**
 * Gets color value based on color name
 */
function getColorValue(colorName: string): string {
	switch (colorName) {
		case "auto":
			return "var(--text-accent, #5b6cff)";
		case "accent":
			return "var(--text-accent, #5b6cff)";
		case "green":
			return "#5ec27f";
		case "red":
			return "#ff6b6b";
		case "blue":
			return "#5b6cff";
		case "orange":
			return "#ffb347";
		case "purple":
			return "#b47cff";
		default:
			return "var(--text-accent, #5b6cff)";
	}
}

/**
 * Formats a number with specified decimal places
 */
function formatNumber(
	value: number,
	decimals: number,
	prefix: string = "",
	suffix: string = ""
): string {
	const formatted = decimals === 0
		? Math.round(value).toString()
		: value.toFixed(decimals);
	return `${prefix}${formatted}${suffix}`;
}

/**
 * Formats a date for display
 */
function formatDate(value: Date): string {
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, "0");
	const day = String(value.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * Gets operation display name
 */
function getOperationName(operation: string): string {
	const names: Record<string, string> = {
		count: "Count notes",
		"count-value": "Count notes with value",
		"count-date": "Count notes with date",
		sum: "Sum of values",
		avg: "Average of values",
		min: "Smallest value",
		max: "Largest value",
		oldest: "Oldest date",
		newest: "Newest date",
		dateRange: "Date range (newest - oldest)",
		// UI operation names (for display)
		countAll: "Count all notes",
		countNonEmpty: "Count notes where property is set",
	};
	return names[operation] || operation;
}

export function renderMetric(
	container: HTMLElement,
	spec: ChartSpec,
	data: QueryResult
): void {
	const options = spec.options ?? {};
	const background: string | undefined = options.background;

	container.empty();
	container.addClass("prop-charts-container");
	container.addClass("prop-charts-metric");

	// Get configuration from spec options
	const label = (options.metricLabel as string | undefined) ?? "";
	const labelPosition = (options.metricLabelPosition as string | undefined) ?? "above";
	const decimals = Number(options.metricDecimals ?? 0);
	const prefix = (options.metricPrefix as string | undefined) ?? "";
	const suffix = (options.metricSuffix as string | undefined) ?? "";
	const colorName = (options.metricColor as string | undefined) ?? "auto";
	const color = getColorValue(colorName);

	// Get data row
	const row = data.rows[0] as QueryResultRow | undefined;
	if (!row) {
		container.createDiv({
			cls: "prop-charts-empty",
			text: "No data available.",
		});
		return;
	}

	// Get metric metadata
	const metricValue = row.props?._metricValue;
	const metricError = row.props?._metricError as string | null | undefined;
	const metricDataType = row.props?._metricDataType as string | undefined;
	const metricOperation = row.props?._metricOperation as string | undefined;
	const notes = row.notes ?? [];
	const notesCount = notes.length;

	// Create card container
	const card = container.createDiv({ cls: "prop-charts-metric-card" });
	if (background) {
		card.style.backgroundColor = background;
	}

	// Determine display value
	let displayValue: string = "–";
	let subtext: string = "";
	let hasError = false;

	if (metricError) {
		// Error state
		displayValue = "–";
		subtext = metricError;
		hasError = true;
	} else if (notesCount === 0) {
		// No notes found
		displayValue = "–";
		subtext = "No notes found";
	} else if (metricValue == null) {
		// No valid values
		displayValue = "0";
		subtext = "No valid values (property empty or invalid)";
	} else {
		// Valid value
		if (metricValue instanceof Date) {
			displayValue = formatDate(metricValue);
			if (metricOperation === "oldest") {
				subtext = "Oldest";
			} else if (metricOperation === "newest") {
				subtext = "Newest";
			}
		} else if (typeof metricValue === "number") {
			// Special handling for dateRange (shows as number of days)
			if (metricOperation === "dateRange") {
				displayValue = formatNumber(metricValue, decimals, prefix, suffix);
				subtext = "Days";
			} else {
				displayValue = formatNumber(metricValue, decimals, prefix, suffix);
			}
		} else {
			displayValue = String(metricValue);
		}

		// Add subtext with note count
		if (subtext) {
			subtext += ` • ${notesCount} note${notesCount === 1 ? "" : "s"}`;
		} else {
			subtext = `${notesCount} note${notesCount === 1 ? "" : "s"}`;
		}
	}

	// Create content structure
	const content = card.createDiv({ cls: "prop-charts-metric-content" });

	// Label (above or below)
	if (label) {
		const labelEl = content.createDiv({ cls: "prop-charts-metric-label" });
		labelEl.textContent = label;
		if (labelPosition === "below") {
			labelEl.style.order = "3";
		}
	}

	// Main value
	const valueEl = content.createDiv({ cls: "prop-charts-metric-value" });
	valueEl.textContent = displayValue;
	valueEl.style.color = hasError ? "var(--text-error, #ff6b6b)" : color;
	valueEl.style.cursor = notesCount > 0 && !hasError ? "pointer" : "default";

	// Subtext
	if (subtext) {
		const subtextEl = content.createDiv({ cls: "prop-charts-metric-subtext" });
		subtextEl.textContent = subtext;
		if (hasError) {
			subtextEl.style.color = "var(--text-error, #ff6b6b)";
		}
	}

	// Info icon and tooltip
	const infoIcon = card.createDiv({ cls: "prop-charts-metric-info" });
	infoIcon.textContent = "ⓘ";
	infoIcon.style.cursor = "help";

	const tooltip = card.createDiv({ cls: "prop-charts-metric-tooltip" });
	tooltip.style.display = "none";

	// Build tooltip text
	const tooltipParts: string[] = [];
	if (metricDataType) {
		tooltipParts.push(`Data type: ${metricDataType}`);
	}
	if (metricOperation) {
		tooltipParts.push(`Operation: ${getOperationName(metricOperation)}`);
	}
	tooltipParts.push(`Notes: ${notesCount}`);
	const tooltipText = tooltipParts.join("\n");

	infoIcon.addEventListener("mouseenter", (ev: MouseEvent) => {
		const rect = card.getBoundingClientRect();
		tooltip.textContent = tooltipText;
		tooltip.style.display = "block";
		const tooltipRect = tooltip.getBoundingClientRect();
		let x = ev.clientX - rect.left + 6;
		let y = ev.clientY - rect.top + 6;
		if (x + tooltipRect.width > rect.width - 4) {
			x = rect.width - tooltipRect.width - 4;
		}
		if (x < 4) x = 4;
		if (y + tooltipRect.height > rect.height - 4) {
			y = rect.height - tooltipRect.height - 4;
		}
		if (y < 4) y = 4;
		tooltip.style.left = x + "px";
		tooltip.style.top = y + "px";
	});

	infoIcon.addEventListener("mouseleave", () => {
		tooltip.style.display = "none";
	});

	// Click handler for drilldown
	if (notesCount > 0 && !hasError) {
		valueEl.addEventListener("click", () => {
			openDetails(container, container.createDiv({ cls: "chart-notes-details" }), label || "Metric", typeof metricValue === "number" ? metricValue : 0, notes, true);
		});
		card.style.cursor = "pointer";
		card.addEventListener("click", () => {
			openDetails(container, container.createDiv({ cls: "chart-notes-details" }), label || "Metric", typeof metricValue === "number" ? metricValue : 0, notes, true);
		});
	}
}

