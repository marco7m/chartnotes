// src/query.ts
import type {
  ChartSpec,
  IndexedNote,
  QueryResult,
  QueryResultRow
} from "./types";
import {
  matchPath,
  matchTags,
  parseWhere,
  evalCond,
  looksLikeISODate,
  toDate,
} from "./utils";

type SortDir = "asc" | "desc";

function normalizeDateKey(orig: any): { key: string | number | Date; isDate: boolean } {
  if (typeof orig === "string") {
    // pega só o dia se vier no formato ISO com hora
    if (/^\d{4}-\d{2}-\d{2}/.test(orig)) {
      const day = orig.slice(0, 10); // "2025-10-05"
      return { key: day, isDate: true };
    }
  }
  if (looksLikeISODate(orig)) {
    const d = toDate(orig);
    if (d) return { key: d, isDate: true };
  }
  return { key: orig, isDate: false };
}

function compareXAsc(a: QueryResultRow, b: QueryResultRow): number {
  const ax = a.x;
  const bx = b.x;
  if (ax instanceof Date && bx instanceof Date) {
    return ax.getTime() - bx.getTime();
  }
  const sa = String(ax);
  const sb = String(bx);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

function compareXSeriesAsc(a: QueryResultRow, b: QueryResultRow): number {
  const cx = compareXAsc(a, b);
  if (cx !== 0) return cx;
  const as = a.series ?? "";
  const bs = b.series ?? "";
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

function parseRollingWindow(rolling: any): number {
  if (rolling == null) return 0;
  if (typeof rolling === "number") {
    return rolling > 0 ? Math.floor(rolling) : 0;
  }
  if (typeof rolling === "string") {
    const m = rolling.trim().match(/^(\d+)/);
    if (m) {
      const n = Number(m[1]);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
  }
  throw new Error(`aggregate.rolling inválido: ${String(rolling)}`);
}

/**
 * Soma cumulativa POR SÉRIE na ordem atual dos rows.
 * Ou seja: primeiro aplicamos sort.x (asc/desc), depois chamamos isso.
 */
function applyCumulativeInOrder(rows: QueryResultRow[]): QueryResultRow[] {
  const accBySeries = new Map<string, number>();
  const out: QueryResultRow[] = [];

  for (const r of rows) {
    const key = r.series ?? "__no_series__";
    const prev = accBySeries.get(key) ?? 0;
    const next = prev + r.y;
    accBySeries.set(key, next);
    out.push({ ...r, y: next });
  }
  return out;
}

/**
 * Média móvel POR SÉRIE na ordem atual dos rows.
 * Ex.: rolling = 7 → usa até os últimos 7 pontos daquela série.
 */
function applyRollingInOrder(
  rows: QueryResultRow[],
  rolling: any
): QueryResultRow[] {
  const windowSize = parseRollingWindow(rolling);
  if (!windowSize || windowSize <= 1) {
    return [...rows];
  }

  const bufBySeries = new Map<string, number[]>();
  const sumBySeries = new Map<string, number>();
  const out: QueryResultRow[] = [];

  for (const r of rows) {
    const key = r.series ?? "__no_series__";

    let buf = bufBySeries.get(key);
    if (!buf) {
      buf = [];
      bufBySeries.set(key, buf);
    }
    let sum = sumBySeries.get(key) ?? 0;

    buf.push(r.y);
    sum += r.y;
    if (buf.length > windowSize) {
      const removed = buf.shift()!;
      sum -= removed;
    }
    sumBySeries.set(key, sum);

    const denom = buf.length || 1;
    const avg = sum / denom;

    out.push({ ...r, y: avg });
  }

  return out;
}

export class PropChartsQueryEngine {
  private getIndex: () => IndexedNote[];
  private defaultPaths: string[];

  constructor(getIndex: () => IndexedNote[], defaultPaths: string[]) {
    this.getIndex = getIndex;
    this.defaultPaths = defaultPaths;
  }

  run(spec: ChartSpec): QueryResult {
    const all = this.getIndex();

    // --- filtros básicos: paths + tags ------------------------------
    const sourcePaths =
      spec.source?.paths && spec.source.paths.length
        ? spec.source.paths
        : this.defaultPaths;

    const sourceTags =
      spec.source?.tags && spec.source.tags.length
        ? spec.source.tags
        : [];

    const filtered: IndexedNote[] = [];

    for (const note of all) {
      // paths: se não tiver nenhum (nem no spec nem default), não filtra por path
      const passPath =
        sourcePaths && sourcePaths.length
          ? matchPath(note.path, sourcePaths)
          : true;

      // tags: se não tiver tags no spec, não filtra por tag
      const passTag =
        sourceTags && sourceTags.length
          ? matchTags(note.props, sourceTags)
          : true;

      // *** AQUI ESTAVA O BUG ***
      // antes era: if (!(passPath || passTag)) continue;
      // agora: a nota precisa passar em paths E tags
      if (!passPath || !passTag) continue;

      // where
      let passWhere = true;
      if (spec.source?.where && spec.source.where.length > 0) {
        for (const condStr of spec.source.where) {
          let parsed;
          try {
            parsed = parseWhere(condStr);
          } catch (err) {
            throw new Error(
              `Condição inválida: ${condStr} (${(err as Error).message})`
            );
          }
          if (!evalCond(note.props, parsed)) {
            passWhere = false;
            break;
          }
        }
      }
      if (!passWhere) continue;

      filtered.push(note);
    }

    // tipos especiais
    if (spec.type === "gantt") {
      return this.runGantt(spec, filtered);
    }
    if (spec.type === "table") {
      return this.runTable(spec, filtered);
    }

    // padrão (bar / line / area / pie / scatter / stacked-bar)
    return this.runStandard(spec, filtered);
  }

  // -------------------------------------------------------------
  // TABLE
  // -------------------------------------------------------------
  private runTable(spec: ChartSpec, notes: IndexedNote[]): QueryResult {
    const rows: QueryResultRow[] = notes.map((note) => ({
      x: note.path,
      y: 0,
      notes: [note.path],
      props: note.props,
    }));

    return {
      rows,
      xField: spec.encoding?.x,
      yField: spec.encoding?.y,
    };
  }

  // -------------------------------------------------------------
  // GANTT
  // -------------------------------------------------------------
  private runGantt(spec: ChartSpec, notes: IndexedNote[]): QueryResult {
    const enc: any = spec.encoding ?? {};
    const startField: string | undefined = enc.start;
    const endField: string | undefined = enc.end;
    const labelField: string | undefined = enc.label ?? enc.x;
    const seriesField: string | undefined = enc.series;
    const durationField: string | undefined = enc.duration;
    const dueField: string | undefined = enc.due;

    const rows: QueryResultRow[] = [];

    for (const note of notes) {
      const props = note.props ?? {};
      const pickScalar = (v: any) => (Array.isArray(v) ? v[0] : v);

      // end obrigatório
      let endDate: Date | null = null;
      if (endField) {
        const rawEnd = pickScalar(props[endField]);
        const d = toDate(rawEnd);
        if (d) endDate = d;
      }
      if (!endDate) continue;

      // start: campo ou derivado de duração
      let startDate: Date | null = null;
      if (startField) {
        const rawStart = pickScalar(props[startField]);
        const d = toDate(rawStart);
        if (d) startDate = d;
      }
      if (!startDate && durationField) {
        const rawDur = pickScalar(props[durationField]);
        const durMin = Number(rawDur);
        if (!Number.isNaN(durMin)) {
          startDate = new Date(endDate.getTime() - durMin * 60000);
        }
      }
      if (!startDate) startDate = new Date(endDate.getTime());

      // due opcional
      let dueDate: Date | undefined;
      if (dueField) {
        const rawDue = pickScalar(props[dueField]);
        const d = toDate(rawDue);
        if (d) dueDate = d;
      }

      // label
      let xLabel: any;
      if (labelField) {
        let v = pickScalar(props[labelField]);
        if (v == null || v === "") v = note.path;
        xLabel = v;
      } else {
        xLabel = note.path;
      }

      // série
      let series: string | undefined;
      if (seriesField) {
        const rawS = pickScalar(props[seriesField]);
        if (rawS != null) series = String(rawS);
      }

      const row: QueryResultRow = {
        x: xLabel,
        y: 0,
        notes: [note.path],
        series,
        start: startDate,
        end: endDate,
        props,
      };
      if (dueDate) (row as any).due = dueDate;
      rows.push(row);
    }

    rows.sort((a, b) => {
      const ta = a.start ? a.start.getTime() : 0;
      const tb = b.start ? b.start.getTime() : 0;
      return ta - tb;
    });

    return {
      rows,
      xField: labelField,
      yField: endField,
    };
  }

  // -------------------------------------------------------------
  // STANDARD (bar / line / area / pie / scatter / stacked-bar)
  // -------------------------------------------------------------
  private runStandard(spec: ChartSpec, notes: IndexedNote[]): QueryResult {
    const xField = spec.encoding?.x;
    const yField = spec.encoding?.y;
    const seriesField = spec.encoding?.series;

    if (!xField) {
      throw new Error("encoding.x é obrigatório.");
    }

    const aggCfg: any = spec.aggregate ?? {};
    const aggMode: string | null = aggCfg.y ?? null;
    const cumulative: boolean = !!aggCfg.cumulative;
    const rolling = aggCfg.rolling;

    if (!yField && aggMode !== "count") {
      throw new Error("encoding.y é obrigatório (exceto quando aggregate.y = 'count').");
    }

    interface RawRow {
      x: string | number | Date;
      y: number;
      notes: string[];
      series?: string;
      props?: Record<string, any>;
      _isDate: boolean;
      _origX: any;
    }

    const rowsRaw: RawRow[] = [];

    for (const note of notes) {
      const props = note.props ?? {};
      const pickScalar = (v: any) => (Array.isArray(v) ? v[0] : v);

      const rawX = pickScalar(props[xField]);
      if (rawX == null) continue;

      const norm = normalizeDateKey(rawX);
      const xToUse = norm.key;
      const isDate = norm.isDate;

      let series: string | undefined;
      if (seriesField) {
        const rawS = pickScalar(props[seriesField]);
        if (rawS != null && String(rawS).trim() !== "") {
          series = String(rawS);
        }
      }

      let yNum: number;
      if (aggMode === "count") {
        yNum = 1;
      } else {
        const rawY = pickScalar(props[yField!]);
        if (rawY == null) continue;
        const n = Number(rawY);
        if (Number.isNaN(n)) continue;
        yNum = n;
      }

      rowsRaw.push({
        x: xToUse,
        y: yNum,
        notes: [note.path],
        series,
        props,
        _isDate: isDate,
        _origX: rawX,
      });
    }

    if (rowsRaw.length === 0) {
      return { rows: [], xField, yField };
    }

    let aggregated: QueryResultRow[] = [];

    if (aggMode) {
      // agrega por (x, série)
      type GroupAgg = {
        sum: number;
        count: number;
        min: number;
        max: number;
        notes: string[];
        xRep: any;
        isDate: boolean;
        series?: string;
        props?: Record<string, any>;
      };

      const grouped = new Map<string, GroupAgg>();

      for (const row of rowsRaw) {
        const sKey = row.series ?? "";
        const xKey =
          row.x instanceof Date
            ? row.x.toISOString().slice(0, 10)
            : String(row.x);
        const key = sKey + "||" + xKey;

        const g: GroupAgg = grouped.get(key) ?? {
          sum: 0,
          count: 0,
          min: Number.POSITIVE_INFINITY,
          max: Number.NEGATIVE_INFINITY,
          notes: [],
          xRep: row.x,
          isDate: row._isDate,
          series: row.series,
          props: row.props,
        };

        g.sum += row.y;
        g.count += 1;
        if (row.y < g.min) g.min = row.y;
        if (row.y > g.max) g.max = row.y;
        g.notes.push(...row.notes);
        g.props = row.props ?? g.props;

        grouped.set(key, g);
      }

      for (const [, g] of grouped) {
        let y = g.sum;
        switch (aggMode) {
          case "sum":
            y = g.sum;
            break;
          case "avg":
            y = g.sum / g.count;
            break;
          case "min":
            y = g.min;
            break;
          case "max":
            y = g.max;
            break;
          case "count":
            y = g.count;
            break;
        }
        aggregated.push({
          x: g.xRep,
          y,
          notes: g.notes,
          series: g.series,
          props: g.props,
        });
      }
    } else {
      aggregated = rowsRaw.map((r) => ({
        x: r.x,
        y: r.y,
        notes: r.notes,
        series: r.series,
        props: r.props,
      }));
    }

    if (aggregated.length === 0) {
      return { rows: [], xField, yField };
    }

    // sort.x: definimos a ORDEM antes das transformações
    const sortDir: SortDir = spec.sort?.x === "desc" ? "desc" : "asc";
    aggregated.sort((a, b) => {
      const cmp = compareXSeriesAsc(a, b);
      return sortDir === "asc" ? cmp : -cmp;
    });

    // transforms: cumulative / rolling só para line/area
    if ((cumulative || rolling) && !(spec.type === "line" || spec.type === "area")) {
      throw new Error(
        "aggregate.cumulative / aggregate.rolling só são suportados em type: 'line' ou 'area'."
      );
    }
    if (cumulative && rolling) {
      throw new Error(
        "Ainda não é possível usar 'cumulative' e 'rolling' juntos no mesmo gráfico."
      );
    }

    let transformed: QueryResultRow[] = aggregated;

    if (rolling) {
      transformed = applyRollingInOrder(aggregated, rolling);
    } else if (cumulative) {
      transformed = applyCumulativeInOrder(aggregated);
    }

    // NÃO reordenamos mais depois: a ordem usada é a mesma do sort.x
    return { rows: transformed, xField, yField };
  }
}

