// src/renderer.ts
import type { ChartSpec, QueryResult, QueryResultRow } from "./types";
import { renderGantt } from "./renderer/gantt";
import {
  DEFAULT_H,
  colorFor,
  ensureContainer,
  showTooltip,
  hideTooltip,
  openDetails,
  isLightColor,
  RenderContext as CommonRenderContext,
} from "./renderer/renderer-common";
import { App, Modal } from "obsidian";

declare const app: App;

// reexport para quem importa de "../renderer"
export type RenderContext = CommonRenderContext;

const PAD_L = 48;
const PAD_R = 10;
const PAD_T = 28;
const PAD_B = 28;

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
        this.renderBar(container, spec, data);
        break;
      case "line":
        this.renderLine(container, spec, data, false);
        break;
      case "area":
        this.renderLine(container, spec, data, true);
        break;
      case "pie":
        this.renderPie(container, spec, data);
        break;
      case "scatter":
        this.renderScatter(container, spec, data);
        break;
      case "table":
        this.renderTable(container, spec, data);
        break;
      case "gantt":
        renderGantt(container, spec, data, ctx);
        break;
      case "stacked-bar":
        this.renderStackedBar(container, spec, data);
        break;
      default:
        container.createDiv({
          text: "Chart Notes: tipo não suportado: " + spec.type,
        });
    }

    // botão de fullscreen (zoom) – só no modo normal
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

  // ---------------------------------------------------------------------------
  // BAR
  // ---------------------------------------------------------------------------
  private renderBar(
    container: HTMLElement,
    spec: ChartSpec,
    data: QueryResult
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
    const PAD_B2 = 28;

    const height = DEFAULT_H;
    svg.setAttribute("height", String(height));

    const plotW = width - PAD_L2 - PAD_R2;
    const plotH = height - PAD_T2 - PAD_B2;

    type CatGroup = { label: unknown; rows: QueryResultRow[] };
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

    const seriesSet = new Set<string>();
    rows.forEach((r) => {
      if (r.series != null) seriesSet.add(String(r.series));
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

    // grid Y
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const t = (maxY * i) / yTicks;
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
      label.textContent = String(Math.round(t));
      svg.appendChild(label);
    }

    const step = nCats > 0 ? plotW / nCats : plotW;

    // labels X
    categories.forEach((cat, idx) => {
      const cx = PAD_L2 + step * (idx + 0.5);
      const xLabel = String(cat.label);

      const labelNode = document.createElementNS(
        svg.namespaceURI,
        "text"
      ) as SVGTextElement;
      labelNode.setAttribute("x", String(cx));
      labelNode.setAttribute("y", String(height - PAD_B2 + 12));
      labelNode.setAttribute("text-anchor", "middle");
      labelNode.setAttribute("font-size", "10");
      labelNode.setAttribute("fill", "#111111");
      labelNode.textContent = xLabel;
      svg.appendChild(labelNode);
    });

    // legenda multi-série
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

    // barras
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

      // grouped bar
      const m = seriesKeys.length;
      const barWidth = step / Math.max(m + 1, 2);
      const groupWidth = m * barWidth;
      const startX = cx - groupWidth / 2;

      seriesKeys.forEach((sKey, sIndex) => {
        const row = catRows.find(
          (rr) => (rr.series != null ? String(rr.series) : "") === sKey
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

  // ---------------------------------------------------------------------------
  // STACKED BAR
  // ---------------------------------------------------------------------------
  private renderStackedBar(
    container: HTMLElement,
    spec: ChartSpec,
    data: QueryResult
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
    const PAD_B2 = 28;

    const height = DEFAULT_H;
    svg.setAttribute("height", String(height));

    const plotW = width - PAD_L2 - PAD_R2;
    const plotH = height - PAD_T2 - PAD_B2;

    type CatGroup = { label: unknown; rows: QueryResultRow[] };
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

    const seriesSet = new Set<string>();
    rows.forEach((r) => {
      if (r.series != null) seriesSet.add(String(r.series));
    });
    const seriesKeys = Array.from(seriesSet);

    if (!seriesKeys.length) {
      this.renderBar(container, spec, data);
      return;
    }

    let maxY = 0;
    categories.forEach((cat) => {
      const sum = cat.rows.reduce((acc, r) => acc + r.y, 0);
      if (sum > maxY) maxY = sum;
    });
    if (!isFinite(maxY) || maxY <= 0) maxY = 1;

    const yScale = (v: number) => PAD_T2 + plotH - (v / (maxY || 1)) * plotH;

    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const t = (maxY * i) / yTicks;
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
      label.textContent = String(Math.round(t));
      svg.appendChild(label);
    }

    const step = nCats > 0 ? plotW / nCats : plotW;

    // labels X
    categories.forEach((cat, idx) => {
      const cx = PAD_L2 + step * (idx + 0.5);
      const xLabel = String(cat.label);

      const labelNode = document.createElementNS(
        svg.namespaceURI,
        "text"
      ) as SVGTextElement;
      labelNode.setAttribute("x", String(cx));
      labelNode.setAttribute("y", String(height - PAD_B2 + 12));
      labelNode.setAttribute("text-anchor", "middle");
      labelNode.setAttribute("font-size", "10");
      labelNode.setAttribute("fill", "#111111");
      labelNode.textContent = xLabel;
      svg.appendChild(labelNode);
    });

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

    // barras empilhadas
    categories.forEach((cat, catIndex) => {
      const cx = PAD_L2 + step * (catIndex + 0.5);
      const barWidth = step * 0.6;
      const x0 = cx - barWidth / 2;

      let acc = 0;

      seriesKeys.forEach((sKey, sIndex) => {
        const row = cat.rows.find(
          (rr) => (rr.series != null ? String(rr.series) : "") === sKey
        );
        if (!row) return;

        const v = row.y;
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
            v,
            row.notes ?? [],
            drilldown
          );
        });

        svg.appendChild(rect);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // LINE / AREA
  // ---------------------------------------------------------------------------
  private renderLine(
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

    const xValues: unknown[] = [];
    const seenX = new Set<string>();
    for (const r of rows) {
      const k = String(r.x);
      if (!seenX.has(k)) {
        seenX.add(k);
        xValues.push(r.x);
      }
    }

    const nCats = xValues.length || 1;

    const xScale = (x: unknown) => {
      const key = String(x);
      const idx = xValues.findIndex((v) => String(v) === key);
      if (idx < 0) return PAD_L2;
      if (nCats === 1) return PAD_L2 + plotW / 2;
      return PAD_L2 + (idx / (nCats - 1)) * plotW;
    };

    const xLabelOf = (x: unknown) => String(x);

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

  // ---------------------------------------------------------------------------
  // PIE
  // ---------------------------------------------------------------------------
  private renderPie(
    container: HTMLElement,
    spec: ChartSpec,
    data: QueryResult
  ): void {
    const { background, drilldown = true } = spec.options ?? {};
    if (data.rows.length === 0) {
      container.createDiv({ cls: "prop-charts-empty", text: "Sem dados." });
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

    const vals = data.rows.map((r2) => Math.max(0, r2.y));
    const total = vals.reduce((a, b) => a + b, 0) || 1;

    let acc = -Math.PI / 2;
    data.rows.forEach((row, idx) => {
      const label =
        row.x instanceof Date ? row.x.toISOString().slice(0, 10) : String(row.x);
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
      path.addEventListener("click", (ev: MouseEvent) => {
        ev.preventDefault();
        openDetails(container, details, label, v, row.notes ?? [], drilldown);
      });

      svg.appendChild(path);
      acc += angle;
    });
  }

  // ---------------------------------------------------------------------------
  // SCATTER
  // ---------------------------------------------------------------------------
  private renderScatter(
    container: HTMLElement,
    spec: ChartSpec,
    data: QueryResult
  ): void {
    const { background, drilldown = true } = spec.options ?? {};
    if (data.rows.length === 0) {
      container.createDiv({ cls: "prop-charts-empty", text: "Sem dados." });
      return;
    }

    const textColor = isLightColor(background) ? "#000000" : undefined;

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
        text: "Sem dados (X não é numérico/data).",
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

    const axisY = document.createElementNS(
      svg.namespaceURI,
      "line"
    ) as SVGLineElement;
    axisY.setAttribute("x1", String(PAD_L));
    axisY.setAttribute("y1", String(PAD_T));
    axisY.setAttribute("x2", String(PAD_L));
    axisY.setAttribute("y2", String(height - PAD_B));
    axisY.setAttribute("stroke", "currentColor");
    svg.appendChild(axisY);

    const axisX = document.createElementNS(
      svg.namespaceURI,
      "line"
    ) as SVGLineElement;
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

  // ---------------------------------------------------------------------------
  // TABLE
  // ---------------------------------------------------------------------------
  private renderTable(
    container: HTMLElement,
    spec: ChartSpec,
    data: QueryResult
  ): void {
    const { background } = spec.options ?? {};
    const { inner } = ensureContainer(container, background);

    const table = inner.createEl("table", { cls: "chart-notes-table" });
    const thead = table.createEl("thead");
    const htr = thead.createEl("tr");
    htr.createEl("th", { text: "X" });
    htr.createEl("th", { text: "Y" });
    htr.createEl("th", { text: "Notas" });

    const tbody = table.createEl("tbody");
    for (const row of data.rows) {
      const tr = tbody.createEl("tr");
      tr.createEl("td", {
        text:
          row.x instanceof Date ? row.x.toISOString().slice(0, 10) : String(row.x),
      });
      tr.createEl("td", { text: String(row.y) });
      const ntd = tr.createEl("td");
      for (const n of row.notes ?? []) {
        const a = ntd.createEl("a", { text: n, href: "#" });
        a.addEventListener("click", (ev: MouseEvent) => {
          ev.preventDefault();
          app.workspace.openLinkText(n, "", false);
        });
        ntd.createSpan({ text: " " });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Modal de zoom (fullscreen dos gráficos)
// ---------------------------------------------------------------------------
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

  onOpen(): void {
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

  onClose(): void {
    this.contentEl.empty();
  }

  private applySize(): void {
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

