import {
	toBrnComparisons,
	type BrnDataAdapter,
	type BrnFilter,
	type BrnFilterGroup,
	type BrnGridState,
	type BrnSort,
} from '../brn-data-source';

export type GraphQLVariables = {
	offset?: number;
	limit?: number;
	first?: number;
	after?: string;
	orderBy?: unknown;
	where?: unknown;
	search?: string;
};

const isBlank = (value: unknown) => value === undefined || value === null || value === '';

type FilterWithCase = BrnFilter & { caseSensitive?: boolean };

function isFilterGroup(filter: BrnFilter | BrnFilterGroup): filter is BrnFilterGroup {
	return 'logic' in filter && 'filters' in filter;
}

/**
 * Explicit opt-out of the legacy byte-identical output: only `caseSensitive: false` (on the single
 * or on the parent group) adds `mode: 'insensitive'` to text ops. `true` wins, `undefined` keeps
 * the historic fragment so old singles stay byte-identical.
 */
function isInsensitive(filter: BrnFilter, group?: BrnFilterGroup): boolean {
	const single = (filter as FilterWithCase).caseSensitive;
	if (single === true || group?.caseSensitive === true) return false;
	return single === false || group?.caseSensitive === false;
}

function isStringLike(filter: BrnFilter, value: unknown): boolean {
	return (
		filter.type === 'string' || filter.type === 'select' || (filter.type === undefined && typeof value === 'string')
	);
}

/**
 * The default `where` fragment for one grid filter, keyed by the operator name so it lines up with the
 * grid's own vocabulary. Ranges become `{ gte, lte }` with blank bounds dropped, sets become `{ in }`.
 * Values arrive already coerced to the column's declared type (`30`, not `'30'`), which typed GraphQL
 * schemas require; date-only bounds cover the whole calendar day (`{ gte: day, lt: next day }`).
 * A group becomes `{ and: [...] }` / `{ or: [...] }`; text ops gain `mode: 'insensitive'` only for an
 * explicit opt-out so legacy singles stay byte-identical.
 */
export function toGraphQLFilterValue(filter: BrnFilter | BrnFilterGroup): Record<string, unknown> | undefined {
	if (isFilterGroup(filter)) {
		const parts = filter.filters
			.map((entry) => {
				const fragment = toGraphQLSingle(entry, filter);
				return fragment ? { [entry.id]: fragment } : undefined;
			})
			.filter((part): part is Record<string, unknown> => !!part);
		if (!parts.length) return undefined;
		return { [filter.logic]: parts };
	}
	return toGraphQLSingle(filter);
}

function toGraphQLSingle(filter: BrnFilter, group?: BrnFilterGroup): Record<string, unknown> | undefined {
	const insensitive = isInsensitive(filter, group);
	const withMode = (fragment: Record<string, unknown>) =>
		insensitive ? { ...fragment, mode: 'insensitive' } : fragment;
	switch (filter.operator) {
		case 'contains':
			return withMode({ contains: filter.value });
		case 'notContains':
			return withMode({ notContains: filter.value });
		case 'startsWith':
			return withMode({ startsWith: filter.value });
		case 'endsWith':
			return withMode({ endsWith: filter.value });
		case 'notEquals':
			return isStringLike(filter, filter.value) ? withMode({ notEquals: filter.value }) : { notEquals: filter.value };
		case 'isNull':
			return { isNull: true };
		case 'notNull':
			return { notNull: true };
		case 'equals':
		case 'gt':
		case 'gte':
		case 'lt':
		case 'lte':
		case 'between': {
			const bounds: Record<string, unknown> = {};
			for (const { operator, value } of toBrnComparisons(filter) ?? []) {
				bounds[operator === 'eq' ? 'equals' : operator] = value;
			}
			if (!Object.keys(bounds).length) return undefined;
			if (filter.operator === 'equals' && insensitive && isStringLike(filter, filter.value)) {
				return { ...bounds, mode: 'insensitive' };
			}
			return bounds;
		}
		case 'in': {
			const list = (Array.isArray(filter.value) ? filter.value : [filter.value]).filter((v) => !isBlank(v));
			return list.length ? { in: list } : undefined;
		}
		case 'isEmpty':
			return { isEmpty: true };
		case 'notEmpty':
			return { notEmpty: true };
	}
}

