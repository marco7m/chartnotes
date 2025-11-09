// src/renderer/line.ts

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

type AnyRow = {
	x: any;
	y: number;
	series?: any;
	notes?: string[];
};

/**
 * Tenta interpretar um valor como data.
 * - Se já for Date válida → devolve como está.
 * - Se for string tipo ISO/AAAA-MM-DD → tenta fazer new Date().
 * - Caso contrário → null.
 */
function parseDateLike(value: any): Date | null {
	if (!value) return null;

	if (value instanceof Date) {
		const t = value.getTime();
		return Number.isNaN(t) ? null : value;
	}

	if (typeof value === "string") {
		const s = value.trim();
		if (!s) return null;

		// Evita tratar números puros como milissegundo por acidente
		if (/^\d+$/.test(s)) return null;

		const d = new Date(s);
		if (!Number.isNaN(d.getTime())) return d;
	}

	return null;
}

export function renderLine(
	container: HTMLElement,
	spec: ChartSpec,
	data: QueryResult,
	isArea: boolean
): void {
	const opts: any = spec.options ?? {};
	const background: string | undefined = opts.background;
	const drilldown: boolean = opts.drilldown ?? true;

	const rows = (data.rows ?? []) as AnyRow[];
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
	const PAD_B2 = 28;

	const height = DEFAULT_H;
	svg.setAttribute("height", String(height));

	const plotW = width - PAD_L2 - PAD_R2;
	const plotH = height - PAD_T2 - PAD_B2;

	// --- Detectar se o eixo X é temporal ---
	const parsedDates = rows
		.map((r) => parseDateLike(r.x))
		.filter((d): d is Date => !!d);

	const isDateAxis =
		parsedDates.length >= 2 &&
		parsedDates.length >= rows.length * 0.6; // pelo menos 60% dos pontos têm data válida

	// --- Agrupar por série ---
	const seriesMap = new Map<string, AnyRow[]>();

	for (const r of rows) {
		const key =
			r.series != null && r.series !== ""
				? String(r.series)
				: "__default__";
		const arr = seriesMap.get(key) ?? [];
		arr.push(r);
		seriesMap.set(key, arr);
	}

	const seriesKeys = Array.from(seriesMap.keys());

	// --- Escala X (data vs categórico) ---
	let xScale: (x: any) => number;
	let xLabelOf: (x: any) => string;

	if (isDateAxis) {
		// Escala temporal contínua
		const DAY = 24 * 60 * 60 * 1000;

		const timestamps = parsedDates
			.map((d) => d.getTime())
			.sort((a, b) => a - b);

		let minTs = timestamps[0];
		let maxTs = timestamps[timestamps.length - 1];

		if (minTs === maxTs) {
			// Todos os pontos no mesmo dia → dá uma “abrida” no range
			minTs -= DAY;
			maxTs += DAY;
		}

		const span = maxTs - minTs || DAY;
		const domainMin = minTs - span * 0.02;
		const domainMax = maxTs + span * 0.02;

		xScale = (x: any) => {
			const d = parseDateLike(x);
			if (!d) return PAD_L2;
			const ts = d.getTime();
			return (
				PAD_L2 +
				((ts - domainMin) / (domainMax - domainMin || 1)) * plotW
			);
		};

		xLabelOf = (x: any) => {
			const d = parseDateLike(x);
			return d ? formatDateShort(d) : String(x);
		};

		// Desenhar eixo X + ticks de data
		const axisY = PAD_T2 + plotH;

		const axisLine = document.createElementNS(
			svg.namespaceURI,
			"line"
		) as SVGLineElement;
		axisLine.setAttribute("x1", String(PAD_L2));
		axisLine.setAttribute("y1", String(axisY));
		axisLine.setAttribute("x2", String(width - PAD_R2));
		axisLine.setAttribute("y2", String(axisY));
		axisLine.setAttribute("stroke", "#111111");
		axisLine.setAttribute("stroke-width", "1");
		svg.appendChild(axisLine);

		// Ticks
		const spanDays = (domainMax - domainMin) / DAY;
		const idealPixelPerTick = 90;
		const maxTicks = Math.max(
			3,
			Math.min(10, Math.floor(plotW / idealPixelPerTick) || 3)
		);
		const rawStepDays = spanDays / maxTicks;

		const candidates = [1, 2, 3, 5, 7, 10, 14, 21, 30, 60, 90, 180, 365];
		let stepDays = candidates[candidates.length - 1];
		for (const c of candidates) {
			if (c >= rawStepDays) {
				stepDays = c;
				break;
			}
		}

		const floorToDay = (ts: number) => {
			const d = new Date(ts);
			d.setHours(0, 0, 0, 0);
			return d.getTime();
		};

		const firstTick = floorToDay(domainMin);
		for (
			let ts = firstTick;
			ts <= domainMax + 0.5 * DAY;
			ts += stepDays * DAY
		) {
			const x = PAD_L2 + ((ts - domainMin) / (domainMax - domainMin)) * plotW;

			// Linha vertical suave
			const grid = document.createElementNS(
				svg.namespaceURI,
				"line"
			) as SVGLineElement;
			grid.setAttribute("x1", String(x));
			grid.setAttribute("y1", String(PAD_T2));
			grid.setAttribute("x2", String(x));
			grid.setAttribute("y2", String(axisY));
			grid.setAttribute("stroke", "#111111");
			grid.setAttribute("stroke-opacity", "0.18");
			grid.setAttribute("stroke-dasharray", "2,4");
			svg.appendChild(grid);

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
			label.textContent = formatDateShort(new Date(ts));
			svg.appendChild(label);
		}
	} else {
		// Escala categórica (comportamento antigo)
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

		xScale = (x: any) => {
			const key = String(x);
			const idx = xValues.findIndex((v) => String(v) === key);
			if (idx < 0) return PAD_L2;
			if (nCats === 1) return PAD_L2 + plotW / 2;
			return PAD_L2 + (idx / (nCats - 1)) * plotW;
		};

		xLabelOf = (x: any) => String(x);
	}

	// --- Escala Y ---
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
		PAD_T2 +
		plotH -
		((v - minY) / (maxY - minY || 1)) * plotH;

	// Linhas horizontais de grade + labels
	const yTicks = 4;
	for (let i = 0; i <= yTicks; i++) {
		const t = minY + ((maxY - minY) * i) / yTicks;
		const y = yScale(t);

		const line = document.createElementNS(
			svg.namespaceURI,
			"line"
		) as SVGLineElement;
		line.setAttribute("x1", String(PAD_L2));
		line.setAttribute("y1", String(y));
		line.setAttribute("x2", String(width - PAD_R2));
		line.setAttribute("y2", String(y));
		line.setAttribute("stroke", "#cccccc");
		line.setAttribute("stroke-opacity", "0.25");
		svg.appendChild(line);

		const label = document.createElementNS(
			svg.namespaceURI,
			"text"
		) as SVGTextElement;
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

	// --- Legenda (multi-série) ---
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

	// --- Desenhar séries ---
	seriesKeys.forEach((sKey, sIndex) => {
		const seriesRows = seriesMap.get(sKey)!;
		if (!seriesRows?.length) return;

		const color =
			sKey === "__default__"
				? colorFor("line", sIndex)
				: colorFor(sKey, sIndex);

		// Ordenar por X (data ou categoria)
		const ordered = [...seriesRows];
		if (isDateAxis) {
			ordered.sort((a, b) => {
				const da = parseDateLike(a.x);
				const db = parseDateLike(b.x);
				const ta = da ? da.getTime() : 0;
				const tb = db ? db.getTime() : 0;
				return ta - tb;
			});
		} else {
			// Para categórico, mantemos a ordem original (já vem agregada e ordenada pelo query/sort.x)
			// Se quiser garantir, poderia ordenar por String(x), mas normalmente não é necessário.
		}

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

		// Pontos
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
