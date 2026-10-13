import type { BrnDataAdapter, BrnFilter, BrnGridState, BrnSort } from '../brn-data-source';

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

/**
 * The default `where` fragment for one grid filter, keyed by the operator name so it lines up with the
 * grid's own vocabulary. Ranges become `{ gte, lte }` with blank bounds dropped, sets become `{ in }`.
 */
export function toGraphQLFilterValue(filter: BrnFilter): Record<string, unknown> | undefined {
	switch (filter.operator) {
		case 'contains':
			return { contains: filter.value };
		case 'startsWith':
			return { startsWith: filter.value };
		case 'endsWith':
			return { endsWith: filter.value };
		case 'equals':
			return { equals: filter.value };
		case 'gt':
		case 'gte':
		case 'lt':
		case 'lte':
			return { [filter.operator]: filter.value };
		case 'between': {
			const [from, to] = Array.isArray(filter.value) ? filter.value : [undefined, undefined];
			const bounds: Record<string, unknown> = {};
			if (!isBlank(from)) bounds['gte'] = from;
			if (!isBlank(to)) bounds['lte'] = to;
			return Object.keys(bounds).length ? bounds : undefined;
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
				if (opts.mapFilter) {
					const fragment = opts.mapFilter(filter);
					if (!fragment) continue;
					Object.assign(where, fragment);
					continue;
				}
				const fragment = toGraphQLFilterValue(filter);
				if (!fragment) continue;
				Object.assign(where, { [filter.id]: fragment });
			}
			if (getCursor)
				return {
					first: s.pageSize,
					after: s.page > 0 ? getCursor(s.page, s.pageSize) : undefined,
					orderBy,
					where,
					search: s.globalFilter,
				};
			return { offset: s.page * s.pageSize, limit: s.pageSize, orderBy, where, search: s.globalFilter };
		},
		fetch: (vars, signal) => opts.fetchFn(vars, signal),
	};
}
