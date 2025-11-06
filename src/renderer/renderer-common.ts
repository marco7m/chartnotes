// src/renderer/renderer-common.ts
import type { App } from "obsidian";

declare const app: App;

export const PAD_L = 48;
export const PAD_R = 10;
export const PAD_T = 28;
export const PAD_B = 28;
export const MIN_W_PER_POINT = 90;
export const DEFAULT_H = 300;

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

export function colorFor(key: string | undefined, idx: number): string {
	if (!key) return "var(--text-accent, #5b6cff)";
	const h = Array.from(key).reduce(
		(a, c) => (a * 33 + c.charCodeAt(0)) >>> 0,
		0
	);
	return PALETTE[h % PALETTE.length];
}

export function ensureContainer(
	container: HTMLElement,
	background?: string
): {
	scroll: HTMLElement;
	inner: HTMLElement;
	svg: SVGSVGElement;
	tooltip: HTMLElement;
	details: HTMLElement;
} {
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
	const svg = document.createElementNS(svgNS, "svg") as SVGSVGElement;
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

export function showTooltip(
	container: HTMLElement,
	tooltip: HTMLElement,
	label: string,
	value: string | number,
	notesLen: number,
	ev: MouseEvent
): void {
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

export function hideTooltip(tooltip: HTMLElement): void {
	tooltip.style.display = "none";
}

export function openDetails(
	container: HTMLElement,
	details: HTMLElement,
	label: string,
	value: number,
	notes: string[],
	allow: boolean
): void {
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

export function formatDateShort(d: Date): string {
	if (!(d instanceof Date) || isNaN(d.getTime())) return "";
	const day = d.getDate().toString().padStart(2, "0");
	const month = (d.getMonth() + 1).toString().padStart(2, "0");
	return `${day}/${month}`;
}

export function isLightColor(raw: string | undefined): boolean {
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

export function prettifyLabelShort(raw: unknown): string {
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

export function prettifyLabelFull(raw: string): string {
	let s = raw.trim();
	const m = s.match(/^\[\[(.+?)\]\]$/);
	if (m) s = m[1];
	const slash = s.lastIndexOf("/");
	if (slash >= 0) s = s.slice(slash + 1);
	if (s.toLowerCase().endsWith(".md")) s = s.slice(0, -3);
	return s;
}

export interface RenderContext {
	refresh?: () => void;
	reindexFile?: (path: string) => void | Promise<void>;
}

