export type BrnSort = { id: string; desc: boolean };

/**
 * The operators a grid filter can carry. Each adapter maps them onto its own backend syntax.
 */
export type BrnFilterOperator =
	| 'contains'
	| 'equals'
	| 'startsWith'
	| 'endsWith'
	| 'gt'
	| 'gte'
	| 'lt'
	| 'lte'
	| 'between'
	| 'in'
	| 'isEmpty'
	| 'notEmpty';

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
	string: ['contains', 'equals', 'startsWith', 'endsWith', 'isEmpty', 'notEmpty'],
	number: ['equals', 'gt', 'gte', 'lt', 'lte', 'between'],
	date: ['equals', 'gt', 'gte', 'lt', 'lte', 'between'],
	boolean: ['equals'],
	select: ['in', 'equals', 'isEmpty', 'notEmpty'],
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
 * The operator assumed when a filter value arrives without one, so a plain text input keeps working
 * without the caller describing an operator.
 */
export function brnDefaultFilterOperator(value: unknown): BrnFilterOperator {
	if (Array.isArray(value)) return value.length === 2 ? 'between' : 'in';
	if (typeof value === 'boolean' || typeof value === 'number') return 'equals';
	if (value === undefined || value === null || value === '') return 'isEmpty';
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
 * Resolves a TanStack column-filter value into a state filter. Returns `undefined` when the filter
 * carries nothing to send, so an empty control never reaches the backend.
 */
export function toBrnFilter(id: string, raw: unknown): BrnFilter | undefined {
	const spec = isBrnFilterSpec(raw) ? raw : undefined;
	const value = spec ? spec.value : raw;

	// Emptiness checks are only real when a control asked for them by name; a bare empty value is a
	// cleared input, not an `isEmpty` filter.
	if (spec?.operator === 'isEmpty' || spec?.operator === 'notEmpty') {
		return { id, value: undefined, operator: spec.operator };
	}
	if (value === undefined || value === null || value === '') return undefined;

	const operator = spec?.operator ?? brnDefaultFilterOperator(value);

	if (operator === 'between') {
		const range = Array.isArray(value) ? value : [undefined, undefined];
		const [from, to] = range;
		if (isEmptyBound(from) && isEmptyBound(to)) return undefined;
		return { id, value: range, operator };
	}

	if (operator === 'in') {
		const list = (Array.isArray(value) ? value : [value]).filter((entry) => !isEmptyBound(entry));
		return list.length === 0 ? undefined : { id, value: list, operator };
	}

	return { id, value, operator };
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
