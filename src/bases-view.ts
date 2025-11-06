// src/bases-view.ts
import { BasesView } from "obsidian";
import { PropChartsRenderer } from "./renderer";
import type { ChartSpec, QueryResult, QueryResultRow } from "./types";

export const CHARTNOTES_BASES_VIEW_TYPE = "chartnotes-view";

export class ChartNotesBasesView extends BasesView {
	readonly type = CHARTNOTES_BASES_VIEW_TYPE;

	private containerEl: HTMLElement;
	private renderer: PropChartsRenderer;

	constructor(controller: any, parentEl: HTMLElement) {
		super(controller as any);
		this.containerEl = parentEl.createDiv({
			cls: "chart-notes-bases-view",
		});
		this.renderer = new PropChartsRenderer();
	}

	public onDataUpdated(): void {
		const container = this.containerEl;
		container.empty();

		const dataAny: any = this.data;
		const groups: any[] = dataAny?.groupedData ?? [];

		if (!groups.length) {
			container.createDiv({
				cls: "prop-charts-empty",
				text:
					"Chart Notes (Bases): nenhum arquivo corresponde ao filtro atual.",
			});
			return;
		}

		// Lê as opções configuradas na view
		const chartTypeRaw =
			(this.config.get("chartType") as string | undefined) ?? "bar";
		const chartType = (chartTypeRaw || "bar").trim() || "bar";

		const xPropId =
			(this.config.get("xProperty") as string | undefined)?.trim() ?? "";
		const yPropId =
			(this.config.get("yProperty") as string | undefined)?.trim() ?? "";
		const seriesPropId =
			(this.config.get("seriesProperty") as string | undefined)?.trim() ??
			"";

		const startPropId =
			(this.config.get("startProperty") as string | undefined)?.trim() ??
			"";
		const endPropId =
			(this.config.get("endProperty") as string | undefined)?.trim() ??
			"";
		const duePropId =
			(this.config.get("dueProperty") as string | undefined)?.trim() ??
			"";
		const durationPropId =
			(this.config.get("durationProperty") as string | undefined)?.trim() ??
			"";
		const groupPropId =
			(this.config.get("groupProperty") as string | undefined)?.trim() ??
			"";

		// Achata todos os grupos em uma lista de entries
		const entries: any[] = [];
		for (const group of groups) {
			for (const entry of group.entries as any[]) {
				entries.push(entry);
			}
		}

		let rows: QueryResultRow[] = [];

		if (chartType === "gantt") {
			rows = this.buildGanttRows(
				entries,
				startPropId,
				endPropId,
				duePropId,
				durationPropId,
				groupPropId
			);
		} else if (chartType === "scatter") {
			rows = this.buildScatterRows(
				entries,
				xPropId,
				yPropId,
				seriesPropId
			);
		} else {
			// bar, line, area, pie, stacked-bar
			rows = this.buildStandardRows(
				entries,
				xPropId,
				yPropId,
				seriesPropId
			);
		}

		if (!rows.length) {
			container.createDiv({
				cls: "prop-charts-empty",
				text:
					"Chart Notes: não há dados para esse tipo de gráfico / propriedades escolhidas.",
			});
			return;
		}

		const spec: ChartSpec = {
			type: chartType as any,
			source: {},
			encoding: {},
			options: {
				title: this.config.name || "Chart Notes (Bases)",
				// se no futuro o Gantt respeitar options.editable,
				// aqui já deixamos false pra view do Bases
				...(chartType === "gantt" ? { editable: false } : {}),
			} as any,
			aggregate: {},
		};

		// só pra documentar intenção; o renderer praticamente não usa aggregate
		if (!yPropId && chartType !== "gantt" && chartType !== "scatter") {
			(spec.aggregate as any).y = "count";
		}

		if (chartType === "gantt") {
			spec.encoding = {
				start: this.stripPrefix(startPropId),
				end: this.stripPrefix(endPropId),
				due: this.stripPrefix(duePropId),
				duration: this.stripPrefix(durationPropId),
				group: this.stripPrefix(groupPropId),
				label: this.stripPrefix(xPropId),
				series: this.stripPrefix(groupPropId),
			} as any;
		}

		const result: QueryResult = { rows };

		this.renderer.render(container, spec, result);
	}

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	private stripPrefix(id: string): string | undefined {
		if (!id) return undefined;
		const dot = id.indexOf(".");
		return dot >= 0 ? id.slice(dot + 1) : id;
	}

