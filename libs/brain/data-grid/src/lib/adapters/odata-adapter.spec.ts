import { describe, expect, it } from 'vitest';
import type { BrnFilter, BrnGridState } from '../brn-data-source';
import { buildODataQueryString, createODataAdapter, toODataFilterExpression } from './odata-adapter';

const state = (filters: BrnFilter[], extra: Partial<BrnGridState> = {}): BrnGridState => ({
	page: 0,
	pageSize: 10,
	sorting: [],
	filters,
	...extra,
});

/** Reads the decoded `$filter` value, which is what a service would parse. */
const filterOf = (queryString: string) => new URLSearchParams(queryString).get('$filter');

describe('odata query string', () => {
	it('escapes single quotes and maps sort/filter', () => {
		expect(
			buildODataQueryString(
				state([{ id: 'email', value: "o'h", operator: 'contains' }], {
					page: 2,
					sorting: [{ id: 'email', desc: true }],
				}),
			),
		).toBe(`$top=10&$skip=20&$orderby=email desc&$filter=${encodeURIComponent(`contains(email,'o''h')`)}&$count=true`);
	});
	it('empty state omits orderby/filter', () => {
		expect(buildODataQueryString(state([]))).toBe(`$top=10&$skip=0&$count=true`);
	});
	it('percent-encodes filter values so &?%# cannot split the query', () => {
		const qs = buildODataQueryString(state([{ id: 'email', value: 'a&b#c?d%e', operator: 'contains' }]));
		expect(filterOf(qs)).toBe(`contains(email,'a&b#c?d%e')`);
		expect(new URLSearchParams(qs).get('$count')).toBe('true');
		expect(qs.split('&').filter((p) => p.startsWith('$filter='))).toHaveLength(1);
	});
	it('sends every sort, not only the first', () => {
		expect(
			buildODataQueryString(
				state([], {
					sorting: [
						{ id: 'name', desc: false },
						{ id: 'email', desc: true },
					],
				}),
			),
		).toBe(`$top=10&$skip=0&$orderby=name asc,email desc&$count=true`);
	});
});

describe('odata filters', () => {
	it('maps the text functions', () => {
		expect(filterOf(buildODataQueryString(state([{ id: 'email', value: 'ada', operator: 'contains' }])))).toBe(
			`contains(email,'ada')`,
		);
		expect(filterOf(buildODataQueryString(state([{ id: 'email', value: 'ad', operator: 'startsWith' }])))).toBe(
			`startswith(email,'ad')`,
		);
		expect(filterOf(buildODataQueryString(state([{ id: 'email', value: 'da', operator: 'endsWith' }])))).toBe(
			`endswith(email,'da')`,
		);
	});
	it('translates grid comparisons to OData operators', () => {
		expect(filterOf(buildODataQueryString(state([{ id: 'age', value: 30, operator: 'equals' }])))).toBe('age eq 30');
		expect(filterOf(buildODataQueryString(state([{ id: 'age', value: 30, operator: 'gt' }])))).toBe('age gt 30');
		expect(filterOf(buildODataQueryString(state([{ id: 'age', value: 30, operator: 'gte' }])))).toBe('age ge 30');
		expect(filterOf(buildODataQueryString(state([{ id: 'age', value: 30, operator: 'lt' }])))).toBe('age lt 30');
		expect(filterOf(buildODataQueryString(state([{ id: 'age', value: 30, operator: 'lte' }])))).toBe('age le 30');
	});
	it('AND-s a range and keeps open ends', () => {
		expect(
			filterOf(buildODataQueryString(state([{ id: 'age', value: [18, 65], operator: 'between', type: 'number' }]))),
		).toBe('(age ge 18 and age le 65)');
		expect(
			filterOf(
				buildODataQueryString(state([{ id: 'age', value: [18, undefined], operator: 'between', type: 'number' }])),
			),
		).toBe('age ge 18');
		expect(
			filterOf(
				buildODataQueryString(state([{ id: 'age', value: [undefined, 65], operator: 'between', type: 'number' }])),
			),
		).toBe('age le 65');
	});
	it('OR-s a set filter and unwraps a single entry', () => {
		expect(filterOf(buildODataQueryString(state([{ id: 'status', value: ['open', 'closed'], operator: 'in' }])))).toBe(
			`(status eq 'open' or status eq 'closed')`,
		);
		expect(filterOf(buildODataQueryString(state([{ id: 'status', value: ['open'], operator: 'in' }])))).toBe(
			`status eq 'open'`,
		);
	});
	it('maps emptiness checks', () => {
		expect(filterOf(buildODataQueryString(state([{ id: 'email', value: undefined, operator: 'isEmpty' }])))).toBe(
			'email eq null',
		);
		expect(filterOf(buildODataQueryString(state([{ id: 'email', value: undefined, operator: 'notEmpty' }])))).toBe(
			'email ne null',
		);
	});
	it('quotes by the declared column type, not by looks', () => {
		const cases: [BrnFilter, string][] = [
			[{ id: 'age', value: 30, operator: 'equals', type: 'number' }, 'age eq 30'],
			[{ id: 'active', value: true, operator: 'equals', type: 'boolean' }, 'active eq true'],
			[{ id: 'active', value: false, operator: 'equals', type: 'boolean' }, 'active eq false'],
			[
				{ id: 'created', value: '2024-01-01T00:00:00Z', operator: 'gte', type: 'date' },
				'created ge 2024-01-01T00:00:00Z',
			],
			[{ id: 'code', value: '30', operator: 'equals', type: 'string' }, `code eq '30'`],
			[{ id: 'status', value: 'open', operator: 'equals', type: 'select' }, `status eq 'open'`],
		];
		for (const [filter, expected] of cases) {
			expect(filterOf(buildODataQueryString(state([filter])))).toBe(expected);
		}
	});
	it('leaves numbers and booleans bare when no type is declared', () => {
		expect(filterOf(buildODataQueryString(state([{ id: 'age', value: 30, operator: 'equals' }])))).toBe('age eq 30');
		expect(filterOf(buildODataQueryString(state([{ id: 'active', value: true, operator: 'equals' }])))).toBe(
			'active eq true',
		);
		expect(filterOf(buildODataQueryString(state([{ id: 'code', value: '30', operator: 'equals' }])))).toBe(
			`code eq '30'`,
		);
	});
	it('formats a Date value as an ISO literal for date columns', () => {
		const date = new Date('2024-02-03T04:05:06.000Z');
		expect(
			filterOf(buildODataQueryString(state([{ id: 'created', value: date, operator: 'gte', type: 'date' }]))),
		).toBe('created ge 2024-02-03T04:05:06.000Z');
	});
	it('AND-s several filters of different shapes', () => {
		expect(
			filterOf(
				buildODataQueryString(
					state([
						{ id: 'email', value: 'ada', operator: 'contains' },
						{ id: 'age', value: [18, 65], operator: 'between', type: 'number' },
					]),
				),
			),
		).toBe(`contains(email,'ada') and (age ge 18 and age le 65)`);
	});
	it('drops filters that carry nothing to send', () => {
		expect(filterOf(buildODataQueryString(state([{ id: 'email', value: '', operator: 'contains' }])))).toBeNull();
		expect(filterOf(buildODataQueryString(state([{ id: 'status', value: [], operator: 'in' }])))).toBeNull();
		expect(
			filterOf(buildODataQueryString(state([{ id: 'age', value: [undefined, undefined], operator: 'between' }]))),
		).toBeNull();
	});
	it('lets a custom mapFilter take over, and drop a filter by returning nothing', () => {
		const qs = buildODataQueryString(state([{ id: 'email', value: 'ada', operator: 'contains' }]), {
			mapFilter: (filter) => (filter.id === 'email' ? `tolower(${filter.id}) eq '${String(filter.value)}'` : undefined),
		});
		expect(filterOf(qs)).toBe(`tolower(email) eq 'ada'`);
	});
});

