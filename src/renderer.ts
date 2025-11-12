// src/renderer.ts
import type { ChartSpec, QueryResult } from "./types";
import { renderGantt } from "./renderer/gantt";
import { renderBar, renderStackedBar } from "./renderer/bar";
import { renderLine, renderStackedArea } from "./renderer/line";
import { renderPie } from "./renderer/pie";
import { renderScatter } from "./renderer/scatter";
import type { RenderContext } from "./renderer/renderer-common";

export class PropChartsRenderer {
	render(
		container: HTMLElement,
		spec: ChartSpec,
		data: QueryResult,
		ctx?: RenderContext
	): void {
		const { title } = spec.options ?? {};
		container.empty();
		container.addClass("prop-charts-container");

		const header = container.createDiv({ cls: "prop-charts-title-row" });
		const titleEl = header.createDiv({ cls: "prop-charts-title" });
		if (title) {
			titleEl.textContent = title;
		}

		switch (spec.type) {
			case "bar":
				renderBar(container, spec, data);
				break;
			case "stacked-bar":
				renderStackedBar(container, spec, data);
				break;
			case "line":
				renderLine(container, spec, data, false);
				break;
			case "stacked-area":
				renderStackedArea(container, spec, data);
				break;
			case "pie":
				renderPie(container, spec, data);
				break;
			case "scatter":
				renderScatter(container, spec, data);
				break;
			case "gantt":
				renderGantt(container, spec, data, ctx);
				break;
			default:
				container.createDiv({
					text: "Chart Notes: tipo não suportado: " + spec.type,
				});
		}
	}
}

export type { RenderContext } from "./renderer/renderer-common";

