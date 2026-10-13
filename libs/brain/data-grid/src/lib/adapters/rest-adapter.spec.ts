import { describe, expect, it } from 'vitest';
import type { BrnFilter, BrnGridState } from '../brn-data-source';
import { createRestAdapter, toRestFilterParams } from './rest-adapter';

const adapter = createRestAdapter<string>({ baseUrl: '/x', fetchFn: async () => ({ rows: [], total: 0 }) });

const query = (filters: BrnFilter[], sorting: BrnGridState['sorting'] = []) =>
	adapter.buildQuery({ page: 0, pageSize: 10, sorting, filters });

describe('createRestAdapter', () => {
	it('builds page, pageSize, sort and filter params', () => {
		expect(
			adapter.buildQuery({
				page: 1,
				pageSize: 25,
				sorting: [{ id: 'email', desc: true }],
				filters: [{ id: 'email', value: 'x@y', operator: 'contains' }],
			}),
		).toEqual({ page: '2', pageSize: '25', sortBy: 'email', sortDir: 'desc', 'filter[email]': 'x@y' });
	});
	it('exposes raw state so caller can debounce filters but not pagination', async () => {
		const filterQ = adapter.buildQuery({
			page: 0,
			pageSize: 10,
			sorting: [],
			filters: [{ id: 'email', value: 'a', operator: 'contains' }],
		});
		const pageQ = adapter.buildQuery({ page: 3, pageSize: 10, sorting: [], filters: [] });
		expect(filterQ['filter[email]']).toBe('a');
		expect(pageQ['page']).toBe('4');
	});
	it('omits empty, null, and undefined filters (matches OData)', () => {
		expect(
			query([
				{ id: 'email', value: '', operator: 'contains' },
				{ id: 'name', value: null, operator: 'contains' },
				{ id: 'nick', value: undefined, operator: 'contains' },
				{ id: 'age', value: 0, operator: 'equals' },
			]),
		).toEqual({ page: '1', pageSize: '10', 'filter[age][equals]': '0' });
	});
	it('sends every sort so secondary sorts are not silently dropped', () => {
		expect(
			query(
				[],
				[
					{ id: 'name', desc: false },
					{ id: 'email', desc: true },
				],
			),
		).toEqual({ page: '1', pageSize: '10', sortBy: 'name', sortDir: 'asc', sort: 'name:asc,email:desc' });
	});
	it('sends no sort list for a single sort (keeps the documented sortBy/sortDir contract)', () => {
		expect(adapter.buildQuery({ page: 0, pageSize: 10, sorting: [{ id: 'email', desc: true }], filters: [] })).toEqual({
			page: '1',
			pageSize: '10',
			sortBy: 'email',
			sortDir: 'desc',
		});
	});
});