describe('odata global filter', () => {
	it('OR-es the global filter across the configured fields', () => {
		expect(
			filterOf(buildODataQueryString(state([], { globalFilter: "o'b" }), { globalFilterFields: ['name', 'email'] })),
		).toBe(`(contains(name,'o''b') or contains(email,'o''b'))`);
	});
	it('leaves a single configured field unwrapped', () => {
		expect(filterOf(buildODataQueryString(state([], { globalFilter: 'ada' }), { globalFilterFields: ['email'] }))).toBe(
			`contains(email,'ada')`,
		);
	});
	it('omits the global filter when no fields are configured', () => {
		// Nothing to search: guessing a field name would 400 on entities that do not have it.
		expect(filterOf(buildODataQueryString(state([], { globalFilter: 'ada' })))).toBeNull();
	});
	it('combines the global filter with column filters', () => {
		expect(
			filterOf(
				buildODataQueryString(state([{ id: 'age', value: 30, operator: 'gt' }], { globalFilter: 'ada' }), {
					globalFilterFields: ['email'],
				}),
			),
		).toBe(`age gt 30 and contains(email,'ada')`);
	});
});

describe('toODataFilterExpression', () => {
	it('is exported so callers can reuse one operator mapping', () => {
		expect(toODataFilterExpression({ id: 'age', value: 30, operator: 'gte' })).toBe('age ge 30');
		expect(toODataFilterExpression({ id: 'age', value: undefined, operator: 'isEmpty' })).toBe('age eq null');
	});
});

describe('createODataAdapter', () => {
	it('passes the global filter fields through to the query string', () => {
		const adapter = createODataAdapter<string>({ baseUrl: '/odata/Users', globalFilterFields: ['email'] });
		expect(filterOf(adapter.buildQuery(state([], { globalFilter: 'ada' })))).toBe(`contains(email,'ada')`);
	});
});

describe('odata typed values', () => {
	it('makes date-only ranges and equality cover the whole calendar day', () => {
		expect(
			toODataFilterExpression({
				id: 'created',
				value: ['2024-01-01', '2024-01-31'],
				operator: 'between',
				type: 'date',
			}),
		).toBe('(created ge 2024-01-01 and created lt 2024-02-01)');
		expect(toODataFilterExpression({ id: 'created', value: '2024-01-31', operator: 'equals', type: 'date' })).toBe(
			'(created ge 2024-01-31 and created lt 2024-02-01)',
		);
	});
	it('never emits a bare NaN for a non-numeric value in a number column', () => {
		expect(toODataFilterExpression({ id: 'age', value: 'abc', operator: 'equals', type: 'number' })).toBe(
			"age eq 'abc'",
		);
	});
});
