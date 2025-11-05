// src/utils.ts

export type Operator =
  | "=="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "between";

export interface ParsedCond {
  field: string;
  op: Operator;
  value: any;
  value2?: any;
  valueType: "string" | "number" | "date";
}

// ----------------------------------------------------
// PATH
// ----------------------------------------------------
export function matchPath(path: string, prefixes: string[]): boolean {
  if (!prefixes || prefixes.length === 0) return true;
  for (const p of prefixes) {
    if (p === ".") return true;
    const norm = p.endsWith("/") ? p : p + "/";
    if (path === p || path.startsWith(norm)) return true;
  }
  return false;
}

// ----------------------------------------------------
// TAGS
// ----------------------------------------------------
export function matchTags(props: Record<string, any>, wanted: string[]): boolean {
  if (!wanted || wanted.length === 0) return true;
  const noteTags = props["tags"];
  if (!noteTags) return false;

  if (Array.isArray(noteTags)) {
    for (const w of wanted) {
      if (noteTags.includes(w)) return true;
      if (noteTags.includes("#" + w)) return true;
    }
    return false;
  }

  const s = String(noteTags);
  for (const w of wanted) {
    if (s === w) return true;
    if (s === "#" + w) return true;
  }
  return false;
}

// ----------------------------------------------------
// DATAS
// ----------------------------------------------------
export function looksLikeISODate(v: any): boolean {
  if (typeof v !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}/.test(v);
}

export function toDate(v: any): Date | null {
  if (v instanceof Date) return v;
  if (typeof v !== "string") return null;

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-");
    return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
  }

  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

function startOfDay(d: Date): Date {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

function subDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() - days);
  return d;
}
function subWeeks(base: Date, w: number): Date {
  return subDays(base, w * 7);
}
function subMonths(base: Date, m: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() - m);
  return d;
}
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function addWeeks(base: Date, w: number): Date {
  return addDays(base, w * 7);
}
function addMonths(base: Date, m: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + m);
  return d;
}

// campo “cheira” a data?
export function isDateFieldName(field: string): boolean {
  const f = field.toLowerCase();
  const direct = [
    "date",
    "scheduled",
    "due",
    "start",
    "end",
    "created",
    "modified",
    "datecreated",
    "datemodified",
  ];
  if (direct.includes(f)) return true;
  if (f.endsWith("date")) return true;
  if (f.endsWith("at")) return true;
  if (f.endsWith("on")) return true;
  return false;
}

/**
 * relative:
 *  today / yesterday
 *  -1 / -10 / -7d / -2w / -3m
 *  +1 / +10 / +7d / +2w / +1m
 */
export function resolveRelativeDate(token: string, now?: Date): Date | null {
  const base = now ? new Date(now) : new Date();
  const baseDay = startOfDay(base);
  const t = token.trim().toLowerCase();

  if (t === "today") return baseDay;
  if (t === "yesterday") return startOfDay(subDays(baseDay, 1));

  // passados
  if (/^-\d+$/.test(t)) {
    const n = parseInt(t.slice(1), 10);
    return startOfDay(subDays(baseDay, n));
  }
  if (/^-\d+d$/.test(t)) {
    const n = parseInt(t.slice(1, -1), 10);
    return startOfDay(subDays(baseDay, n));
  }
  if (/^-\d+w$/.test(t)) {
    const n = parseInt(t.slice(1, -1), 10);
    return startOfDay(subWeeks(baseDay, n));
  }
  if (/^-\d+m$/.test(t)) {
    const n = parseInt(t.slice(1, -1), 10);
    return startOfDay(subMonths(baseDay, n));
  }

  // futuros
  if (/^\+\d+$/.test(t)) {
    const n = parseInt(t.slice(1), 10);
    return startOfDay(addDays(baseDay, n));
  }
  if (/^\+\d+d$/.test(t)) {
    const n = parseInt(t.slice(1, -1), 10);
    return startOfDay(addDays(baseDay, n));
  }
  if (/^\+\d+w$/.test(t)) {
    const n = parseInt(t.slice(1, -1), 10);
    return startOfDay(addWeeks(baseDay, n));
  }
  if (/^\+\d+m$/.test(t)) {
    const n = parseInt(t.slice(1, -1), 10);
    return startOfDay(addMonths(baseDay, n));
  }

  return null;
}

