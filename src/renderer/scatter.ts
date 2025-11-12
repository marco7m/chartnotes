// src/renderer/scatter.ts
import type { ChartSpec, QueryResult } from "../types";
import {
	ensureContainer,
	colorFor,
	showTooltip,
	hideTooltip,
	openDetails,
	PAD_L,
	PAD_R,
	PAD_T,
	PAD_B,
	DEFAULT_H,
} from "./renderer-common";

export function renderScatter(
	container: HTMLElement,
	spec: ChartSpec,
	data: QueryResult
): void {
	const { background, drilldown = true } = spec.options ?? {};
	if (data.rows.length === 0) {
		container.createDiv({ cls: "prop-charts-empty", text: "No data available." });
		return;
	}

	const textColor = background ? "#111111" : undefined;

	const vw = container.getBoundingClientRect().width || 600;
	const { inner, svg, tooltip, details } = ensureContainer(
		container,
		background
	);
	const width = Math.max(vw, 700);
	inner.style.width = width + "px";
	if (textColor) svg.style.color = textColor;

	const height = DEFAULT_H;
	const plotW = width - PAD_L - PAD_R;
	const plotH = height - PAD_T - PAD_B;

	const xs = data.rows.map((r) => {
		const v = r.x;
		if (v instanceof Date) return v.getTime();
		if (typeof v === "string") {
			if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
				const d = new Date(v);
				if (!isNaN(d.getTime())) return d.getTime();
			}
			const num = Number(v);
			if (!isNaN(num)) return num;
			return null;
		}
		if (typeof v === "number") return v;
		return null;
	});

	const ys = data.rows.map((r) => r.y);
	const xsNum = xs.filter((v): v is number => v !== null);
	if (xsNum.length === 0) {
		container.createDiv({
			cls: "prop-charts-empty",
			text: "No data (X is not numeric/date).",
		});
		return;
	}

	const xMin = Math.min(...xsNum);
	const xMax = Math.max(...xsNum);
	const yMin = Math.min(...ys);
	const yMax = Math.max(...ys);

	const xScale = (val: number) =>
		PAD_L + ((val - xMin) / (xMax - xMin || 1)) * plotW;
	const yScale = (val: number) =>
		height - PAD_B - ((val - yMin) / (yMax - yMin || 1)) * plotH;

	const axisY = document.createElementNS(svg.namespaceURI, "line");
	axisY.setAttribute("x1", String(PAD_L));
	axisY.setAttribute("y1", String(PAD_T));
	axisY.setAttribute("x2", String(PAD_L));
	axisY.setAttribute("y2", String(height - PAD_B));
	axisY.setAttribute("stroke", "currentColor");
	svg.appendChild(axisY);

	const axisX = document.createElementNS(svg.namespaceURI, "line");
	axisX.setAttribute("x1", String(PAD_L));
	axisX.setAttribute("y1", String(height - PAD_B));
	axisX.setAttribute("x2", String(width - PAD_R));
	axisX.setAttribute("y2", String(height - PAD_B));
	axisX.setAttribute("stroke", "currentColor");
	svg.appendChild(axisX);

	data.rows.forEach((row, idx) => {
		const xv = xs[idx];
		if (xv == null) return;

		const cx = xScale(xv);
		const cy = yScale(ys[idx]);

		const dot = document.createElementNS(
			svg.namespaceURI,
			"circle"
		) as SVGCircleElement;
		dot.setAttribute("cx", String(cx));
		dot.setAttribute("cy", String(cy));
		dot.setAttribute("r", "4");
		dot.setAttribute("fill", colorFor(row.series, idx));
		dot.style.cursor = "pointer";

		const label =
			row.x instanceof Date
				? row.x.toISOString().slice(0, 10)
				: typeof row.x === "string"
				? row.x
				: String(row.x);

		dot.addEventListener("mouseenter", (ev: MouseEvent) =>
			showTooltip(container, tooltip, label, row.y, row.notes?.length ?? 0, ev)
		);
		dot.addEventListener("mouseleave", () => hideTooltip(tooltip));
		dot.addEventListener("click", (ev: MouseEvent) => {
			ev.preventDefault();
			openDetails(
				container,
				details,
				label,
				row.y,
				row.notes ?? [],
				drilldown
			);
		});

		svg.appendChild(dot);
	});
}
