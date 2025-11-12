// src/renderer/pie.ts
import type { ChartSpec, QueryResult } from "../types";
import {
	ensureContainer,
	colorFor,
	showTooltip,
	hideTooltip,
	openDetails,
	isLightColor,
	PAD_B,
	PAD_T,
	DEFAULT_H,
} from "./renderer-common";

export function renderPie(
	container: HTMLElement,
	spec: ChartSpec,
	data: QueryResult
): void {
	const { background, drilldown = true } = spec.options ?? {};
	if (data.rows.length === 0) {
		container.createDiv({ cls: "prop-charts-empty", text: "No data available." });
		return;
	}

	const textColor = isLightColor(background) ? "#000000" : undefined;

	const vw = container.getBoundingClientRect().width || 600;
	const { inner, svg, tooltip, details } = ensureContainer(
		container,
		background
	);

	const width = Math.max(vw, 420);
	inner.style.width = width + "px";
	if (textColor) svg.style.color = textColor;

	const height = DEFAULT_H;
	const cx = width / 2;
	const cy = (height - PAD_B + PAD_T) / 2;
	const r = Math.min(width / 2 - 20, height / 2 - 20);

	const vals = data.rows.map((r) => Math.max(0, r.y));
	const total = vals.reduce((a, b) => a + b, 0) || 1;

	let acc = -Math.PI / 2;
	data.rows.forEach((row, idx) => {
		const label =
			row.x instanceof Date
				? row.x.toISOString().slice(0, 10)
				: String(row.x);
		const v = row.y;
		const angle = (v / total) * Math.PI * 2;

		const x1 = cx + r * Math.cos(acc);
		const y1 = cy + r * Math.sin(acc);
		const x2 = cx + r * Math.cos(acc + angle);
		const y2 = cy + r * Math.sin(acc + angle);
		const largeArc = angle > Math.PI ? 1 : 0;

		const path = document.createElementNS(
			svg.namespaceURI,
			"path"
		) as SVGPathElement;
		const d = [
			`M ${cx} ${cy}`,
			`L ${x1} ${y1}`,
			`A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
			"Z",
		].join(" ");
		path.setAttribute("d", d);
		path.setAttribute("fill", colorFor(row.series ?? label, idx));
		path.style.cursor = "pointer";

		path.addEventListener("mouseenter", (ev: MouseEvent) =>
			showTooltip(container, tooltip, label, v, row.notes?.length ?? 0, ev)
		);
		path.addEventListener("mouseleave", () => hideTooltip(tooltip));
		path.addEventListener("click", () =>
			openDetails(container, details, label, v, row.notes ?? [], drilldown)
		);

		svg.appendChild(path);
		acc += angle;
	});
}