describe('rest default filter mapping', () => {
	it('keeps contains as the plain filter[id]=value shape', () => {
		expect(query([{ id: 'email', value: 'ada', operator: 'contains' }])).toMatchObject({ 'filter[email]': 'ada' });
	});
	it('qualifies the other text operators', () => {
		expect(query([{ id: 'email', value: 'ada', operator: 'equals' }])).toMatchObject({
			'filter[email][equals]': 'ada',
		});
		expect(query([{ id: 'email', value: 'ad', operator: 'startsWith' }])).toMatchObject({
			'filter[email][startsWith]': 'ad',
		});
		expect(query([{ id: 'email', value: 'da', operator: 'endsWith' }])).toMatchObject({
			'filter[email][endsWith]': 'da',
		});
	});
	it('maps every comparison operator', () => {
		for (const operator of ['gt', 'gte', 'lt', 'lte'] as const) {
			expect(query([{ id: 'age', value: 30, operator }])).toMatchObject({ [`filter[age][${operator}]`]: '30' });
		}
	});
	it('splits a range into its bounds', () => {
		expect(query([{ id: 'age', value: [18, 65], operator: 'between' }])).toEqual({
			page: '1',
			pageSize: '10',
			'filter[age][gte]': '18',
			'filter[age][lte]': '65',
		});
	});
	it('keeps ranges open-ended on either side', () => {
		expect(query([{ id: 'age', value: [18, undefined], operator: 'between' }])).toEqual({
			page: '1',
			pageSize: '10',
			'filter[age][gte]': '18',
		});
		expect(query([{ id: 'age', value: [undefined, 65], operator: 'between' }])).toEqual({
			page: '1',
			pageSize: '10',
			'filter[age][lte]': '65',
		});
	});
	it('joins a set filter', () => {
		expect(query([{ id: 'status', value: ['open', 'closed'], operator: 'in' }])).toMatchObject({
			'filter[status][in]': 'open,closed',
		});
	});
	it('flags emptiness checks', () => {
		expect(query([{ id: 'email', value: undefined, operator: 'isEmpty' }])).toMatchObject({
			'filter[email][isEmpty]': 'true',
		});
		expect(query([{ id: 'email', value: undefined, operator: 'notEmpty' }])).toMatchObject({
			'filter[email][notEmpty]': 'true',
		});
	});
	it('drops filters that carry nothing to send', () => {
		expect(query([{ id: 'email', value: '', operator: 'contains' }])).toEqual({ page: '1', pageSize: '10' });
		expect(query([{ id: 'status', value: [], operator: 'in' }])).toEqual({ page: '1', pageSize: '10' });
		expect(query([{ id: 'age', value: [undefined, undefined], operator: 'between' }])).toEqual({
			page: '1',
			pageSize: '10',
		});
	});
	it('sends several filters together and keeps zero and false', () => {
		expect(
			query([
				{ id: 'age', value: 0, operator: 'equals' },
				{ id: 'active', value: false, operator: 'equals' },
			]),
		).toMatchObject({ 'filter[age][equals]': '0', 'filter[active][equals]': 'false' });
	});
	it('combines with sort and the global filter', () => {
		expect(
			adapter.buildQuery({
				page: 2,
				pageSize: 5,
				sorting: [{ id: 'name', desc: false }],
				filters: [{ id: 'age', value: [18, 65], operator: 'between' }],
				globalFilter: 'ada',
			}),
		).toEqual({
			page: '3',
			pageSize: '5',
			sortBy: 'name',
			sortDir: 'asc',
			'filter[age][gte]': '18',
			'filter[age][lte]': '65',
			q: 'ada',
		});
	});
	it('lets a custom mapFilter take over, and drop a filter by returning nothing', () => {
		const custom = createRestAdapter<string>({
			baseUrl: '/x',
			fetchFn: async () => ({ rows: [], total: 0 }),
			mapFilter: (filter) =>
				filter.id === 'skip' ? undefined : { [`where[${filter.id}][${filter.operator}]`]: String(filter.value) },
		});
		expect(
			custom.buildQuery({
				page: 0,
				pageSize: 10,
				sorting: [],
				filters: [
					{ id: 'email', value: 'a', operator: 'contains' },
					{ id: 'skip', value: 'x', operator: 'contains' },
				],
			}),
		).toEqual({ page: '1', pageSize: '10', 'where[email][contains]': 'a' });
	});
	it('lets a custom mapSort take over', () => {
		const custom = createRestAdapter<string>({
			baseUrl: '/x',
			fetchFn: async () => ({ rows: [], total: 0 }),
			mapSort: (sort) => ({ order: `${sort.id}:${sort.desc ? 'desc' : 'asc'}` }),
		});
		expect(custom.buildQuery({ page: 0, pageSize: 10, sorting: [{ id: 'name', desc: true }], filters: [] })).toEqual({
			page: '1',
			pageSize: '10',
			order: 'name:desc',
		});
	});
	it('maps every sort through mapSort and skips the default sort list', () => {
		const custom = createRestAdapter<string>({
			baseUrl: '/x',
			fetchFn: async () => ({ rows: [], total: 0 }),
			mapSort: (sort) => ({ [`order[${sort.id}]`]: sort.desc ? 'desc' : 'asc' }),
		});
		expect(
			custom.buildQuery({
				page: 0,
				pageSize: 10,
				sorting: [
					{ id: 'name', desc: false },
					{ id: 'email', desc: true },
				],
				filters: [],
			}),
		).toEqual({ page: '1', pageSize: '10', 'order[name]': 'asc', 'order[email]': 'desc' });
	});
});

describe('toRestFilterParams', () => {
	it('is exported so callers can reuse one operator mapping', () => {
		expect(toRestFilterParams({ id: 'age', value: 30, operator: 'gte' })).toEqual({ 'filter[age][gte]': '30' });
	});
});

describe('rest typed values', () => {
	it('makes date-only ranges inclusive of the last day', () => {
		expect(
			toRestFilterParams({ id: 'created', value: ['2024-01-01', '2024-01-31'], operator: 'between', type: 'date' }),
		).toEqual({ 'filter[created][gte]': '2024-01-01', 'filter[created][lt]': '2024-02-01' });
	});
	it('sends Date values as ISO strings', () => {
		const value = new Date(Date.UTC(2024, 0, 31, 12));
		expect(toRestFilterParams({ id: 'created', value, operator: 'gte', type: 'date' })).toEqual({
			'filter[created][gte]': '2024-01-31T12:00:00.000Z',
		});
	});
});