/** `fetchFn` is the v1 transport; `endpoint`/`query` are reserved for a future default transport. */
type GraphQLAdapterBaseOptions<TData> = {
	endpoint: string;
	query: string;
	mapSort?: (sort: BrnSort) => unknown;
	/**
	 * Overrides the default `where` fragment for a filter. Return the `where` fragment(s) keyed by
	 * field (e.g. `{ [filter.id]: { eq: filter.value } }`); return nothing to drop the filter.
	 */
	mapFilter?: (filter: BrnFilter) => Record<string, unknown> | undefined;
	fetchFn: (vars: GraphQLVariables, signal: AbortSignal) => Promise<{ rows: TData[]; total: number }>;
};

export type GraphQLAdapterOptions<TData> = GraphQLAdapterBaseOptions<TData> &
	(
		| { mode?: 'offset' }
		| {
				mode: 'cursor';
				/**
				 * Cursor APIs hand back opaque tokens, so a page number cannot be turned into one. The
				 * caller supplies the cursor for a page (e.g. the previous response's `endCursor`).
				 * Required, so cursor mode cannot silently re-request the first page.
				 */
				getCursor: (page: number, pageSize: number) => string | undefined;
		  }
	);

export function createGraphQLAdapter<TData>(
	opts: GraphQLAdapterOptions<TData>,
): BrnDataAdapter<TData, GraphQLVariables> {
	// Narrowed once: cursor mode requires `getCursor`, so its presence switches the query shape.
	const getCursor = opts.mode === 'cursor' ? opts.getCursor : undefined;
	return {
		buildQuery: (s: BrnGridState) => {
			const orderBy = s.sorting.map((x) => (opts.mapSort ? opts.mapSort(x) : { [x.id]: x.desc ? 'DESC' : 'ASC' }));
			const where: Record<string, unknown> = {};
			for (const filter of s.filters) {
				const entry = filter as BrnFilter | BrnFilterGroup;
				if (isFilterGroup(entry)) {
					const groupFragment = toGraphQLFilterValue(entry);
					if (!groupFragment) continue;
					for (const [key, value] of Object.entries(groupFragment)) {
						const existing = where[key];
						if (Array.isArray(existing) && Array.isArray(value)) {
							where[key] = [...existing, ...(value as unknown[])];
						} else {
							where[key] = value;
						}
					}
					continue;
				}
				if (opts.mapFilter) {
					const fragment = opts.mapFilter(entry);
					if (!fragment) continue;
					Object.assign(where, fragment);
					continue;
				}
				const fragment = toGraphQLFilterValue(entry);
				if (!fragment) continue;
				Object.assign(where, { [entry.id]: fragment });
			}
			if (getCursor) {
				if (s.page === 0) {
					return { first: s.pageSize, after: undefined, orderBy, where, search: s.globalFilter };
				}
				// Cursor APIs hand back opaque tokens with no page-number mapping. An unknown cursor
				// must fail loudly: falling back to `after: undefined` would present the first page
				// as the requested one.
				const after = getCursor(s.page, s.pageSize);
				if (after === undefined) {
					throw new Error(`GraphQL cursor is unknown for page ${s.page}`);
				}
				return { first: s.pageSize, after, orderBy, where, search: s.globalFilter };
			}
			return { offset: s.page * s.pageSize, limit: s.pageSize, orderBy, where, search: s.globalFilter };
		},
		fetch: (vars, signal) => opts.fetchFn(vars, signal),
	};
}
