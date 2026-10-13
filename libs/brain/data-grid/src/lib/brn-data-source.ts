export type BrnSort = { id: string; desc: boolean };

/**
 * The operators a grid filter can carry. Each adapter maps them onto its own backend syntax.
 */
export type BrnFilterOperator =
	| 'contains'
	| 'notContains'
	| 'equals'
	| 'notEquals'
	| 'startsWith'
	| 'endsWith'
	| 'gt'
	| 'gte'
	| 'lt'
	| 'lte'
	| 'between'
	| 'in'
	| 'isEmpty'
	| 'notEmpty'
	| 'isNull'
	| 'notNull';

/**
 * The kind of value a column holds. It picks the operators offered for that column, tells the helm
 * filter which control to render, and tells the adapters how to quote the value.
 */
export type BrnFilterType = 'string' | 'number' | 'date' | 'boolean' | 'select';

/**
 * The operators offered for each column type. `in`/`equals` cover select columns, `between` covers
 * numeric and date ranges, and `contains`/`startsWith`/`endsWith` only make sense for text.
 */
export const BRN_FILTER_OPERATORS: Record<BrnFilterType, readonly BrnFilterOperator[]> = {
	string: [
		'contains',
		'equals',
		'startsWith',
		'endsWith',
		'isEmpty',
		'notEmpty',
		'notContains',
		'notEquals',
		'isNull',
		'notNull',
	],
	number: ['equals', 'gt', 'gte', 'lt', 'lte', 'between', 'notEquals', 'isNull', 'notNull'],
	date: ['equals', 'gt', 'gte', 'lt', 'lte', 'between', 'notEquals', 'isNull', 'notNull'],
	boolean: ['equals', 'notEquals', 'isNull', 'notNull'],
	select: ['in', 'equals', 'isEmpty', 'notEmpty', 'notEquals', 'isNull', 'notNull'],
};

/**
 * Column metadata the grid reads to build its filter UI. Attach it to a column definition's `meta`
 * and register the type once with `tableFeatures({ ..., columnMeta: {} as BrnDataGridColumnMeta })`.
 */
export type BrnColumnFilterMeta = {
	/** The kind of value in this column. */
	type: BrnFilterType;
	/** The options a `select` column offers. Server-driven grids cannot facet client-side. */
	options?: readonly { label: string; value: unknown }[];
	/** Overrides the operators offered for this column. */
	operators?: readonly BrnFilterOperator[];
	/** Label shown in the filter UI; defaults to the column id. */
	label?: string;
};

export type BrnDataGridColumnMeta = {
	filter?: BrnColumnFilterMeta;
};

/**
 * The operator a column filter starts with before the user picks one: ranges for numbers and dates,
 * exact matches for booleans and selects, substring search for text.
 */
export function brnDefaultOperatorForType(type: BrnFilterType | undefined): BrnFilterOperator {
	switch (type) {
		case 'number':
		case 'date':
			return 'between';
		case 'boolean':
		case 'select':
			return 'equals';
		default:
			return 'contains';
	}
}

/**
 * The operator assumed when a filter value arrives without one, so a plain text input keeps working
 * without the caller describing an operator. A list is a set (`in`) unless the column is declared as a
 * number or date, where a pair reads as a `[from, to]` range.
 */
export function brnDefaultFilterOperator(value: unknown, type?: BrnFilterType): BrnFilterOperator {
	if (Array.isArray(value)) {
		return value.length === 2 && (type === 'number' || type === 'date') ? 'between' : 'in';
	}
	if (typeof value === 'boolean' || typeof value === 'number') return 'equals';
	if (value === undefined || value === null || value === '') return 'isEmpty';
	if (type) return brnDefaultOperatorForType(type);
	return 'contains';
}

/**
 * A filter as the grid state carries it: the operator is already resolved, so adapters never guess.
 */
export type BrnFilter = {
	id: string;
	/** A scalar for most operators, `[from, to]` for `between`, an array for `in`, unused for `isEmpty`. */
	value: unknown;
	operator: BrnFilterOperator;
	/**
	 * The column's declared type, when the column metadata says. Adapters use it to quote literals
	 * (`30` vs `'30'` vs an ISO date) instead of inferring from the runtime value.
	 */
	type?: BrnFilterType;
};

