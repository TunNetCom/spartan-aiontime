import {
	isFilterGroup,
	toBrnComparisons,
	type BrnDataAdapter,
	type BrnFilter,
	type BrnFilterGroup,
	type BrnFilterType,
	type BrnGridState,
} from '../brn-data-source';

const esc = (v: unknown) => String(v ?? '').replace(/'/g, "''");
const isBlank = (value: unknown) => value === undefined || value === null || value === '';

type FilterWithCase = BrnFilter & { caseSensitive?: boolean };

/**
 * Explicit opt-out of the legacy byte-identical output: only `caseSensitive: false` (on the single
 * or on the parent group) enables `tolower()` wrapping. `true` always wins over `false`, and
 * `undefined` keeps the historic output so old singles stay byte-identical.
 */
function isInsensitive(filter: BrnFilter, group?: BrnFilterGroup): boolean {
	const single = (filter as FilterWithCase).caseSensitive;
	if (single === true || group?.caseSensitive === true) return false;
	return single === false || group?.caseSensitive === false;
}

/**
 * Formats a filter value as an OData literal. A declared column type wins; without one, numbers and
 * booleans stay bare and everything else is quoted, so no literal is guessed into the wrong type.
 */
function odataLiteral(value: unknown, type?: BrnFilterType): string {
	if (type === 'number') {
		const number = Number(value);
		// A non-numeric value never reaches here from the grid (it is dropped while resolving the
		// filter); quoting it keeps a hand-built filter from emitting a bare `NaN` token.
		return Number.isFinite(number) ? String(number) : `'${esc(value)}'`;
	}
	if (type === 'date') return value instanceof Date ? value.toISOString() : String(value);
	if (type === 'boolean') return value ? 'true' : 'false';
	if (type === 'string' || type === 'select') return `'${esc(value)}'`;

	if (typeof value === 'number') return String(value);
	if (typeof value === 'boolean') return String(value);
	return `'${esc(value)}'`;
}

/**
 * Builds the `$filter` expression for one grid filter, or `undefined` when it carries nothing to send.
 * Comparisons use the OData operator that matches the grid operator (`gte` becomes `ge`), ranges are
 * AND-ed, and sets are OR-ed. A group joins its members with its logic (`(a and b)`).
 * Text ops wrap both sides with `tolower()` only for an explicit opt-out (`caseSensitive: false`);
 * legacy singles without the flag stay byte-identical.
 */
export function toODataFilterExpression(filter: BrnFilter | BrnFilterGroup): string | undefined {
	if (isFilterGroup(filter)) {
		const parts = filter.filters
			.map((entry) => (entry ? toODataSingle(entry, filter) : undefined))
			.filter((expression): expression is string => !!expression);
		if (!parts.length) return undefined;
		return `(${parts.join(` ${filter.logic} `)})`;
	}
	return toODataSingle(filter);
}

function toODataSingle(filter: BrnFilter, group?: BrnFilterGroup): string | undefined {
	const field = filter.id;

	if (filter.operator === 'isEmpty') return `${field} eq null`;
	if (filter.operator === 'notEmpty') return `${field} ne null`;
	if (filter.operator === 'isNull') return `${field} eq null`;
	if (filter.operator === 'notNull') return `${field} ne null`;
	if (!Array.isArray(filter.value) && isBlank(filter.value)) return undefined;

	const insensitive = isInsensitive(filter, group);
	const column = insensitive ? `tolower(${field})` : field;
	const literal = (value: unknown) => {
		const raw = odataLiteral(value, filter.type);
		return insensitive ? `tolower(${raw})` : raw;
	};
	// `ne`/`eq` only fold case for string-like columns; numbers, booleans and dates stay bare.
	const foldable = (value: unknown) =>
		insensitive &&
		(filter.type === 'string' || filter.type === 'select' || (filter.type === undefined && typeof value === 'string'));

	switch (filter.operator) {
		case 'contains':
			return `contains(${column},${literal(filter.value)})`;
		case 'notContains':
			return `not contains(${column},${literal(filter.value)})`;
		case 'startsWith':
			return `startswith(${column},${literal(filter.value)})`;
		case 'endsWith':
			return `endswith(${column},${literal(filter.value)})`;
		case 'notEquals':
			return foldable(filter.value)
				? `${column} ne ${literal(filter.value)}`
				: `${field} ne ${odataLiteral(filter.value, filter.type)}`;
		case 'equals':
		case 'gt':
		case 'gte':
		case 'lt':
		case 'lte':
		case 'between': {
			if (filter.operator === 'equals' && foldable(filter.value)) {
				return `${column} eq ${literal(filter.value)}`;
			}
			const comparisons = { eq: 'eq', ne: 'ne', gt: 'gt', gte: 'ge', lt: 'lt', lte: 'le' } as const;
			const bounds = (toBrnComparisons(filter) ?? []).map(
				({ operator, value }) => `${field} ${comparisons[operator]} ${odataLiteral(value, filter.type)}`,
			);
			if (!bounds.length) return undefined;
			return bounds.length === 1 ? bounds[0] : `(${bounds.join(' and ')})`;
		}
		case 'in': {
			const list = (Array.isArray(filter.value) ? filter.value : [filter.value]).filter((v) => !isBlank(v));
			if (!list.length) return undefined;
			const matches = list.map((value) => `${field} eq ${odataLiteral(value, filter.type)}`);
			return matches.length === 1 ? matches[0] : `(${matches.join(' or ')})`;
		}
	}
}

export type ODataAdapterOptions = {
	/** Fields the global filter searches. Omit it to ignore the global filter. */
	globalFilterFields?: readonly string[];
	/** Overrides the default expression for a filter; return nothing to drop it. */
	mapFilter?: (filter: BrnFilter) => string | undefined;
};

/**
 * Builds the OData query string for a grid state.
 *
 * `globalFilterFields` names the fields the global search term applies to. The grid state carries no
 * column for the global filter, so they cannot be derived from it: without the option the term is
 * dropped rather than guessed at a field the entity may not have (which OData rejects with a 400).
 */
export function buildODataQueryString(s: BrnGridState, opts: ODataAdapterOptions = {}): string {
	const parts = [`$top=${s.pageSize}`, `$skip=${s.page * s.pageSize}`];
	if (s.sorting.length) {
		// `$orderby` takes a comma-separated list, so every sort is sent - not just the first.
		parts.push(`$orderby=${s.sorting.map((x) => `${encodeURIComponent(x.id)} ${x.desc ? 'desc' : 'asc'}`).join(',')}`);
	}
	const filters = s.filters
		.map((filter) => {
			const entry = filter as BrnFilter | BrnFilterGroup;
			if (isFilterGroup(entry)) return toODataFilterExpression(entry);
			return opts.mapFilter ? opts.mapFilter(entry) : toODataFilterExpression(entry);
		})
		.filter((expression): expression is string => !!expression);
	if (s.globalFilter && opts.globalFilterFields?.length) {
		const term = esc(s.globalFilter);
		const searches = opts.globalFilterFields.map((field) => `contains(${field},'${term}')`);
		filters.push(searches.length === 1 ? searches[0] : `(${searches.join(' or ')})`);
	}
	// `'` escaping happens before encoding; the encoded filter keeps `&?%#` inside one `$filter` value.
	if (filters.length) parts.push(`$filter=${encodeURIComponent(filters.join(' and '))}`);
	parts.push('$count=true');
	return parts.join('&');
}

export function createODataAdapter<TData>(opts: {
	baseUrl: string;
	/** Fields the global filter searches. Omit it to ignore the global filter. */
	globalFilterFields?: readonly string[];
	/** Overrides the default expression for a filter; return nothing to drop it. */
	mapFilter?: (filter: BrnFilter) => string | undefined;
	fetchFn?: (url: string, signal: AbortSignal) => Promise<{ rows: TData[]; total: number }>;
}): BrnDataAdapter<TData, string> {
	return {
		buildQuery: (s) => buildODataQueryString(s, opts),
		fetch: async (query, signal) => {
			const url = `${opts.baseUrl}?${query}`;
			if (opts.fetchFn) return opts.fetchFn(url, signal);
			const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
			if (!res.ok) throw new Error(`OData fetch failed: ${res.status}`);
			const json = await res.json();
			return { rows: json.value ?? [], total: json['@odata.count'] ?? json.value?.length ?? 0 };
		},
	};
}