// ----------------------------------------------------
// WHERE PARSER
// ----------------------------------------------------
export function parseWhere(expr: string): ParsedCond {
  const raw = expr.trim();

  // between
  const betweenMatch = raw.match(
    /^([a-zA-Z0-9_.-]+)\s+between\s+(.+)\s+and\s+(.+)$/i
  );
  if (betweenMatch) {
    const field = betweenMatch[1].trim();
    const v1raw = betweenMatch[2].trim();
    const v2raw = betweenMatch[3].trim();
    const isDateField = isDateFieldName(field);

    const v1 = parseValueToken(v1raw, isDateField);
    const v2 = parseValueToken(v2raw, isDateField);

    const valueType =
      v1.valueType === "date" || v2.valueType === "date"
        ? "date"
        : v1.valueType;

    return {
      field,
      op: "between",
      value: v1.value,
      value2: v2.value,
      valueType,
    };
  }

  const opRegex = /(==|!=|>=|<=|>|<)/;
  const parts = raw.split(opRegex);
  if (parts.length !== 3) {
    throw new Error("expressão where inválida: " + expr);
  }

  const field = parts[0].trim();
  const op = parts[1].trim() as ParsedCond["op"];
  const valueToken = parts[2].trim();
  const isDateField = isDateFieldName(field);

  const parsed = parseValueToken(valueToken, isDateField);

  return {
    field,
    op,
    value: parsed.value,
    valueType: parsed.valueType,
  };
}

/**
 * parse do valor do lado direito
 * - se o campo É de data → “0”, “today”, “-7d”, “+10d” viram Date
 * - se o campo NÃO é de data → “0” vira número, mas “-7d” e “+10d” ainda são aceitos como data
 */
function parseValueToken(
  token: string,
  forceDate: boolean
): { value: any; valueType: ParsedCond["valueType"] } {
  const raw = token.trim();

  // string com aspas
  if (
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith('"') && raw.endsWith('"'))
  ) {
    const v = raw.slice(1, -1);
    return { value: v, valueType: "string" };
  }

  const lower = raw.toLowerCase();
  const looksRelative =
    lower === "today" ||
    lower === "yesterday" ||
    lower.startsWith("-") ||
    lower.startsWith("+");

  // CAMPO DE DATA → tratar 0/today/relativos como data
  if (forceDate) {
    if (raw === "0" || lower === "today") {
      return { value: startOfDay(new Date()), valueType: "date" };
    }
    const rel = resolveRelativeDate(raw);
    if (rel) return { value: rel, valueType: "date" };
  } else {
    // campo não é de data, mas user usou -7d ou +10d → provavelmente queria data
    if (looksRelative) {
      const rel = resolveRelativeDate(raw);
      if (rel) return { value: rel, valueType: "date" };
    }
  }

  // ISO
  if (looksLikeISODate(raw)) {
    const d = toDate(raw);
    if (d) return { value: d, valueType: "date" };
  }

  // número
  const num = Number(raw);
  if (!Number.isNaN(num)) {
    return { value: num, valueType: "number" };
  }

  // fallback string
  return { value: raw, valueType: "string" };
}

// ----------------------------------------------------
// EVAL
// ----------------------------------------------------
export function evalCond(
  props: Record<string, any>,
  cond: ParsedCond
): boolean {
  const leftRaw = props[cond.field];
  if (leftRaw == null) return false;

  // datas
  if (cond.valueType === "date") {
    const leftDate =
      leftRaw instanceof Date
        ? startOfDay(leftRaw)
        : looksLikeISODate(leftRaw)
        ? startOfDay(toDate(leftRaw)!)
        : null;

    if (!leftDate) return false;

    const rightDate = cond.value instanceof Date ? cond.value : null;
    const rightDate2 = cond.value2 instanceof Date ? cond.value2 : null;
    if (!rightDate) return false;

    const leftTs = leftDate.getTime();
    const rightTs = startOfDay(rightDate).getTime();

    switch (cond.op) {
      case "==":
        return leftTs === rightTs;
      case "!=":
        return leftTs !== rightTs;
      case ">":
        return leftTs > rightTs;
      case ">=":
        return leftTs >= rightTs;
      case "<":
        return leftTs < rightTs;
      case "<=":
        return leftTs <= rightTs;
      case "between":
        if (!rightDate2) return false;
        const toTs = startOfDay(rightDate2).getTime();
        return leftTs >= rightTs && leftTs <= toTs;
    }
  }

  // números
  if (cond.valueType === "number") {
    const leftNum = Number(leftRaw);
    if (isNaN(leftNum)) return false;
    const rightNum = Number(cond.value);
    switch (cond.op) {
      case "==":
        return leftNum === rightNum;
      case "!=":
        return leftNum !== rightNum;
      case ">":
        return leftNum > rightNum;
      case ">=":
        return leftNum >= rightNum;
      case "<":
        return leftNum < rightNum;
      case "<=":
        return leftNum <= rightNum;
      case "between":
        if (typeof cond.value2 !== "number") return false;
        return leftNum >= rightNum && leftNum <= cond.value2;
    }
  }

  // strings
  const leftStr = String(leftRaw);
  const rightStr = String(cond.value);
  switch (cond.op) {
    case "==":
      return leftStr === rightStr;
    case "!=":
      return leftStr !== rightStr;
    case ">":
      return leftStr > rightStr;
    case ">=":
      return leftStr >= rightStr;
    case "<":
      return leftStr < rightStr;
    case "<=":
      return leftStr <= rightStr;
    case "between":
      return false;
  }
}

