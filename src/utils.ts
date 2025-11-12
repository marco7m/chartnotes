/**
 * Utility Functions
 * 
 * Provides helper functions for path matching, tag matching, date parsing,
 * and WHERE clause evaluation.
 */

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Path Matching
// ============================================================================

/**
 * Checks if a path matches any of the given prefixes.
 * 
 * @param path - Path to check
 * @param prefixes - Array of path prefixes to match against
 * @returns True if path matches any prefix
 */
export function matchPath(path: string, prefixes: string[]): boolean {
	if (!prefixes || prefixes.length === 0) return true;
	for (const prefix of prefixes) {
		if (prefix === ".") return true;
		const normalized = prefix.endsWith("/") ? prefix : prefix + "/";
		if (path === prefix || path.startsWith(normalized)) return true;
	}
	return false;
}

// ============================================================================
// Tag Matching
// ============================================================================

/**
 * Checks if note properties contain any of the wanted tags.
 * 
 * @param props - Note properties object
 * @param wanted - Array of tag names to search for
 * @returns True if any wanted tag is found
 */
export function matchTags(props: Record<string, any>, wanted: string[]): boolean {
	if (!wanted || wanted.length === 0) return true;
	const noteTags = props["tags"];
	if (!noteTags) return false;

	if (Array.isArray(noteTags)) {
		for (const wantedTag of wanted) {
			if (noteTags.includes(wantedTag)) return true;
			if (noteTags.includes("#" + wantedTag)) return true;
		}
		return false;
	}

	const tagString = String(noteTags);
	for (const wantedTag of wanted) {
		if (tagString === wantedTag) return true;
		if (tagString === "#" + wantedTag) return true;
	}
	return false;
}

// ============================================================================
// Date Parsing
// ============================================================================

/**
 * Checks if a value looks like an ISO date string (YYYY-MM-DD...).
 */
export function looksLikeISODate(value: any): boolean {
	if (typeof value !== "string") return false;
	return /^\d{4}-\d{2}-\d{2}/.test(value);
}

/**
 * Converts a value to a Date object.
 * 
 * Supports:
 * - Date objects (returns as-is if valid)
 * - ISO strings: YYYY-MM-DD or YYYY-MM-DD HH:MM[:SS] or YYYY-MM-DDTHH:MM[:SS]
 * - Other formats (fallback to JavaScript Date parsing)
 * 
 * All dates are treated as LOCAL time (ignores timezone info).
 */
export function toDate(value: any): Date | null {
	if (value instanceof Date && !isNaN(value.getTime())) return value;
	if (typeof value !== "string") return null;

	const trimmed = value.trim();

	// Pattern: YYYY-MM-DD or YYYY-MM-DD HH:MM[:SS] or YYYY-MM-DDTHH:MM[:SS]
	// Ignores anything after (Z, offset, etc) and treats everything as LOCAL time
	const match = trimmed.match(
		/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/
	);
	if (match) {
		const year = Number(match[1]);
		const month = Number(match[2]) - 1;
		const day = Number(match[3]);
		const hour = match[4] ? Number(match[4]) : 0;
		const minute = match[5] ? Number(match[5]) : 0;
		const second = match[6] ? Number(match[6]) : 0;

		if (
			Number.isNaN(year) ||
			Number.isNaN(month) ||
			Number.isNaN(day) ||
			Number.isNaN(hour) ||
			Number.isNaN(minute) ||
			Number.isNaN(second)
		) {
			return null;
		}

		// Everything in local time, no timezone
		return new Date(year, month, day, hour, minute, second, 0);
	}

	// Fallback: let JavaScript try to interpret other formats
	const fallback = new Date(trimmed);
	if (isNaN(fallback.getTime())) return null;
	return fallback;
}

// ============================================================================
// Date Helper Functions
// ============================================================================

function startOfDay(date: Date): Date {
	const result = new Date(date);
	result.setHours(0, 0, 0, 0);
	return result;
}

function subDays(base: Date, days: number): Date {
	const result = new Date(base);
	result.setDate(result.getDate() - days);
	return result;
}

