// src/renderer.ts
import type { ChartSpec, QueryResult, QueryResultRow } from "./types";
import {
  App,
  TFile,
  parseYaml,
  stringifyYaml,
  Notice,
  Modal,
} from "obsidian";

declare const app: App;

const PAD_L = 48;
const PAD_R = 10;
const PAD_T = 28;
const PAD_B = 28;
const MIN_W_PER_POINT = 90;
const DEFAULT_H = 300;

const PALETTE = [
  "#5b6cff",
  "#5ec27f",
  "#ffb347",
  "#ff6b6b",
  "#b47cff",
  "#4dbbd5",
  "#f78fb3",
  "#50e3a4",
];

function colorFor(key: string | undefined, idx: number): string {
  if (!key) return "var(--text-accent, #5b6cff)";
  const h = Array.from(key).reduce(
    (a, c) => (a * 33 + c.charCodeAt(0)) >>> 0,
    0
  );
  return PALETTE[h % PALETTE.length];
}

function ensureContainer(container: HTMLElement, background?: string) {
  container.addClass("prop-charts-container");
  container.style.width = "100%";
  container.style.maxWidth = "100%";
  container.style.position = "relative";

  const scroll = container.createDiv({ cls: "chart-notes-scroll" });
  scroll.style.overflowX = "auto";
  scroll.style.overflowY = "hidden";
  scroll.style.width = "100%";
  scroll.style.maxWidth = "100%";

  const inner = scroll.createDiv({ cls: "chart-notes-inner" });
  inner.style.display = "block";
  inner.style.minHeight = `${DEFAULT_H}px`;
  if (background) inner.style.background = background;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", String(DEFAULT_H));
  svg.style.display = "block";
  inner.appendChild(svg);

  const tooltip = container.createDiv({ cls: "chart-notes-tooltip" });
  tooltip.style.display = "none";

  const details = container.createDiv({ cls: "chart-notes-details" });
  details.style.display = "none";

  return { scroll, inner, svg, tooltip, details };
}

function showTooltip(
  container: HTMLElement,
  tooltip: HTMLElement,
  label: string,
  value: string | number,
  notesLen: number,
  ev: MouseEvent
) {
  const rect = container.getBoundingClientRect();

  const valueHtml =
    typeof value === "number"
      ? Number.isInteger(value)
        ? String(value)
        : value.toFixed(2)
      : String(value);

  tooltip.innerHTML = `
    <div class="chart-notes-tooltip-title">${label}</div>
    <div class="chart-notes-tooltip-value">${valueHtml}</div>
    <div class="chart-notes-tooltip-notes">${notesLen} nota${
      notesLen === 1 ? "" : "s"
    }</div>
  `;

  tooltip.style.display = "block";

  const tRect = tooltip.getBoundingClientRect();

  let x = ev.clientX - rect.left + 6;
  let y = ev.clientY - rect.top + 6;

  if (x + tRect.width > rect.width - 4) {
    x = rect.width - tRect.width - 4;
  }
  if (x < 4) x = 4;

  if (y + tRect.height > rect.height - 4) {
    y = rect.height - tRect.height - 4;
  }
  if (y < 4) y = 4;

  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}

function hideTooltip(tooltip: HTMLElement) {
  tooltip.style.display = "none";
}

function openDetails(
  container: HTMLElement,
  details: HTMLElement,
  label: string,
  value: number,
  notes: string[],
  allow: boolean
) {
  if (!allow) return;
  details.empty();
  if (!notes || notes.length === 0) {
    details.style.display = "none";
    return;
  }
  details.style.display = "block";

  const header = details.createEl("div", { cls: "chart-notes-details-header" });
  const title = header.createEl("div", { cls: "chart-notes-details-title" });
  title.textContent =
    `Notas em "${label}" (${notes.length})` +
    (Number.isFinite(value) && value !== 0
      ? ` – valor ${Number.isInteger(value) ? value : value.toFixed(2)}`
      : "");

  const closeBtn = header.createEl("button", {
    cls: "chart-notes-details-close",
  });
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => {
    details.style.display = "none";
  });

  const list = details.createEl("ul", { cls: "chart-notes-details-list" });
  for (const n of notes) {
    const li = list.createEl("li", { cls: "chart-notes-details-item" });
    const link = li.createEl("a", {
      cls: "chart-notes-details-link",
      text: n,
    });
    link.href = "#";
    link.addEventListener("click", (ev: MouseEvent) => {
      ev.preventDefault();
      app.workspace.openLinkText(n, "", false);
    });
  }
}

