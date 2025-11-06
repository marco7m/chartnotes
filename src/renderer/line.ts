// src/renderer/line.ts
import type { ChartSpec, QueryResult, QueryResultRow } from "../types";
import {
	ensureContainer,
	colorFor,
	showTooltip,
	hideTooltip,
	openDetails,
	DEFAULT_H,
} from "./renderer-common";

export function renderLine(
	container: HTMLElement,
	spec: ChartSpec,
	data: QueryResult,
	isArea: boolean
): void {
	const opts: any = spec.options ?? {};
	const background: string | undefined = opts.background;
	const drilldown: boolean = opts.drilldown ?? true;

	const rows = data.rows ?? [];
	if (!rows.length) {
		container.createDiv({ cls: "prop-charts-empty", text: "Sem dados." });
		return;
	}

	const { inner, svg, tooltip, details } = ensureContainer(
		container,
		background
	);
	const vw = container.getBoundingClientRect().width || 600;
	const width = Math.max(vw, 480);
	inner.style.width = width + "px";

	const PAD_L2 = 40;
	const PAD_R2 = 16;
	const PAD_T2 = 18;
	const PAD_B2 = 24;

	const height = DEFAULT_H;
	svg.setAttribute("height", String(height));

	const plotW = width - PAD_L2 - PAD_R2;
	const plotH = height - PAD_T2 - PAD_B2;

	const seriesMap = new Map<string, QueryResultRow[]>();
	for (const r of rows) {
		const key = r.series != null ? String(r.series) : "__default__";
		const arr = seriesMap.get(key) ?? [];
		arr.push(r);
		seriesMap.set(key, arr);
	}
	const seriesKeys = Array.from(seriesMap.keys());

	const xValues: any[] = [];
	const seenX = new Set<string>();
	for (const r of rows) {
		const k = String(r.x);
		if (!seenX.has(k)) {
			seenX.add(k);
			xValues.push(r.x);
		}
	}

	const nCats = xValues.length || 1;

	const xScale = (x: any) => {
		const key = String(x);
		const idx = xValues.findIndex((v) => String(v) === key);
		if (idx < 0) return PAD_L2;
		if (nCats === 1) return PAD_L2 + plotW / 2;
		return PAD_L2 + (idx / (nCats - 1)) * plotW;
	};

	const xLabelOf = (x: any) => String(x);

	let minY = Number.POSITIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const r of rows) {
		if (r.y < minY) minY = r.y;
		if (r.y > maxY) maxY = r.y;
	}
	if (!isFinite(minY) || !isFinite(maxY)) {
		minY = 0;
		maxY = 1;
	}
	if (minY === maxY) {
		if (minY === 0) {
			maxY = 1;
		} else {
			minY = 0;
		}
	}

	const yScale = (v: number) =>
		PAD_T2 + plotH - ((v - minY) / (maxY - minY || 1)) * plotH;

	const yTicks = 4;
	for (let i = 0; i <= yTicks; i++) {
		const t = minY + ((maxY - minY) * i) / yTicks;
		const y = yScale(t);

		const line = document.createElementNS(svg.namespaceURI, "line");
		line.setAttribute("x1", String(PAD_L2));
		line.setAttribute("y1", String(y));
		line.setAttribute("x2", String(width - PAD_R2));
		line.setAttribute("y2", String(y));
		line.setAttribute("stroke", "#cccccc");
		line.setAttribute("stroke-opacity", "0.25");
		svg.appendChild(line);

		const label = document.createElementNS(svg.namespaceURI, "text");
		label.setAttribute("x", String(PAD_L2 - 4));
		label.setAttribute("y", String(y + 3));
		label.setAttribute("text-anchor", "end");
		label.setAttribute("font-size", "10");
		label.setAttribute("fill", "#111111");
		label.textContent =
			Math.abs(t) >= 100
				? String(Math.round(t))
				: String(Math.round(t * 10) / 10);
		svg.appendChild(label);
	}

	const displaySeriesNames = seriesKeys.filter((k) => k !== "__default__");
	if (displaySeriesNames.length > 1) {
		const legend = container.createDiv({ cls: "chart-notes-legend" });
		displaySeriesNames.forEach((key, idx) => {
			const label = key;
			const item = legend.createDiv({ cls: "chart-notes-legend-item" });
			const swatch = item.createDiv();
			swatch.style.width = "10px";
			swatch.style.height = "10px";
			swatch.style.borderRadius = "999px";
			swatch.style.backgroundColor = colorFor(label, idx);
			item.createSpan({ text: label });
		});
	}

	seriesKeys.forEach((sKey, sIndex) => {
		const seriesRows = seriesMap.get(sKey)!;
		if (!seriesRows?.length) return;

		const color =
			sKey === "__default__"
				? colorFor("line", sIndex)
				: colorFor(sKey, sIndex);

		const ordered = [...seriesRows].sort((a, b) => {
			const ia = xValues.findIndex((v) => String(v) === String(a.x));
			const ib = xValues.findIndex((v) => String(v) === String(b.x));
			return ia - ib;
		});

		let d = "";
		ordered.forEach((r, idx) => {
			const x = xScale(r.x);
			const y = yScale(r.y);
			d += (idx === 0 ? "M " : " L ") + x + " " + y;
		});

		if (isArea) {
			const first = ordered[0];
			const last = ordered[ordered.length - 1];
			const xFirst = xScale(first.x);
			const xLast = xScale(last.x);
			const baselineY = yScale(minY);

			d += ` L ${xLast} ${baselineY} L ${xFirst} ${baselineY} Z`;

			const path = document.createElementNS(
				svg.namespaceURI,
				"path"
			) as SVGPathElement;
			path.setAttribute("d", d);
			path.setAttribute("fill", color);
			path.setAttribute("fill-opacity", "0.18");
			path.setAttribute("stroke", color);
			path.setAttribute("stroke-width", "1.5");
			svg.appendChild(path);
		} else {
			const path = document.createElementNS(
				svg.namespaceURI,
				"path"
			) as SVGPathElement;
			path.setAttribute("d", d);
			path.setAttribute("fill", "none");
			path.setAttribute("stroke", color);
			path.setAttribute("stroke-width", "2");
			svg.appendChild(path);
		}

		ordered.forEach((r) => {
			const x = xScale(r.x);
			const y = yScale(r.y);

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

			const xLabel = xLabelOf(r.x);
			const sName = sKey === "__default__" ? "" : String(r.series);
			const title = sName ? `${sName} @ ${xLabel}` : xLabel;
			const body = `valor: ${Math.round(r.y * 100) / 100}`;

			dot.addEventListener("mouseenter", (ev: MouseEvent) =>
				showTooltip(
					container,
					tooltip,
					title,
					body,
					r.notes?.length ?? 0,
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
					r.y,
					r.notes ?? [],
					drilldown
				);
			});

			svg.appendChild(dot);
		});
	});
}