	private buildStandardRows(
		entries: any[],
		xPropId: string,
		yPropId: string,
		seriesPropId: string
	): QueryResultRow[] {
		const agg = new Map<
			string,
			{
				x: unknown;
				series?: string;
				sumY: number;
				count: number;
				notes: string[];
			}
		>();

		for (const entry of entries) {
			const file = (entry as any).file;
			const fileName: string = file?.name ?? "";
			const filePath: string = file?.path ?? "";

			// X: propriedade configurada ou nome da nota
			let xVal: unknown;
			if (xPropId) {
				const v: any = entry.getValue(xPropId);
				const s = v?.toString?.();
				if (!s) continue;
				xVal = s;
			} else {
				xVal = fileName;
			}

			// Série opcional
			let series: string | undefined;
			if (seriesPropId) {
				const v: any = entry.getValue(seriesPropId);
				const s = v?.toString?.();
				if (s) series = s;
			}

			// Y:
			// - se yProperty vazio => 1 (count)
			// - se yProperty setado => soma dos valores numéricos
			let yNumber = 1;
			if (yPropId) {
				const v: any = entry.getValue(yPropId);
				const raw = v?.value ?? v?.toString?.();
				const n = Number(raw);
				if (!Number.isFinite(n)) continue;
				yNumber = n;
			}

			const key = `${String(xVal)}||${series ?? ""}`;
			let bucket = agg.get(key);
			if (!bucket) {
				bucket = {
					x: xVal,
					series,
					sumY: 0,
					count: 0,
					notes: [],
				};
				agg.set(key, bucket);
			}
			bucket.sumY += yNumber;
			bucket.count += 1;
			if (filePath) bucket.notes.push(filePath);
		}

		const rows: QueryResultRow[] = [];
		for (const bucket of agg.values()) {
			const y = yPropId ? bucket.sumY : bucket.count;
			rows.push({
				x: bucket.x,
				y,
				series: bucket.series,
				notes: bucket.notes,
			});
		}

		// ordena por X (string)
		rows.sort((a, b) => String(a.x).localeCompare(String(b.x)));
		return rows;
	}

	private buildScatterRows(
		entries: any[],
		xPropId: string,
		yPropId: string,
		seriesPropId: string
	): QueryResultRow[] {
		if (!xPropId || !yPropId) return [];

		const rows: QueryResultRow[] = [];

		for (const entry of entries) {
			const file = (entry as any).file;
			const filePath: string = file?.path ?? "";

			const vx: any = entry.getValue(xPropId);
			const vy: any = entry.getValue(yPropId);

			const sx = vx?.toString?.();
			const syRaw = vy?.value ?? vy?.toString?.();
			const yNum = Number(syRaw);

			if (!sx || !Number.isFinite(yNum)) continue;

			let series: string | undefined;
			if (seriesPropId) {
				const vs: any = entry.getValue(seriesPropId);
				const ss = vs?.toString?.();
				if (ss) series = ss;
			}

			rows.push({
				x: sx,
				y: yNum,
				series,
				notes: filePath ? [filePath] : [],
			});
		}

		return rows;
	}

	private buildGanttRows(
		entries: any[],
		startPropId: string,
		endPropId: string,
		duePropId: string,
		durationPropId: string,
		groupPropId: string
	): QueryResultRow[] {
		if (!startPropId && !endPropId) return [];

		const rows: QueryResultRow[] = [];

		for (const entry of entries) {
			const file = (entry as any).file;
			const fileName: string = file?.name ?? "";
			const filePath: string = file?.path ?? "";

			const vStart: any = startPropId ? entry.getValue(startPropId) : null;
			const vEnd: any = endPropId ? entry.getValue(endPropId) : null;
			const vDue: any = duePropId ? entry.getValue(duePropId) : null;

			const startDate = this.toDate(vStart);
			const endDate = this.toDate(vEnd) ?? startDate;
			const dueDate = this.toDate(vDue);

			if (!startDate || !endDate) continue;

			let group: string | undefined;
			if (groupPropId) {
				const vg: any = entry.getValue(groupPropId);
				const sg = vg?.toString?.();
				if (sg) group = sg;
			}

			// duração opcional; o Gantt calcula fallback usando o intervalo
			let durationMinutes: number | undefined;
			if (durationPropId) {
				const vd: any = entry.getValue(durationPropId);
				const raw = vd?.value ?? vd?.toString?.();
				const n = Number(raw);
				if (Number.isFinite(n)) durationMinutes = n;
			}

			const row: QueryResultRow = {
				x: fileName,
				y: 1,
				start: startDate,
				end: endDate,
				series: group,
				notes: filePath ? [filePath] : [],
			};

			// props usados pelo renderer do Gantt (tooltip / estimate)
			const props: Record<string, unknown> = {};
			if (durationMinutes != null && durationPropId) {
				const key = this.stripPrefix(durationPropId) ?? "duration";
				props[key] = durationMinutes;
			}
			if (Object.keys(props).length) {
				(row as any).props = props;
			}
			if (dueDate) {
				(row as any).due = dueDate;
			}

			rows.push(row);
		}

		// ordena por início
		rows.sort((a, b) => {
			const ta = (a.start as Date).getTime();
			const tb = (b.start as Date).getTime();
			return ta - tb;
		});

		return rows;
	}

	private toDate(v: any): Date | null {
		if (!v) return null;
		const s = v.toString?.();
		if (!s) return null;
		const d = new Date(s);
		if (isNaN(d.getTime())) return null;
		return d;
	}
}