function formatDateShort(d: Date): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return "";
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${day}/${month}`;
}

// label curta para gráfico
function prettifyLabelShort(raw: any): string {
  if (raw == null) return "";
  let s = String(raw).trim();
  if (!s) return "";

  const m = s.match(/^\[\[(.+?)\]\]$/);
  if (m) s = m[1];

  const lastSlash = s.lastIndexOf("/");
  if (lastSlash >= 0 && lastSlash < s.length - 1) {
    s = s.slice(lastSlash + 1);
  }

  const MAX = 80;
  if (s.length > MAX) {
    s = s.slice(0, MAX - 1) + "…";
  }

  return s;
}

// label completo pra modal
function prettifyLabelFull(raw: string): string {
  let s = raw.trim();
  const m = s.match(/^\[\[(.+?)\]\]$/);
  if (m) s = m[1];
  const slash = s.lastIndexOf("/");
  if (slash >= 0) s = s.slice(slash + 1);
  if (s.toLowerCase().endsWith(".md")) s = s.slice(0, -3);
  return s;
}

function isLightColor(raw: string | undefined): boolean {
  if (!raw) return false;
  const c = raw.trim().toLowerCase();
  if (c === "#fff" || c === "#ffffff" || c === "white") return true;
  if (!c.startsWith("#")) return false;
  let r: number, g: number, b: number;
  if (c.length === 4) {
    r = parseInt(c[1] + c[1], 16);
    g = parseInt(c[2] + c[2], 16);
    b = parseInt(c[3] + c[3], 16);
  } else if (c.length === 7) {
    r = parseInt(c.slice(1, 3), 16);
    g = parseInt(c.slice(3, 5), 16);
    b = parseInt(c.slice(5, 7), 16);
  } else {
    return false;
  }
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.7;
}

export interface RenderContext {
  refresh?: () => void;
  reindexFile?: (path: string) => void | Promise<void>;
}

export class PropChartsRenderer {
  render(
    container: HTMLElement,
    spec: ChartSpec,
    data: QueryResult,
    ctx?: RenderContext,
    isZoom: boolean = false
  ) {
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
        this.renderGantt(container, spec, data, ctx);
        break;
      case "stacked-bar":
        this.renderStackedBar(container, spec, data);
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

  // BAR -----------------------------------------------------------------------
  private renderBar(
    container: HTMLElement,
    spec: ChartSpec,
    data: QueryResult
  ) {
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
          (r) => (r.series != null ? String(r.series) : "") === sKey
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

  // STACKED BAR ---------------------------------------------------------------
  private renderStackedBar(
    container: HTMLElement,
    spec: ChartSpec,
    data: QueryResult
  ) {
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

    categories.forEach((cat, catIndex) => {
      const cx = PAD_L2 + step * (catIndex + 0.5);
      const barWidth = step * 0.6;
      const x0 = cx - barWidth / 2;

      let acc = 0;

      seriesKeys.forEach((sKey, sIndex) => {
        const row = cat.rows.find(
          (r) => (r.series != null ? String(r.series) : "") === sKey
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

  // LINE / AREA ---------------------------------------------------------------
  private renderLine(
    container: HTMLElement,
    spec: ChartSpec,
    data: QueryResult,
    isArea: boolean
  ) {
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
          showTooltip(container, tooltip, title, body, r.notes?.length ?? 0, ev)
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

  // PIE -----------------------------------------------------------------------
  private renderPie(
    container: HTMLElement,
    spec: ChartSpec,
    data: QueryResult
  ) {
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

    const vals = data.rows.map((r) => Math.max(0, r.y));
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
      path.addEventListener("click", () =>
        openDetails(container, details, label, v, row.notes ?? [], drilldown)
      );

      svg.appendChild(path);
      acc += angle;
    });
  }

  // SCATTER -------------------------------------------------------------------
  private renderScatter(
    container: HTMLElement,
    spec: ChartSpec,
    data: QueryResult
  ) {
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

  // TABLE ---------------------------------------------------------------------
  private renderTable(
    container: HTMLElement,
    spec: ChartSpec,
    data: QueryResult
  ) {
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

  // GANTT ---------------------------------------------------------------------
  private renderGantt(
    container: HTMLElement,
    spec: ChartSpec,
    data: QueryResult,
    ctx?: RenderContext
  ) {
    const opts: any = spec.options ?? {};
    const background: string | undefined = opts.background;
    const drilldown: boolean = opts.drilldown ?? true;
    const editable: boolean = true;

    const normalizeFullName = (raw: any): string => {
      if (raw == null) return "";
      let s = String(raw).trim();
      if (!s) return "";

      const m = s.match(/^\[\[(.+?)\]\]$/);
      if (m) s = m[1];

      const lastSlash = s.lastIndexOf("/");
      if (lastSlash >= 0 && lastSlash < s.length - 1) {
        s = s.slice(lastSlash + 1);
      }
      return s;
    };

    Array.from(
      container.querySelectorAll(
        ".gantt-zoom-controls, .gantt-label-floating-btn, .chart-notes-scroll, .chart-notes-details, .chart-notes-tooltip, .prop-charts-empty"
      )
    ).forEach((el) => el.remove());

    if (data.rows.length === 0) {
      container.createDiv({ cls: "prop-charts-empty", text: "Sem dados." });
      return;
    }

    const tasksRaw = data.rows.filter((r) => r.start && r.end);
    if (tasksRaw.length === 0) {
      container.createDiv({
        cls: "prop-charts-empty",
        text: "Gantt: faltam campos de data.",
      });
      return;
    }

    const enc = spec.encoding as any;
    const groupField = enc.group;
    const durationField = enc.duration;

    const getPropValue = (
      props: Record<string, any> | undefined,
      key: string | undefined
    ): any => {
      if (!props || !key) return undefined;
      const v = props[key];
      if (Array.isArray(v)) return v[0];
      return v;
    };

    const tasks = tasksRaw.map((r) => {
      const start = r.start as Date;
      const end = r.end as Date;
      const props = (r as any).props as Record<string, any> | undefined;

      const rawLabel =
        typeof r.x === "string"
          ? r.x
          : r.x instanceof Date
          ? formatDateShort(start)
          : String(r.x);

      const fullName = normalizeFullName(rawLabel);

      let groupKey: string;
      const fromGroupField = groupField ? getPropValue(props, groupField) : undefined;
      if (fromGroupField != null) {
        groupKey = String(fromGroupField);
      } else if (r.series != null) {
        groupKey = String(r.series);
      } else {
        groupKey = fullName;
      }

      const notePath = r.notes?.[0];
      const noteTitle =
        notePath
          ? (notePath.replace(/\.md$/i, "").split("/").pop() ?? notePath)
          : fullName;

      const due = (r as any).due as Date | undefined;

      let estMinutes: number | undefined;
      const estRaw = getPropValue(props, durationField);
      if (estRaw != null) {
        const n = Number(estRaw);
        if (!Number.isNaN(n)) estMinutes = n;
      }

      return {
        row: r,
        start,
        end,
        props,
        fullName,
        groupKey,
        notePath,
        noteTitle,
        due,
        estMinutes,
      };
    });

    const validTasks = tasks.filter(
      (t) =>
        t.start instanceof Date &&
        !isNaN(t.start.getTime()) &&
        t.end instanceof Date &&
        !isNaN(t.end.getTime())
    );
    if (validTasks.length === 0) {
      container.createDiv({
        cls: "prop-charts-empty",
        text: "Gantt: datas inválidas.",
      });
      return;
    }

    validTasks.sort((a, b) => {
      if (a.groupKey < b.groupKey) return -1;
      if (a.groupKey > b.groupKey) return 1;
      const ta = a.start.getTime();
      const tb = b.start.getTime();
      if (ta !== tb) return ta - tb;
      return a.fullName.localeCompare(b.fullName);
    });

    const rowH = 26;
    let totalRows = 0;
    let lastGroup: string | null = null;

    for (const t of validTasks) {
      if (t.groupKey !== lastGroup) {
        lastGroup = t.groupKey;
        totalRows += 1;
      }
      totalRows += 1;
    }

    const minStart = Math.min(...validTasks.map((t) => t.start.getTime()));
    const maxEnd = Math.max(...validTasks.map((t) => t.end.getTime()));
    if (!isFinite(minStart) || !isFinite(maxEnd)) {
      container.createDiv({
        cls: "prop-charts-empty",
        text: "Gantt: intervalo de datas inválido.",
      });
      return;
    }

    const DAY = 24 * 60 * 60 * 1000;
    const floorToDay = (ts: number) => {
      const d = new Date(ts);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };

    const minDay = floorToDay(minStart);
    const maxDay = floorToDay(maxEnd);

    let titleRow = container.querySelector(
      ".prop-charts-title-row"
    ) as HTMLElement | null;
    if (!titleRow) {
      titleRow = container.createDiv({ cls: "prop-charts-title-row" });
    }

    let zoomMode =
      container.dataset.ganttZoomMode || (opts.zoomMode as string) || "100";
    container.dataset.ganttZoomMode = zoomMode;

    let labelMode =
      container.dataset.ganttLabelMode || (opts.labelMode as string) || "compact";
    container.dataset.ganttLabelMode = labelMode;

    const zoomBar = titleRow.createDiv({ cls: "gantt-zoom-controls" });

    const zoomOptions: { id: string; label: string }[] = [
      { id: "fit", label: "Fit" },
      { id: "100", label: "100%" },
      { id: "150", label: "150%" },
      { id: "200", label: "200%" },
    ];

    zoomOptions.forEach((opt) => {
      const btn = zoomBar.createEl("button", {
        cls: "gantt-zoom-btn",
        text: opt.label,
      });
      if (opt.id === zoomMode) btn.addClass("is-active");
      btn.addEventListener("click", (ev: MouseEvent) => {
        ev.preventDefault();
        container.dataset.ganttZoomMode = opt.id;
        this.renderGantt(container, spec, data, ctx);
      });
    });

    const fullBtn = zoomBar.createEl("button", {
      cls: "gantt-zoom-btn gantt-fullscreen-btn",
      text: "⤢",
    });
    fullBtn.addEventListener("click", (ev: MouseEvent) => {
      ev.preventDefault();
      const zoomTrigger = container.querySelector(
        ".chart-notes-zoom-button"
      ) as HTMLElement | null;
      if (zoomTrigger) {
        zoomTrigger.click();
      }
    });

    const baseLabelWidthRaw = Number(opts.labelWidth);
    const baseLabelWidth =
      !Number.isNaN(baseLabelWidthRaw) && baseLabelWidthRaw > 120
        ? baseLabelWidthRaw
        : 260;

    const labelModeNow = container.dataset.ganttLabelMode || "compact";
    const labelColWidth =
      labelModeNow === "wide" ? baseLabelWidth + 160 : baseLabelWidth;

    const containerWidth = container.getBoundingClientRect().width || 600;
    const baseWidth = Math.max(containerWidth, 820);

    let width: number;
    if (zoomMode === "fit") {
      width = containerWidth;
    } else {
      const factor = Number(zoomMode) / 100 || 1;
      width = baseWidth * factor;
    }

    const { inner, svg, tooltip, details } = ensureContainer(
      container,
      background
    );
    inner.style.width = width + "px";

    const drawMultilineLabel = (
      text: string,
      x: number,
      centerY: number,
      maxWidthPx: number,
      fontSize: number,
      fontWeight: string | null,
      onEnter?: (ev: MouseEvent) => void,
      onLeave?: () => void,
      onClick?: (ev: MouseEvent) => void
    ) => {
      if (!text) return;

      const usableWidth = Math.max(40, maxWidthPx - 8);
      const approxCharWidth = 6;
      const maxChars = Math.max(8, Math.floor(usableWidth / approxCharWidth));

      const words = text.split(/\s+/);
      const lines: string[] = [];
      let current = "";

      for (const w of words) {
        if (!current) {
          current = w;
          continue;
        }
        if ((current + " " + w).length <= maxChars) {
          current += " " + w;
        } else {
          lines.push(current);
          current = w;
        }
      }
      if (current) lines.push(current);

      const lineHeight = fontSize + 2;
      const totalHeight = lines.length * lineHeight;
      const firstBaseline = centerY - totalHeight / 2 + fontSize;

      lines.forEach((line, idx) => {
        const tNode = document.createElementNS(svg.namespaceURI, "text");
        tNode.setAttribute("x", String(x));
        tNode.setAttribute("y", String(firstBaseline + idx * lineHeight));
        tNode.setAttribute("text-anchor", "start");
        tNode.setAttribute("font-size", String(fontSize));
        tNode.setAttribute("fill", "#111111");
        if (fontWeight) tNode.setAttribute("font-weight", fontWeight);
        tNode.textContent = line;

        if (onEnter) {
          tNode.addEventListener("mouseenter", (ev: MouseEvent) =>
            onEnter(ev)
          );
        }
        if (onLeave) {
          tNode.addEventListener("mouseleave", () => onLeave());
        }
        if (onClick) {
          (tNode as any).style.cursor = "pointer";
          tNode.addEventListener("click", (ev: MouseEvent) => onClick(ev));
        }

        svg.appendChild(tNode);
      });
    };

    const PAD_TOP = PAD_T;
    const PAD_BOTTOM = PAD_B;
    const PAD_RIGHT = PAD_R;

    const height = Math.max(
      DEFAULT_H,
      PAD_TOP + PAD_BOTTOM + totalRows * rowH + 24
    );
    svg.setAttribute("height", String(height));

    const plotW = width - labelColWidth - PAD_RIGHT;
    const axisY = PAD_TOP + 6;

    svg.style.color = "#111111";

    const rawSpan = maxDay + DAY - minDay || 1;
    const domainMin = minDay - rawSpan * 0.02;
    const domainMax = maxDay + DAY + rawSpan * 0.08;

    const xScale = (ts: number) =>
      labelColWidth + ((ts - domainMin) / (domainMax - domainMin)) * plotW;

    const spanDaysVisible = (domainMax - domainMin) / DAY;

    const idealPixelPerTick = 90;
    const maxTicks = Math.max(
      4,
      Math.min(12, Math.floor(plotW / idealPixelPerTick) || 4)
    );
    const rawStepDays = spanDaysVisible / maxTicks;

    const candidates = [1, 2, 3, 5, 7, 10, 14, 21, 30, 60, 90, 180, 365];
    let stepDays = candidates[candidates.length - 1];
    for (const c of candidates) {
      if (c >= rawStepDays) {
        stepDays = c;
        break;
      }
    }

    const tickTimes: number[] = [];
    const firstTick = floorToDay(domainMin);
    for (let ts = firstTick; ts <= domainMax + 0.5 * DAY; ts += stepDays * DAY) {
      tickTimes.push(ts);
    }

    const axisX = document.createElementNS(svg.namespaceURI, "line");
    axisX.setAttribute("x1", String(labelColWidth));
    axisX.setAttribute("y1", String(axisY));
    axisX.setAttribute("x2", String(width - PAD_RIGHT));
    axisX.setAttribute("y2", String(axisY));
    axisX.setAttribute("stroke", "#111111");
    svg.appendChild(axisX);

    for (const ts of tickTimes) {
      const x = xScale(ts);

      const grid = document.createElementNS(svg.namespaceURI, "line");
      grid.setAttribute("x1", String(x));
      grid.setAttribute("y1", String(axisY));
      grid.setAttribute("x2", String(x));
      grid.setAttribute("y2", String(height - PAD_BOTTOM));
      grid.setAttribute("stroke", "#111111");
      grid.setAttribute("stroke-opacity", "0.20");
      grid.setAttribute("stroke-dasharray", "2,4");
      svg.appendChild(grid);

      const label = document.createElementNS(svg.namespaceURI, "text");
      label.setAttribute("x", String(x));
      label.setAttribute("y", String(axisY - 4));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "10");
      label.setAttribute("fill", "#111111");
      label.textContent = formatDateShort(new Date(ts));
      svg.appendChild(label);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();
    if (todayTs >= domainMin && todayTs <= domainMax) {
      const xToday = xScale(todayTs);
      const todayLine = document.createElementNS(svg.namespaceURI, "line");
      todayLine.setAttribute("x1", String(xToday));
      todayLine.setAttribute("y1", String(axisY));
      todayLine.setAttribute("x2", String(xToday));
      todayLine.setAttribute("y2", String(height - PAD_BOTTOM));
      todayLine.setAttribute("stroke", "#4caf50");
      todayLine.setAttribute("stroke-width", "2");
      todayLine.setAttribute("stroke-dasharray", "4,2");
      svg.appendChild(todayLine);

      const todayLabel = document.createElementNS(svg.namespaceURI, "text");
      todayLabel.setAttribute("x", String(xToday + 4));
      todayLabel.setAttribute("y", String(axisY + 12));
      todayLabel.setAttribute("font-size", "10");
      todayLabel.setAttribute("fill", "#4caf50");
      todayLabel.textContent = "hoje";
      svg.appendChild(todayLabel);
    }

    const labelToggle = inner.createEl("button", {
      cls: "gantt-label-floating-btn",
      text: "↔",
    });
    labelToggle.setAttr(
      "title",
      labelModeNow === "wide" ? "Compactar nomes" : "Expandir nomes"
    );
    labelToggle.style.left = `${labelColWidth}px`;
    labelToggle.style.top = `4px`;
    labelToggle.addEventListener("click", (ev: MouseEvent) => {
      ev.preventDefault();
      const current = container.dataset.ganttLabelMode || "compact";
      const next = current === "wide" ? "compact" : "wide";
      container.dataset.ganttLabelMode = next;
      this.renderGantt(container, spec, data, ctx);
    });

    const defaultExtraFields = ["status", "priority"];
    const optTooltipFields = Array.isArray(opts.tooltipFields)
      ? opts.tooltipFields.map((s: any) => String(s))
      : null;
    const tooltipFields: string[] =
      optTooltipFields && optTooltipFields.length
        ? optTooltipFields
        : defaultExtraFields;

    let rowIndex = 0;
    let currentGroup: string | null = null;

    for (const t of validTasks) {
      const start = t.start;
      const end = t.end;
      const durationMin = (end.getTime() - start.getTime()) / 60000;

      const props = t.props;
      const notePath = t.notePath;
      const noteTitle = t.noteTitle;
      const noteCount = t.row.notes?.length ?? 0;
      const due = t.due;
      const estMinutes = t.estMinutes;

      const infoLines: string[] = [];
      infoLines.push(`${formatDateShort(start)} → ${formatDateShort(end)}`);

      if (typeof estMinutes === "number" && !Number.isNaN(estMinutes)) {
        infoLines.push(`est: ${Math.round(estMinutes)} min`);
      } else if (durationMin > 0) {
        infoLines.push(`duração: ${Math.round(durationMin)} min`);
      }

      if (due instanceof Date) {
        infoLines.push(`due: ${formatDateShort(due)}`);
      }

      for (const field of tooltipFields) {
        const val = getPropValue(props, field);
        if (val != null && String(val).trim() !== "") {
          infoLines.push(`${field}: ${String(val)}`);
        }
      }

      const tipValue = infoLines.join("<br>");

      const handleClickTask = (ev: MouseEvent) => {
        ev.preventDefault();
        if (editable && notePath) {
          new GanttEditModal(notePath, spec, ctx?.refresh, ctx?.reindexFile).open();
        } else {
          openDetails(
            container,
            details,
            noteTitle,
            estMinutes ?? durationMin,
            t.row.notes ?? [],
            drilldown
          );
        }
      };

      const handleEnter = (ev: MouseEvent) => {
        if (noteTitle && tipValue) {
          showTooltip(container, tooltip, noteTitle, tipValue, noteCount, ev);
        }
      };
      const handleLeave = () => hideTooltip(tooltip);

      if (t.groupKey !== currentGroup) {
        currentGroup = t.groupKey;

        const yGroupCenter = axisY + 8 + rowIndex * rowH + rowH / 2;
        const groupText = normalizeFullName(currentGroup);

        drawMultilineLabel(
          groupText,
          4,
          yGroupCenter,
          labelColWidth - 12,
          11,
          "600"
        );

        rowIndex += 1;
      }

      const yTop = axisY + 8 + rowIndex * rowH;
      const barH = rowH - 10;
      const x1 = xScale(start.getTime());
      const x2 = xScale(end.getTime());
      const w = Math.max(4, x2 - x1);

      const fullName = t.fullName;

      const rect = document.createElementNS(
        svg.namespaceURI,
        "rect"
      ) as SVGRectElement;
      rect.setAttribute("x", String(x1));
      rect.setAttribute("y", String(yTop));
      rect.setAttribute("width", String(w));
      rect.setAttribute("height", String(barH));
      rect.setAttribute("rx", "3");
      rect.setAttribute("ry", "3");
      rect.setAttribute("fill", colorFor(t.row.series ?? fullName, rowIndex));
      rect.setAttribute("stroke", "rgba(0,0,0,0.25)");
      rect.setAttribute("stroke-width", "0.5");
      rect.style.cursor = editable && !!notePath ? "pointer" : "default";

      rect.addEventListener("mouseenter", handleEnter);
      rect.addEventListener("mouseleave", handleLeave);
      rect.addEventListener("click", handleClickTask);

      svg.appendChild(rect);

      const cy = yTop + barH / 2;
      if (w >= 6) {
        const strokeColor = colorFor(t.row.series ?? fullName, rowIndex);

        const startMarker = document.createElementNS(
          svg.namespaceURI,
          "circle"
        ) as SVGCircleElement;
        startMarker.setAttribute("cx", String(x1));
        startMarker.setAttribute("cy", String(cy));
        startMarker.setAttribute("r", "3.5");
        startMarker.setAttribute("fill", "#ffffff");
        startMarker.setAttribute("stroke", strokeColor);
        startMarker.setAttribute("stroke-width", "1.5");
        svg.appendChild(startMarker);

        const endMarker = document.createElementNS(
          svg.namespaceURI,
          "circle"
        ) as SVGCircleElement;
        endMarker.setAttribute("cx", String(x2));
        endMarker.setAttribute("cy", String(cy));
        endMarker.setAttribute("r", "3.5");
        endMarker.setAttribute("fill", "#ffffff");
        endMarker.setAttribute("stroke", strokeColor);
        endMarker.setAttribute("stroke-width", "1.5");
        svg.appendChild(endMarker);
      }

      const labelCenterY = yTop + barH / 2 + 2;
      const labelX = groupField ? 16 : 4;

      if (labelModeNow === "wide") {
        drawMultilineLabel(
          fullName,
          labelX,
          labelCenterY,
          labelColWidth - labelX - 4,
          11,
          null,
          handleEnter,
          handleLeave,
          handleClickTask
        );
      } else {
        let compact = fullName;
        const usableWidth = Math.max(40, labelColWidth - labelX - 8);
        const approxCharWidth = 6;
        const maxChars = Math.max(8, Math.floor(usableWidth / approxCharWidth));
        if (compact.length > maxChars) {
          compact = compact.slice(0, maxChars - 1) + "…";
        }

        const labelNode = document.createElementNS(
          svg.namespaceURI,
          "text"
        ) as SVGTextElement;
        labelNode.setAttribute("x", String(labelX));
        labelNode.setAttribute("y", String(labelCenterY));
        labelNode.setAttribute("text-anchor", "start");
        labelNode.setAttribute("font-size", "11");
        labelNode.setAttribute("fill", "#111111");
        labelNode.textContent = compact;
        (labelNode as any).style.cursor = "pointer";

        labelNode.addEventListener("mouseenter", handleEnter);
        labelNode.addEventListener("mouseleave", handleLeave);
        labelNode.addEventListener("click", handleClickTask);

        svg.appendChild(labelNode);
      }

      if (due instanceof Date) {
        const xd = xScale(due.getTime());
        const dueLine = document.createElementNS(svg.namespaceURI, "line");
        dueLine.setAttribute("x1", String(xd));
        dueLine.setAttribute("y1", String(yTop));
        dueLine.setAttribute("x2", String(xd));
        dueLine.setAttribute("y2", String(yTop + barH));
        dueLine.setAttribute("stroke", "#ff6b6b");
        dueLine.setAttribute("stroke-width", "2");
        dueLine.setAttribute("stroke-dasharray", "4,2");
        svg.appendChild(dueLine);
      }

      rowIndex += 1;
    }

    if (editable) {
      const hint = container.createDiv({ cls: "prop-charts-empty" });
      hint.textContent =
        "Clique em uma barra ou no nome para ajustar datas e estimate da tarefa.";
    }
  }
}

// ---------------------------------------------------------------------------
// Modal para editar start / end / estimate a partir do Gantt
// ---------------------------------------------------------------------------
class GanttEditModal extends Modal {
  private notePath: string;
  private spec: ChartSpec;
  private refresh?: () => void;
  private reindexFile?: (path: string) => void | Promise<void>;

  private startKey?: string;
  private endKey?: string;
  private durationKey?: string;
  private dueKey?: string;

  constructor(
    notePath: string,
    spec: ChartSpec,
    refresh?: () => void,
    reindexFile?: (path: string) => void | Promise<void>
  ) {
    super(app);
    this.notePath = notePath;
    this.spec = spec;
    this.refresh = refresh;
    this.reindexFile = reindexFile;

    const enc: any = spec.encoding ?? {};
    this.startKey = enc.start;
    this.endKey = enc.end;
    this.durationKey = enc.duration;
    this.dueKey = enc.due;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    const file = this.app.vault.getAbstractFileByPath(this.notePath);
    if (!(file instanceof TFile)) {
      contentEl.createEl("p", {
        text: "Arquivo não encontrado: " + this.notePath,
      });
      return;
    }

    const raw = await this.app.vault.read(file);

    let front: any = {};
    let body = raw;
    const fmMatch = /^---\n([\s\S]*?)\n---\n?/m.exec(raw);
    if (fmMatch) {
      try {
        front = parseYaml(fmMatch[1]) ?? {};
      } catch {
        front = {};
      }
      body = raw.slice(fmMatch[0].length);
    }
    if (typeof front !== "object" || front == null) front = {};

    const title =
      this.notePath.replace(/\.md$/i, "").split("/").pop() ?? this.notePath;
    const header = contentEl.createDiv({ cls: "gantt-edit-header" });
    const titleEl = header.createEl("a", {
      text: title,
      cls: "gantt-edit-title",
    });
    titleEl.href = "#";
    titleEl.addEventListener("click", (ev: MouseEvent) => {
      ev.preventDefault();
      this.app.workspace.openLinkText(this.notePath, this.notePath, true);
    });

    const subtitle = header.createDiv({ cls: "gantt-edit-subtitle" });
    subtitle.textContent = this.notePath;

    const form = contentEl.createDiv({ cls: "gantt-edit-form" });

    const makeRow = (labelText: string) => {
      const row = form.createDiv({ cls: "gantt-edit-row" });
      const label = row.createDiv({ cls: "gantt-edit-label" });
      label.textContent = labelText;
      const field = row.createDiv({ cls: "gantt-edit-field" });
      return { row, field };
    };

    const toDateInput = (v: any): string => {
      if (!v) return "";
      const s = String(v);
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
      return "";
    };

    const fromDateInput = (s: string): string | undefined => {
      s = s.trim();
      if (!s) return undefined;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
      return s;
    };

    let startInput: HTMLInputElement | null = null;
    if (this.startKey) {
      const { field } = makeRow(this.startKey + " (início)");
      startInput = field.createEl("input", { type: "date" });
      startInput.value = toDateInput(front[this.startKey]);
    }

    let endInput: HTMLInputElement | null = null;
    if (this.endKey) {
      const { field } = makeRow(this.endKey + " (fim)");
      endInput = field.createEl("input", { type: "date" });
      endInput.value = toDateInput(front[this.endKey]);
    }

    let durInput: HTMLInputElement | null = null;
    if (this.durationKey) {
      const { field } = makeRow(this.durationKey + " (minutos)");
      durInput = field.createEl("input", { type: "number" });
      const v = front[this.durationKey];
      durInput.value = v != null ? String(v) : "";
      durInput.min = "0";
      durInput.step = "5";
    }

    let dueInput: HTMLInputElement | null = null;
    if (this.dueKey) {
      const { field } = makeRow(this.dueKey + " (due)");
      dueInput = field.createEl("input", { type: "date" });
      dueInput.value = toDateInput(front[this.dueKey]);
    }

    const buttons = contentEl.createDiv({ cls: "gantt-edit-buttons" });
    const saveBtn = buttons.createEl("button", {
      text: "Salvar",
      cls: "mod-cta",
    });
    const cancelBtn = buttons.createEl("button", { text: "Cancelar" });

    cancelBtn.addEventListener("click", (ev: MouseEvent) => {
      ev.preventDefault();
      this.close();
    });

    saveBtn.addEventListener("click", async (ev: MouseEvent) => {
      ev.preventDefault();

      if (this.startKey && startInput) {
        const v = fromDateInput(startInput.value);
        if (v) front[this.startKey] = v;
        else delete front[this.startKey];
      }

      if (this.endKey && endInput) {
        const v = fromDateInput(endInput.value);
        if (v) front[this.endKey] = v;
        else delete front[this.endKey];
      }

      if (this.durationKey && durInput) {
        const rawVal = durInput.value.trim();
        if (rawVal === "") {
          delete front[this.durationKey];
        } else {
          const n = Number(rawVal);
          if (!Number.isNaN(n)) front[this.durationKey] = n;
        }
      }

      if (this.dueKey && dueInput) {
        const v = fromDateInput(dueInput.value);
        if (v) front[this.dueKey] = v;
        else delete front[this.dueKey];
      }

      const fm = stringifyYaml(front).trim();
      const newContent = `---\n${fm}\n---\n` + body;
      await this.app.vault.modify(file, newContent);

      if (this.reindexFile) {
        try {
          await this.reindexFile(this.notePath);
        } catch {
          // ignore
        }
      }

      if (this.refresh) {
        try {
          this.refresh();
        } catch {
          // ignore
        }
      }

      new Notice("Task atualizada");
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
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

