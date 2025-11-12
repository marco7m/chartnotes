// src/renderer/bar.ts

import type { ChartSpec, QueryResult, QueryResultRow } from "../types";
import {
	ensureContainer,
	colorFor,
	showTooltip,
	hideTooltip,
	openDetails,
	DEFAULT_H,
} from "./renderer-common";

export function renderBar(
	container: HTMLElement,
	spec: ChartSpec,
	data: QueryResult
): void {
	const opts: any = spec.options ?? {};
	const background: string | undefined = opts.background;
	const drilldown: boolean = opts.drilldown ?? true;

	const rows = data.rows ?? [];
	if (!rows.length) {
		container.createDiv({ cls: "prop-charts-empty", text: "No data available." });
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

	type CatGroup = { label: any; rows: QueryResultRow[] };
	const groupsMap = new Map<string, CatGroup>();

	for (const r of rows) {
		const key = String(r.x);
		const g = groupsMap.get(key) ?? { label: r.x, rows: [] };
		g.rows.push(r);
		groupsMap.set(key, g);
	}

	const catKeys = Array.from(groupsMap.keys()).sort((a, b) =>
		a < b ? -1 : a > b ? 1 : 0
	);
	const categories = catKeys.map((k) => groupsMap.get(k)!);
	const nCats = categories.length;

	const seriesKeyOf = (v: unknown) => String(v ?? "");

	const seriesSet = new Set<string>();
	rows.forEach((r) => {
		if (r.series != null) seriesSet.add(seriesKeyOf(r.series));
	});
	const seriesKeys = Array.from(seriesSet);

	const hasMultiSeries = seriesKeys.length > 1;
	const barMode: "single" | "grouped" = hasMultiSeries ? "grouped" : "single";

	let maxY = 0;
	rows.forEach((r) => {
		if (r.y > maxY) maxY = r.y;
	});
	if (!isFinite(maxY) || maxY <= 0) maxY = 1;

	const yScale = (v: number) => PAD_T2 + plotH - (v / (maxY || 1)) * plotH;
	const baselineY = yScale(0);

	const yTicks = 4;
	for (let i = 0; i <= yTicks; i++) {
		const t = (maxY * i) / yTicks;
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
		label.textContent = String(Math.round(t));
		svg.appendChild(label);
	}

	const step = nCats > 0 ? plotW / nCats : plotW;

	categories.forEach((cat, idx) => {
		const cx = PAD_L2 + step * (idx + 0.5);
		const xLabel = String(cat.label);

		const labelNode = document.createElementNS(svg.namespaceURI, "text");
		labelNode.setAttribute("x", String(cx));
		labelNode.setAttribute("y", String(height - PAD_B2 + 12));
		labelNode.setAttribute("text-anchor", "middle");
		labelNode.setAttribute("font-size", "10");
		labelNode.setAttribute("fill", "#111111");
		labelNode.textContent = xLabel;
		svg.appendChild(labelNode);
	});

	if (hasMultiSeries) {
		const legend = container.createDiv({ cls: "chart-notes-legend" });
		seriesKeys.forEach((sKey, idx) => {
			const item = legend.createDiv({ cls: "chart-notes-legend-item" });
			const swatch = item.createDiv();
			swatch.style.width = "10px";
			swatch.style.height = "10px";
			swatch.style.borderRadius = "999px";
			swatch.style.backgroundColor = colorFor(sKey, idx);
			item.createSpan({ text: sKey });
		});
	}

	categories.forEach((cat, catIndex) => {
		const cx = PAD_L2 + step * (catIndex + 0.5);
		const catRows = cat.rows;

		if (barMode === "single") {
			const r = catRows[0];
			const value = r.y;

			const barWidth = step * 0.6;
			const x0 = cx - barWidth / 2;
			const y1 = yScale(value);
			const h = Math.max(2, baselineY - y1);
			const color = colorFor("bar", catIndex);

			const rect = document.createElementNS(
				svg.namespaceURI,
				"rect"
			) as SVGRectElement;
			rect.setAttribute("x", String(x0));
			rect.setAttribute("y", String(y1));
			rect.setAttribute("width", String(barWidth));
			rect.setAttribute("height", String(h));
			rect.setAttribute("fill", color);
			rect.setAttribute("stroke", "rgba(0,0,0,0.25)");
			rect.setAttribute("stroke-width", "0.5");
			rect.style.cursor = "pointer";

			const title = String(cat.label);
			const body = `valor: ${Math.round(value * 100) / 100}`;

			rect.addEventListener("mouseenter", (ev: MouseEvent) =>
				showTooltip(
					container,
					tooltip,
					title,
					body,
					r.notes?.length ?? 0,
					ev
				)
			);
			rect.addEventListener("mouseleave", () => hideTooltip(tooltip));

			rect.addEventListener("click", (ev: MouseEvent) => {
				ev.preventDefault();
				openDetails(
					container,
					details,
					title,
					value,
					r.notes ?? [],
					drilldown
				);
			});

			svg.appendChild(rect);
			return;
		}

		const m = seriesKeys.length;
		const barWidth = step / Math.max(m + 1, 2);
		const groupWidth = m * barWidth;
		const startX = cx - groupWidth / 2;

		seriesKeys.forEach((sKey, sIndex) => {
			const row = catRows.find(
				(r) => r.series != null && seriesKeyOf(r.series) === sKey
			);
			if (!row) return;

			const value = row.y;
			const x0 = startX + sIndex * barWidth;
			const y1 = yScale(value);
			const h = Math.max(2, baselineY - y1);
			const color = colorFor(sKey, sIndex);

			const rect = document.createElementNS(
				svg.namespaceURI,
				"rect"
			) as SVGRectElement;
			rect.setAttribute("x", String(x0));
			rect.setAttribute("y", String(y1));
			rect.setAttribute("width", String(barWidth));
			rect.setAttribute("height", String(h));
			rect.setAttribute("fill", color);
			rect.setAttribute("stroke", "rgba(0,0,0,0.25)");
			rect.setAttribute("stroke-width", "0.5");
			rect.style.cursor = "pointer";

			const title = `${sKey} @ ${String(cat.label)}`;
			const body = `valor: ${Math.round(value * 100) / 100}`;

			rect.addEventListener("mouseenter", (ev: MouseEvent) =>
				showTooltip(
					container,
					tooltip,
					title,
					body,
					row.notes?.length ?? 0,
					ev
				)
			);
			rect.addEventListener("mouseleave", () => hideTooltip(tooltip));

			rect.addEventListener("click", (ev: MouseEvent) => {
				ev.preventDefault();
				openDetails(
					container,
					details,
					title,
					value,
					row.notes ?? [],
					drilldown
				);
			});

			svg.appendChild(rect);
		});
	});
}

export function renderStackedBar(
	container: HTMLElement,
	spec: ChartSpec,
	data: QueryResult
): void {
	const opts: any = spec.options ?? {};
	const background: string | undefined = opts.background;
	const drilldown: boolean = opts.drilldown ?? true;

	const rows = data.rows ?? [];
	if (!rows.length) {
		container.createDiv({ cls: "prop-charts-empty", text: "No data available." });
		return;
	}

	// --- Agrupamento + normalização ANTES de criar container
	type CatGroup = { label: any; rows: QueryResultRow[] };
	const groupsMap = new Map<string, CatGroup>();

	for (const r of rows) {
		const key = String(r.x);
		const g = groupsMap.get(key) ?? { label: r.x, rows: [] };
		g.rows.push(r);
		groupsMap.set(key, g);
	}

	const catKeys = Array.from(groupsMap.keys()).sort((a, b) =>
		a < b ? -1 : a > b ? 1 : 0
	);
	const categories = catKeys.map((k) => groupsMap.get(k)!);
	const nCats = categories.length;

	const keyOf = (v: unknown) => String(v ?? "");
	const seriesSet = new Set<string>(rows.map((r) => keyOf(r.series)));
	const seriesKeys = Array.from(seriesSet);

	// Se só temos a chave vazia, não há séries de fato → cai para bar normal
	if (seriesKeys.length === 1 && seriesKeys[0] === "") {
		renderBar(container, spec, data);
		return;
	}

	// --- A partir daqui criamos o container/SVG
	const { inner, svg, tooltip, details } = ensureContainer(
		container,
		background
	);
	const vw = container.getBoundingClientRect().width || 600;
	const width = Math.max(vw, 480);
	inner.style.width = width + "px";
	svg.setAttribute("width", String(width)); // por segurança
	const PAD_L2 = 40,
		PAD_R2 = 16,
		PAD_T2 = 18,
		PAD_B2 = 28;
	const height = DEFAULT_H;
	svg.setAttribute("height", String(height));

	const plotW = width - PAD_L2 - PAD_R2;
	const plotH = height - PAD_T2 - PAD_B2;

	let maxY = 0;
	categories.forEach((cat) => {
		const sum = cat.rows.reduce((acc, r) => acc + (r.y || 0), 0);
		if (sum > maxY) maxY = sum;
	});
	if (!isFinite(maxY) || maxY <= 0) maxY = 1;

	const yScale = (v: number) => PAD_T2 + plotH - (v / (maxY || 1)) * plotH;

	// Eixo Y
	const yTicks = 4;
	for (let i = 0; i <= yTicks; i++) {
		const t = (maxY * i) / yTicks;
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
		label.textContent = String(Math.round(t));
		svg.appendChild(label);
	}

	const step = nCats > 0 ? plotW / nCats : plotW;

	// X labels
	categories.forEach((cat, idx) => {
		const cx = PAD_L2 + step * (idx + 0.5);
		const xLabel = String(cat.label);

		const labelNode = document.createElementNS(svg.namespaceURI, "text");
		labelNode.setAttribute("x", String(cx));
		labelNode.setAttribute("y", String(height - PAD_B2 + 12));
		labelNode.setAttribute("text-anchor", "middle");
		labelNode.setAttribute("font-size", "10");
		labelNode.setAttribute("fill", "#111111");
		labelNode.textContent = xLabel;
		svg.appendChild(labelNode);
	});

	// Legenda dentro do inner (evita bagunçar layout)
	const legend = inner.createDiv({ cls: "chart-notes-legend" });
	seriesKeys.forEach((sKey, idx) => {
		if (sKey === "") return; // não mostrar bucket vazio
		const item = legend.createDiv({ cls: "chart-notes-legend-item" });
		const swatch = item.createDiv();
		swatch.style.width = "10px";
		swatch.style.height = "10px";
		swatch.style.borderRadius = "999px";
		swatch.style.backgroundColor = colorFor(sKey, idx);
		item.createSpan({ text: sKey });
	});

	// Barras empilhadas
	categories.forEach((cat, catIndex) => {
		const cx = PAD_L2 + step * (catIndex + 0.5);
		const barWidth = step * 0.6;
		const x0 = cx - barWidth / 2;

		let acc = 0;

		seriesKeys.forEach((sKey, sIndex) => {
			if (sKey === "") return; // ignora bucket vazio
			const row = cat.rows.find((r) => keyOf(r.series) === sKey);
			if (!row) return;

			const v = row.y || 0;
			const vStart = acc;
			const vEnd = acc + v;
			acc = vEnd;

			const y0 = yScale(vStart);
			const y1 = yScale(vEnd);
			const h = Math.max(2, y0 - y1);
			const color = colorFor(sKey, sIndex);

			const rect = document.createElementNS(
				svg.namespaceURI,
				"rect"
			) as SVGRectElement;
			rect.setAttribute("x", String(x0));
			rect.setAttribute("y", String(y1));
			rect.setAttribute("width", String(barWidth));
			rect.setAttribute("height", String(h));
			rect.setAttribute("fill", color);
			rect.setAttribute("stroke", "rgba(0,0,0,0.25)");
			rect.setAttribute("stroke-width", "0.5");
			rect.style.cursor = "pointer";

			const title = `${sKey} @ ${String(cat.label)}`;
			const body = `valor: ${Math.round(v * 100) / 100}`;

			rect.addEventListener("mouseenter", (ev: MouseEvent) =>
				showTooltip(
					container,
					tooltip as HTMLElement,
					title,
					body,
					row.notes?.length ?? 0,
					ev
				)
			);
			rect.addEventListener("mouseleave", () => hideTooltip(tooltip));
			rect.addEventListener("click", (ev: MouseEvent) => {
				ev.preventDefault();
				openDetails(
					container,
					details,
					title,
					v,
					row.notes ?? [],
					drilldown
				);
			});

			svg.appendChild(rect);
		});
	});
}

