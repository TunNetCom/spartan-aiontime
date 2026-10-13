import {
	toBrnComparisons,
	type BrnDataAdapter,
	type BrnFilter,
	type BrnFilterGroup,
	type BrnGridState,
	type BrnSort,
} from '../brn-data-source';

const isBlank = (value: unknown) => value === undefined || value === null || value === '';
const text = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));

function isFilterGroup(filter: BrnFilter | BrnFilterGroup): filter is BrnFilterGroup {
	return 'logic' in filter && 'filters' in filter;
}

/**
 * The default REST filter convention: `contains` keeps the plain `filter[id]=value` shape, every other
 * operator qualifies it (`filter[id][gte]`), `in` joins the list and `equals` stays `filter[id][equals]`.
 * Comparisons and ranges go through `toBrnComparisons`, so `between` splits into its bounds (blank
 * bounds dropped) and date-only bounds cover the whole calendar day (`filter[id][lt]=<next day>`).
 */
export function toRestFilterParams(filter: BrnFilter): Record<string, string> {
	const key = `filter[${filter.id}]`;

	switch (filter.operator) {
		case 'in': {
			const list = (Array.isArray(filter.value) ? filter.value : [filter.value]).filter((v) => !isBlank(v));
			return list.length ? { [`${key}[in]`]: list.map(text).join(',') } : {};
		}
		case 'isEmpty':
		case 'notEmpty':
			return { [`${key}[${filter.operator}]`]: 'true' };
		case 'contains':
			return isBlank(filter.value) ? {} : { [key]: text(filter.value) };
		case 'startsWith':
		case 'endsWith':
			return isBlank(filter.value) ? {} : { [`${key}[${filter.operator}]`]: text(filter.value) };
		case 'notContains':
		case 'notEquals':
			return isBlank(filter.value) ? {} : { [`${key}[${filter.operator}]`]: text(filter.value) };
		case 'isNull':
		case 'notNull':
			return { [`${key}[${filter.operator}]`]: 'true' };
	}

	const params: Record<string, string> = {};
	for (const { operator, value } of toBrnComparisons(filter) ?? []) {
		params[`${key}[${operator === 'eq' ? 'equals' : operator}]`] = text(value);
	}
	return params;
}

export function toRestFilterGroupParams(group: BrnFilterGroup): Record<string, string> {
	const params: Record<string, string> = { [`filter[${group.id}][logic]`]: group.logic };
	group.filters.forEach((f, i) => {
		if (!f) return;
		for (const [k, v] of Object.entries(toRestFilterParams(f))) {
			params[k.replace(`filter[${f.id}]`, `filter[${f.id}][${i}]`)] = v;
		}
	});
	if (group.caseSensitive) params[`filter[${group.id}][case]`] = 'sensitive';
	return params;
}

export function createRestAdapter<TData>(opts: {
	baseUrl: string;
	fetchFn?: (url: string, signal: AbortSignal) => Promise<{ rows: TData[]; total: number }>;
	/** Overrides the default `sortBy`/`sortDir` mapping for every sorted column. */
	mapSort?: (sort: BrnSort) => Record<string, string>;
	/** Overrides the default `filter[id]`/`filter[id][operator]` mapping; return nothing to drop it. */
	mapFilter?: (filter: BrnFilter) => Record<string, string> | undefined;
}): BrnDataAdapter<TData, Record<string, string>> {
	return {
		buildQuery: (s: BrnGridState) => {
			const q: Record<string, string> = { page: String(s.page + 1), pageSize: String(s.pageSize) };
			if (opts.mapSort) {
				// A custom sort syntax owns every sorted column: emitting the default `sort` list
				// alongside it would hand the backend two competing syntaxes.
				for (const sort of s.sorting) Object.assign(q, opts.mapSort(sort));
			} else {
				const [primary, ...rest] = s.sorting;
				if (primary) Object.assign(q, { sortBy: primary.id, sortDir: primary.desc ? 'desc' : 'asc' });
				// `sortBy`/`sortDir` describe a single column, so a multi-column sort is also sent as a
				// `sort=name:asc,email:desc` list that callers can read. Anything else would drop the
				// secondary sorts without telling the endpoint or the caller.
				if (rest.length) q['sort'] = s.sorting.map((x) => `${x.id}:${x.desc ? 'desc' : 'asc'}`).join(',');
			}
			for (const filter of s.filters) {
				const entry = filter as BrnFilter | BrnFilterGroup;
				if (isFilterGroup(entry)) {
					Object.assign(q, toRestFilterGroupParams(entry));
					continue;
				}
				Object.assign(q, opts.mapFilter ? (opts.mapFilter(entry) ?? {}) : toRestFilterParams(entry));
			}
			if (s.globalFilter) q['q'] = s.globalFilter;
			return q;
		},
		fetch: async (query, signal) => {
			if (opts.fetchFn) return opts.fetchFn(`${opts.baseUrl}?${new URLSearchParams(query).toString()}`, signal);
			const res = await fetch(`${opts.baseUrl}?${new URLSearchParams(query).toString()}`, { signal });
			if (!res.ok) throw new Error(`REST fetch failed: ${res.status}`);
			const json = await res.json();
			return { rows: json.data ?? json.rows ?? [], total: json.total ?? json.count ?? 0 };
		},
	};
}