/**
 * What a filter control writes into TanStack's `columnFilters` state: an operator plus its value.
 */
export type BrnFilterSpec = {
	operator?: BrnFilterOperator;
	value?: unknown;
};

/** Narrows a column filter value to a `BrnFilterSpec` when the UI supplied one. */
export function isBrnFilterSpec(value: unknown): value is BrnFilterSpec {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	return 'operator' in value || 'value' in value;
}

/**
 * Converts one raw filter value to the column's declared type, so every adapter receives `30` for a
 * number column rather than the `'30'` an `<input>` produces. Returns `undefined` for a value that
 * cannot be read as that type (e.g. `'abc'` in a number column), which drops it instead of sending a
 * malformed literal to the backend.
 */
export function brnCoerceFilterValue(value: unknown, type: BrnFilterType | undefined): unknown {
	if (isEmptyBound(value)) return undefined;
	switch (type) {
		case 'number': {
			const number = typeof value === 'number' ? value : Number(String(value).trim());
			return Number.isFinite(number) ? number : undefined;
		}
		case 'boolean':
			if (typeof value === 'boolean') return value;
			if (value === 'true') return true;
			if (value === 'false') return false;
			return undefined;
		case 'date':
			if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
			return String(value);
		default:
			return value;
	}
}

/**
 * Resolves a TanStack column-filter value into a state filter. Returns `undefined` when the filter
 * carries nothing to send, so an empty control never reaches the backend. When the column's `type` is
 * known, values are coerced to it and the filter carries it for the adapters.
 */
export function toBrnFilter(id: string, raw: unknown, type?: BrnFilterType): BrnFilter | undefined {
	const spec = isBrnFilterSpec(raw) ? raw : undefined;
	const value = spec ? spec.value : raw;
	const typed = <T extends BrnFilter>(filter: T): T => (type ? { ...filter, type } : filter);

	// Emptiness checks are only real when a control asked for them by name; a bare empty value is a
	// cleared input, not an `isEmpty` filter.
	if (
		spec?.operator === 'isEmpty' ||
		spec?.operator === 'notEmpty' ||
		spec?.operator === 'isNull' ||
		spec?.operator === 'notNull'
	) {
		return typed({ id, value: undefined, operator: spec.operator });
	}
	if (isEmptyBound(value)) return undefined;

	const operator = spec?.operator ?? brnDefaultFilterOperator(value, type);

	if (operator === 'between') {
		const range = Array.isArray(value) ? value : [value, undefined];
		const from = brnCoerceFilterValue(range[0], type);
		const to = brnCoerceFilterValue(range[1], type);
		if (from === undefined && to === undefined) return undefined;
		return typed({ id, value: [from, to], operator });
	}

	if (operator === 'in') {
		const list = (Array.isArray(value) ? value : [value])
			.map((entry) => brnCoerceFilterValue(entry, type))
			.filter((entry) => entry !== undefined);
		return list.length === 0 ? undefined : typed({ id, value: list, operator });
	}

	const scalar = brnCoerceFilterValue(Array.isArray(value) ? value[0] : value, type);
	return scalar === undefined ? undefined : typed({ id, value: scalar, operator });
}

export type BrnFilterCondition = { operator?: BrnFilterOperator; value?: unknown };
export type BrnCompositeSpec = {
	logic: 'and' | 'or';
	conditions: [BrnFilterCondition, BrnFilterCondition?];
	caseSensitive?: boolean;
};
export type BrnFilterGroup = {
	id: string;
	logic: 'and' | 'or';
	filters: [BrnFilter, BrnFilter?];
	type?: BrnFilterType;
	caseSensitive?: boolean;
};