function subWeeks(base: Date, weeks: number): Date {
	return subDays(base, weeks * 7);
}

function subMonths(base: Date, months: number): Date {
	const result = new Date(base);
	result.setMonth(result.getMonth() - months);
	return result;
}

function addDays(base: Date, days: number): Date {
	const result = new Date(base);
	result.setDate(result.getDate() + days);
	return result;
}

function addWeeks(base: Date, weeks: number): Date {
	return addDays(base, weeks * 7);
}

function addMonths(base: Date, months: number): Date {
	const result = new Date(base);
	result.setMonth(result.getMonth() + months);
	return result;
}

/**
 * Checks if a field name "smells" like a date field.
 * 
 * Recognizes common date field names like: date, scheduled, due, start, end,
 * created, modified, and fields ending with "date", "at", or "on".
 */
export function isDateFieldName(field: string): boolean {
	const lower = field.toLowerCase();
	const directMatches = [
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
	if (directMatches.includes(lower)) return true;
	if (lower.endsWith("date")) return true;
	if (lower.endsWith("at")) return true;
	if (lower.endsWith("on")) return true;
	return false;
}

/**
 * Resolves relative date tokens to absolute dates.
 * 
 * Supported formats:
 * - today / yesterday
 * - -1 / -10 / -7d / -2w / -3m (past)
 * - +1 / +10 / +7d / +2w / +1m (future)
 * 
 * @param token - Relative date token
 * @param now - Optional reference date (defaults to current date)
 * @returns Resolved Date or null if token is invalid
 */
export function resolveRelativeDate(token: string, now?: Date): Date | null {
	const base = now ? new Date(now) : new Date();
	const baseDay = startOfDay(base);
	const trimmed = token.trim().toLowerCase();

	if (trimmed === "today") return baseDay;
	if (trimmed === "yesterday") return startOfDay(subDays(baseDay, 1));

	// Past dates
	if (/^-\d+$/.test(trimmed)) {
		const days = parseInt(trimmed.slice(1), 10);
		return startOfDay(subDays(baseDay, days));
	}
	if (/^-\d+d$/.test(trimmed)) {
		const days = parseInt(trimmed.slice(1, -1), 10);
		return startOfDay(subDays(baseDay, days));
	}
	if (/^-\d+w$/.test(trimmed)) {
		const weeks = parseInt(trimmed.slice(1, -1), 10);
		return startOfDay(subWeeks(baseDay, weeks));
	}
	if (/^-\d+m$/.test(trimmed)) {
		const months = parseInt(trimmed.slice(1, -1), 10);
		return startOfDay(subMonths(baseDay, months));
	}

	// Future dates
	if (/^\+\d+$/.test(trimmed)) {
		const days = parseInt(trimmed.slice(1), 10);
		return startOfDay(addDays(baseDay, days));
	}
	if (/^\+\d+d$/.test(trimmed)) {
		const days = parseInt(trimmed.slice(1, -1), 10);
		return startOfDay(addDays(baseDay, days));
	}
	if (/^\+\d+w$/.test(trimmed)) {
		const weeks = parseInt(trimmed.slice(1, -1), 10);
		return startOfDay(addWeeks(baseDay, weeks));
	}
	if (/^\+\d+m$/.test(trimmed)) {
		const months = parseInt(trimmed.slice(1, -1), 10);
		return startOfDay(addMonths(baseDay, months));
	}

	return null;
}

// ============================================================================
// WHERE Clause Parser
// ============================================================================

/**
 * Parses a WHERE clause expression into a structured condition.
 * 
 * Supports:
 * - Comparison operators: ==, !=, >, >=, <, <=
 * - Between operator: field between value1 and value2
 * 
 * @param expr - WHERE clause expression string
 * @returns Parsed condition object
 * @throws Error if expression is invalid
 */
export function parseWhere(expr: string): ParsedCond {
	const trimmed = expr.trim();

	// Parse "between" operator
	const betweenMatch = trimmed.match(
		/^([a-zA-Z0-9_.-]+)\s+between\s+(.+)\s+and\s+(.+)$/i
	);
	if (betweenMatch) {
		const field = betweenMatch[1].trim();
		const value1Raw = betweenMatch[2].trim();
		const value2Raw = betweenMatch[3].trim();
		const isDateField = isDateFieldName(field);

		const value1 = parseValueToken(value1Raw, isDateField);
		const value2 = parseValueToken(value2Raw, isDateField);

		const valueType =
			value1.valueType === "date" || value2.valueType === "date"
				? "date"
				: value1.valueType;

		return {
			field,
			op: "between",
			value: value1.value,
			value2: value2.value,
			valueType,
		};
	}

	// Parse comparison operators
	const opRegex = /(==|!=|>=|<=|>|<)/;
	const parts = trimmed.split(opRegex);
	if (parts.length !== 3) {
		throw new Error(`Invalid WHERE expression: ${expr}`);
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
 * Parses a value token from a WHERE clause.
 * 
 * Value parsing logic:
 * - If field IS a date field → "0", "today", "-7d", "+10d" become Date
 * - If field is NOT a date field → "0" becomes number, but "-7d" and "+10d" are still accepted as dates
 * 
 * @param token - Value token string
 * @param forceDate - Whether to force date parsing
 * @returns Parsed value and its type
 */
function parseValueToken(
	token: string,
	forceDate: boolean
): { value: any; valueType: ParsedCond["valueType"] } {
	const trimmed = token.trim();

	// Quoted string
	if (
		(trimmed.startsWith("'") && trimmed.endsWith("'")) ||
		(trimmed.startsWith('"') && trimmed.endsWith('"'))
	) {
		const value = trimmed.slice(1, -1);
		return { value, valueType: "string" };
	}

	const lower = trimmed.toLowerCase();
	const looksRelative =
		lower === "today" ||
		lower === "yesterday" ||
		lower.startsWith("-") ||
		lower.startsWith("+");

	// DATE FIELD → treat 0/today/relatives as date
	if (forceDate) {
		if (trimmed === "0" || lower === "today") {
			return { value: startOfDay(new Date()), valueType: "date" };
		}
		const relative = resolveRelativeDate(trimmed);
		if (relative) return { value: relative, valueType: "date" };
	} else {
		// Field is not a date, but user used -7d or +10d → probably wanted date
		if (looksRelative) {
			const relative = resolveRelativeDate(trimmed);
			if (relative) return { value: relative, valueType: "date" };
		}
	}

	// ISO date
	if (looksLikeISODate(trimmed)) {
		const date = toDate(trimmed);
		if (date) return { value: date, valueType: "date" };
	}

	// Number
	const num = Number(trimmed);
	if (!Number.isNaN(num)) {
		return { value: num, valueType: "number" };
	}

	// Fallback: string
	return { value: trimmed, valueType: "string" };
}

// ============================================================================
// Condition Evaluation
// ============================================================================

/**
 * Evaluates a parsed condition against note properties.
 * 
 * @param props - Note properties object
 * @param cond - Parsed condition
 * @returns True if condition matches
 */
export function evalCond(
	props: Record<string, any>,
	cond: ParsedCond
): boolean {
	const leftRaw = props[cond.field];
	if (leftRaw == null) return false;

	// Date comparisons
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

		const leftTimestamp = leftDate.getTime();
		const rightTimestamp = startOfDay(rightDate).getTime();

		switch (cond.op) {
			case "==":
				return leftTimestamp === rightTimestamp;
			case "!=":
				return leftTimestamp !== rightTimestamp;
			case ">":
				return leftTimestamp > rightTimestamp;
			case ">=":
				return leftTimestamp >= rightTimestamp;
			case "<":
				return leftTimestamp < rightTimestamp;
			case "<=":
				return leftTimestamp <= rightTimestamp;
			case "between":
				if (!rightDate2) return false;
				const toTimestamp = startOfDay(rightDate2).getTime();
				return (
					leftTimestamp >= rightTimestamp &&
					leftTimestamp <= toTimestamp
				);
		}
	}

	// Number comparisons
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

	// String comparisons
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
			return false; // Between not supported for strings
	}

	return false;
}
