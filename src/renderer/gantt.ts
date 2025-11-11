// src/renderer/gantt.ts
import type { ChartSpec, QueryResult } from "../types";
import {
	App,
	TFile,
	parseYaml,
	stringifyYaml,
	Notice,
	Modal,
} from "obsidian";
import {
	PAD_T,
	PAD_B,
	PAD_R,
	DEFAULT_H,
	ensureContainer,
	showTooltip,
	hideTooltip,
	openDetails,
	colorFor,
	formatDateShort,
	type RenderContext,
} from "./renderer-common";

declare const app: App;

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
		this.titleEl.setText("Editar tarefa");

		const file = this.app.vault.getAbstractFileByPath(this.notePath);
		if (!(file instanceof TFile)) {
			contentEl.createEl("p", {
				text: "Arquivo não encontrado: " + this.notePath,
			});
			return;
		}

		const raw = await this.app.vault.read(file);

		// Frontmatter + corpo
		let front: Record<string, any> = {};
		let body = raw;
		const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
		if (fmMatch) {
			try {
				front = (parseYaml(fmMatch[1]) ?? {}) as Record<string, any>;
			} catch {
				front = {};
			}
			body = fmMatch[2] ?? "";
		}

		const form = contentEl.createDiv({ cls: "gantt-edit-form" });

		const makeRow = (labelText: string) => {
			const row = form.createDiv({ cls: "gantt-edit-row" });
			const label = row.createDiv({ cls: "gantt-edit-label" });
			label.textContent = labelText;
			const field = row.createDiv({ cls: "gantt-edit-field" });
			return { row, field };
		};

		// Parse de string -> Date local (ignorando timezone)
		const parseLocalDateTime = (v: any): Date | null => {
			if (!v) return null;
			if (v instanceof Date && !isNaN(v.getTime())) return v;
			const s = String(v).trim();
			const m = s.match(
				/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/
			);
			if (!m) return null;
			const y = Number(m[1]);
			const mo = Number(m[2]) - 1;
			const d = Number(m[3]);
			const hh = m[4] ? Number(m[4]) : 0;
			const mi = m[5] ? Number(m[5]) : 0;
			const ss = m[6] ? Number(m[6]) : 0;
			if (
				Number.isNaN(y) ||
				Number.isNaN(mo) ||
				Number.isNaN(d) ||
				Number.isNaN(hh) ||
				Number.isNaN(mi) ||
				Number.isNaN(ss)
			) {
				return null;
			}
			return new Date(y, mo, d, hh, mi, ss, 0);
		};

		// Date -> valor pra <input type="datetime-local"> (YYYY-MM-DDTHH:mm)
		const toDateTimeInput = (v: any): string => {
			const d = parseLocalDateTime(v);
			if (!d) return "";
			const pad = (n: number) => n.toString().padStart(2, "0");
			const y = d.getFullYear();
			const m = pad(d.getMonth() + 1);
			const day = pad(d.getDate());
			const hh = pad(d.getHours());
			const mi = pad(d.getMinutes());
			return `${y}-${m}-${day}T${hh}:${mi}`;
		};

		// Valor do input -> string pra salvar no YAML (sempre local, sem timezone)
		const fromDateTimeInput = (s: string): string | undefined => {
			s = s.trim();
			if (!s) return undefined;
			// Aceita YYYY-MM-DD ou YYYY-MM-DDTHH:mm
			const m = s.match(
				/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/
			);
			if (!m) return undefined;
			const datePart = `${m[1]}-${m[2]}-${m[3]}`;
			if (m[4]) {
				const hh = m[4];
				const mi = m[5];
				return `${datePart}T${hh}:${mi}`;
			}
			return datePart;
		};

		let startInput: HTMLInputElement | null = null;
		let endInput: HTMLInputElement | null = null;
		let durInput: HTMLInputElement | null = null;
		let dueInput: HTMLInputElement | null = null;

		if (this.startKey) {
			const { field } = makeRow(`Início (${this.startKey})`);
			startInput = field.createEl("input");
			startInput.type = "datetime-local";
			startInput.value = toDateTimeInput(front[this.startKey]);
		}

		if (this.endKey) {
			const { field } = makeRow(`Fim (${this.endKey})`);
			endInput = field.createEl("input");
			endInput.type = "datetime-local";
			endInput.value = toDateTimeInput(front[this.endKey]);
		}

		if (this.durationKey) {
			const { field } = makeRow(`Duração (min) (${this.durationKey})`);
			durInput = field.createEl("input");
			durInput.type = "number";
			const v = front[this.durationKey];
			durInput.value =
				typeof v === "number" && !Number.isNaN(v) ? String(v) : "";
		}

		if (this.dueKey) {
			const { field } = makeRow(`Due (${this.dueKey})`);
			dueInput = field.createEl("input");
			dueInput.type = "datetime-local";
			dueInput.value = toDateTimeInput(front[this.dueKey]);
		}

		// Botões
		const buttons = form.createDiv({ cls: "gantt-edit-actions" });
		const saveBtn = buttons.createEl("button", {
			text: "Salvar",
		});
		const openBtn = buttons.createEl("button", {
			text: "Abrir nota",
		});
		const cancelBtn = buttons.createEl("button", {
			text: "Cancelar",
		});

		openBtn.addEventListener("click", () => {
			this.app.workspace.openLinkText(this.notePath, "", false);
			this.close();
		});

		cancelBtn.addEventListener("click", () => this.close());

		saveBtn.addEventListener("click", async () => {			// Atualiza frontmatter com base nos inputs
			if (this.startKey && startInput) {
				const v = fromDateTimeInput(startInput.value);
				if (v) front[this.startKey] = v;
				else delete front[this.startKey];
			}

			if (this.endKey && endInput) {
				const v = fromDateTimeInput(endInput.value);
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
				const v = fromDateTimeInput(dueInput.value);
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


export function renderGantt(
	container: HTMLElement,
	spec: ChartSpec,
	data: QueryResult,
	ctx?: RenderContext
): void {
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

	// Limpa restos de renderizações anteriores
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

	// sentinela interno para "sem grupo"
	const NO_GROUP = "__chartnotes_no_group__";

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

		// grupo vem só do encoding.group (normalmente "__basesGroup")
		const baseGroupRaw =
			groupField != null && groupField !== ""
				? getPropValue(props, groupField)
				: undefined;

		const hasGroup =
			baseGroupRaw != null && String(baseGroupRaw).trim().length > 0;

		const groupKey = hasGroup ? String(baseGroupRaw) : NO_GROUP;

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
			// só reserva linha extra se *tem* grupo
			if (t.groupKey !== NO_GROUP) {
				totalRows += 1;
			}
		}
		totalRows += 1; // linha da task
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
		container.dataset.ganttZoomMode || String(opts.zoomMode ?? "100");
	container.dataset.ganttZoomMode = zoomMode;

	const labelModeNow =
		container.dataset.ganttLabelMode || String(opts.labelMode ?? "compact");
	container.dataset.ganttLabelMode = labelModeNow;

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
			renderGantt(container, spec, data, ctx);
		});
	});

	// (fullscreen removido aqui)

	const baseLabelWidthRaw = Number(opts.labelWidth);
	const baseLabelWidth =
		!Number.isNaN(baseLabelWidthRaw) && baseLabelWidthRaw > 120
			? baseLabelWidthRaw
			: 260;

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
				tNode.addEventListener("mouseenter", (ev: MouseEvent) => onEnter(ev));
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
		renderGantt(container, spec, data, ctx);
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
				new GanttEditModal(
					notePath,
					spec,
					ctx?.refresh,
					ctx?.reindexFile
				).open();
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

		// cabeçalho de grupo só se não for NO_GROUP
		if (t.groupKey !== currentGroup) {
			currentGroup = t.groupKey;

			if (currentGroup !== NO_GROUP) {
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
		const labelX = 4;

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