export function toBrnFilterGroup(
	id: string,
	raw: unknown,
	type?: BrnFilterType,
): BrnFilter | BrnFilterGroup | undefined {
	if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && 'conditions' in raw) {
		const spec = raw as BrnCompositeSpec;
		const [c1, c2] = spec.conditions;
		const f1 = toBrnFilter(id, c1, type);
		const f2 = c2 ? toBrnFilter(id, c2, type) : undefined;
		if (!f1 && !f2) return undefined;
		if (f1 && !f2) return f1;
		const filters = [f1, f2].filter((f): f is BrnFilter => !!f);
		return {
			id,
			logic: spec.logic ?? 'and',
			filters: filters as [BrnFilter, BrnFilter?],
			...(type ? { type } : {}),
			...(spec.caseSensitive ? { caseSensitive: true } : {}),
		};
	}
	return toBrnFilter(id, raw, type);
}

/** A single bound an adapter writes: `field <operator> value`. */
export type BrnComparison = { operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'; value: unknown };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar day after a `YYYY-MM-DD` date, in the same format (computed in UTC, no DST drift). */
function nextDay(date: string): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/**
 * Lowers an equality, comparison or range filter into the bounds an adapter writes, or `undefined`
 * for operators that are not comparisons (`contains`, `in`, ...). Blank range bounds are dropped, so
 * `between` can be open on either side.
 *
 * Date-only values (`YYYY-MM-DD`, what a date input produces) name a whole calendar day. Against a
 * date-time field, `lte 2024-01-31` would stop at midnight and drop the rest of that day, so a
 * date-only upper bound becomes `lt` the next day, `gt` becomes `gte` the next day, and `equals`
 * becomes the `[day, next day)` window. Against a plain date field the result is equivalent.
 */
export function toBrnComparisons(filter: BrnFilter): BrnComparison[] | undefined {
	const dateOnly = (value: unknown): value is string =>
		filter.type === 'date' && typeof value === 'string' && DATE_ONLY.test(value);
	const bound = (operator: BrnComparison['operator'], value: unknown): BrnComparison[] => {
		if (isEmptyBound(value)) return [];
		if (dateOnly(value)) {
			if (operator === 'eq') {
				return [
					{ operator: 'gte', value },
					{ operator: 'lt', value: nextDay(value) },
				];
			}
			if (operator === 'lte') return [{ operator: 'lt', value: nextDay(value) }];
			if (operator === 'gt') return [{ operator: 'gte', value: nextDay(value) }];
		}
		return [{ operator, value }];
	};

	switch (filter.operator) {
		case 'equals':
			return bound('eq', filter.value);
		case 'notEquals':
			return bound('ne', filter.value);
		case 'gt':
		case 'gte':
		case 'lt':
		case 'lte':
			return bound(filter.operator, filter.value);
		case 'between': {
			const [from, to] = Array.isArray(filter.value) ? filter.value : [undefined, undefined];
			return [...bound('gte', from), ...bound('lte', to)];
		}
		default:
			return undefined;
	}
}

type BrnColumnDefLike = {
	id?: unknown;
	accessorKey?: unknown;
	columns?: readonly unknown[];
	meta?: BrnDataGridColumnMeta;
};

/** Leaf column definitions, with group columns (`columns: [...]`) expanded. */
export function brnFlattenColumnDefs(columns: readonly unknown[]): BrnColumnDefLike[] {
	return columns.flatMap((column) => {
		const def = column as BrnColumnDefLike;
		return def.columns?.length ? brnFlattenColumnDefs(def.columns) : [def];
	});
}

/** The id TanStack gives a column definition: its `id`, else its `accessorKey`. */
export function brnColumnDefId(def: BrnColumnDefLike): string | undefined {
	const id = def.id ?? def.accessorKey;
	return id === undefined || id === null ? undefined : String(id);
}

/** Turns state filters back into the TanStack column filters the table state expects. */
export function toColumnFilters(filters: readonly BrnFilter[]): { id: string; value: unknown }[] {
	return filters.map((filter) => ({ id: filter.id, value: { operator: filter.operator, value: filter.value } }));
}

function isEmptyBound(value: unknown): boolean {
	return value === undefined || value === null || value === '';
}

export type BrnGridState = {
	page: number;
	pageSize: number;
	sorting: BrnSort[];
	filters: BrnFilter[];
	globalFilter?: string;
};

export interface BrnDataAdapter<TData, TQuery> {
	buildQuery(state: BrnGridState): TQuery;
	fetch(query: TQuery, signal: AbortSignal): Promise<{ rows: TData[]; total: number }>;
}
