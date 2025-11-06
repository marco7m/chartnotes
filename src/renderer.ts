// src/renderer.ts
import type { ChartSpec, QueryResult } from "./types";
import { renderGantt } from "./renderer/gantt";
import { renderBar, renderStackedBar } from "./renderer/bar";
import { renderLine } from "./renderer/line";
import { renderPie } from "./renderer/pie";
import { renderScatter } from "./renderer/scatter";
import type { RenderContext } from "./renderer/renderer-common";
import { App, Modal } from "obsidian";

declare const app: App;

export class PropChartsRenderer {
	render(
		container: HTMLElement,
		spec: ChartSpec,
		data: QueryResult,
		ctx?: RenderContext,
		isZoom: boolean = false
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
			case "area":
				renderLine(container, spec, data, true);
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

		if (!isZoom) {
			const zoomBtn = container.createEl("button", {
				cls: "chart-notes-zoom-button",
			});
			zoomBtn.setAttr("type", "button");
			zoomBtn.setAttr("aria-label", "Expandir gráfico");
			zoomBtn.textContent = "⤢";

			zoomBtn.addEventListener("click", (ev: MouseEvent) => {
				ev.preventDefault();
				new ChartNotesZoomModal(spec, data, this, ctx).open();
			});
		}
	}
}

class ChartNotesZoomModal extends Modal {
	private spec: ChartSpec;
	private data: QueryResult;
	private renderer: PropChartsRenderer;
	private ctx?: RenderContext;

	private size: "small" | "medium" | "large" = "large";

	constructor(
		spec: ChartSpec,
		data: QueryResult,
		renderer: PropChartsRenderer,
		ctx?: RenderContext
	) {
		super(app);
		this.spec = spec;
		this.data = data;
		this.renderer = renderer;
		this.ctx = ctx;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		this.modalEl.addClass("chart-notes-zoom-modal-shell");
		contentEl.addClass("chart-notes-zoom-modal");
		this.applySize();

		const header = contentEl.createDiv({ cls: "chart-notes-zoom-header" });

		const title =
			this.spec.options?.title && this.spec.options.title.trim().length > 0
				? this.spec.options.title
				: "Chart Notes";

		header.createEl("div", {
			text: title,
			cls: "chart-notes-zoom-title",
		});

		const sizeControls = header.createDiv({
			cls: "chart-notes-zoom-sizes",
		});
		const makeSizeButton = (
			label: string,
			size: "small" | "medium" | "large"
		) => {
			const btn = sizeControls.createEl("button", {
				cls: "chart-notes-zoom-size-btn",
				text: label,
			});
			const refreshActive = () => {
				btn.toggleClass("is-active", this.size === size);
			};
			refreshActive();
			btn.addEventListener("click", (ev: MouseEvent) => {
				ev.preventDefault();
				this.size = size;
				this.applySize();
				const siblings = sizeControls.querySelectorAll(
					".chart-notes-zoom-size-btn"
				);
				siblings.forEach((el: Element) =>
					el.classList.remove("is-active")
				);
				btn.classList.add("is-active");
			});
		};

		makeSizeButton("S", "small");
		makeSizeButton("M", "medium");
		makeSizeButton("L", "large");

		const body = contentEl.createDiv({ cls: "chart-notes-zoom-body" });

		this.renderer.render(body, this.spec, this.data, this.ctx, true);
	}

	onClose() {
		this.contentEl.empty();
	}

	private applySize() {
		const el = this.modalEl as HTMLElement;
		if (!el) return;

		let w = "95vw";
		let h = "85vh";

		switch (this.size) {
			case "small":
				w = "60vw";
				h = "55vh";
				break;
			case "medium":
				w = "80vw";
				h = "70vh";
				break;
			case "large":
			default:
				w = "95vw";
				h = "85vh";
				break;
		}

		el.style.maxWidth = w;
		el.style.width = w;
		el.style.height = h;
		el.style.maxHeight = h;
	}
}

export type { RenderContext } from "./renderer/renderer-common";
