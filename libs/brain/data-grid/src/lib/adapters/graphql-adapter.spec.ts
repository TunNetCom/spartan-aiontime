import { describe, expect, it } from 'vitest';
import type { BrnFilter } from '../brn-data-source';
import { createGraphQLAdapter, toGraphQLFilterValue, type GraphQLVariables } from './graphql-adapter';

const adapter = createGraphQLAdapter<string>({
	endpoint: '/graphql',
	query: 'q',
	fetchFn: async () => ({ rows: [], total: 0 }),
});

const query = (filters: BrnFilter[], page = 0, pageSize = 10) =>
	adapter.buildQuery({ page, pageSize, sorting: [], filters });

const where = (filters: BrnFilter[]) => query(filters).where as Record<string, unknown>;

describe('graphql variables', () => {
	it('maps state to offset/limit variables by default', () => {
		expect(query([{ id: 'email', value: 'a', operator: 'contains' }], 1, 10)).toEqual({
			offset: 10,
			limit: 10,
			orderBy: [],
			where: { email: { contains: 'a' } },
		});
	});
	it('maps every sort into orderBy', () => {
		const variables = adapter.buildQuery({
			page: 0,
			pageSize: 10,
			sorting: [
				{ id: 'name', desc: false },
				{ id: 'email', desc: true },
			],
			filters: [],
		});
		expect(variables.orderBy).toEqual([{ name: 'ASC' }, { email: 'DESC' }]);
	});
	it('passes the global filter as search', () => {
		expect(adapter.buildQuery({ page: 0, pageSize: 10, sorting: [], filters: [], globalFilter: 'ada' }).search).toBe(
			'ada',
		);
	});
	it('sends the caller-supplied cursor instead of a page offset in cursor mode', () => {
		const cursors = new Map([
			[1, 'cursor-page-1'],
			[2, 'cursor-page-2'],
		]);
		const cursorAdapter = createGraphQLAdapter<string>({
			endpoint: '/g',
			query: 'q',
			mode: 'cursor',
			getCursor: (page) => cursors.get(page),
			fetchFn: async () => ({ rows: [], total: 0 }),
		});
		const first = cursorAdapter.buildQuery({ page: 0, pageSize: 5, sorting: [], filters: [] });
		const third = cursorAdapter.buildQuery({ page: 2, pageSize: 5, sorting: [], filters: [] });
		expect(first.first).toBe(5);
		expect(first.after).toBeUndefined();
		expect(third.after).toBe('cursor-page-2');
		expect(third.offset).toBeUndefined();
		expect(third.limit).toBeUndefined();
	});
	it('propagates fetch errors so helm can keep previous rows', async () => {
		const failing = createGraphQLAdapter<string>({
			endpoint: '/g',
			query: 'q',
			fetchFn: async () => {
				throw new Error('boom');
			},
		});
		await expect(failing.fetch({ offset: 0, limit: 10 }, new AbortController().signal)).rejects.toThrow('boom');
	});
	it('throws for an unknown cursor instead of re-requesting the first page', () => {
		const cursorAdapter = createGraphQLAdapter<string>({
			endpoint: '/g',
			query: 'q',
			mode: 'cursor',
			getCursor: () => undefined,
			fetchFn: async () => ({ rows: [], total: 0 }),
		});
		expect(() => cursorAdapter.buildQuery({ page: 2, pageSize: 5, sorting: [], filters: [] })).toThrow();
	});
});

describe('graphql where fragments', () => {
	it('maps the text operators', () => {
		expect(where([{ id: 'email', value: 'ada', operator: 'contains' }])).toEqual({ email: { contains: 'ada' } });
		expect(where([{ id: 'email', value: 'ada', operator: 'equals' }])).toEqual({ email: { equals: 'ada' } });
		expect(where([{ id: 'email', value: 'ad', operator: 'startsWith' }])).toEqual({ email: { startsWith: 'ad' } });
		expect(where([{ id: 'email', value: 'da', operator: 'endsWith' }])).toEqual({ email: { endsWith: 'da' } });
	});
	it('maps the comparisons', () => {
		for (const operator of ['gt', 'gte', 'lt', 'lte'] as const) {
			expect(where([{ id: 'age', value: 30, operator }])).toEqual({ age: { [operator]: 30 } });
		}
	});
	it('maps a range to gte/lte and keeps open ends', () => {
		expect(where([{ id: 'age', value: [18, 65], operator: 'between' }])).toEqual({ age: { gte: 18, lte: 65 } });
		expect(where([{ id: 'age', value: [18, undefined], operator: 'between' }])).toEqual({ age: { gte: 18 } });
		expect(where([{ id: 'age', value: [undefined, 65], operator: 'between' }])).toEqual({ age: { lte: 65 } });
	});
	it('maps a set to in, dropping blanks', () => {
		expect(where([{ id: 'status', value: ['open', '', null, 'closed'], operator: 'in' }])).toEqual({
			status: { in: ['open', 'closed'] },
		});
	});
	it('maps emptiness checks', () => {
		expect(where([{ id: 'email', value: undefined, operator: 'isEmpty' }])).toEqual({ email: { isEmpty: true } });
		expect(where([{ id: 'email', value: undefined, operator: 'notEmpty' }])).toEqual({ email: { notEmpty: true } });
	});
	it('AND-s several filters by merging them into where', () => {
		expect(
			where([
				{ id: 'email', value: 'ada', operator: 'contains' },
				{ id: 'age', value: [18, 65], operator: 'between' },
			]),
		).toEqual({ email: { contains: 'ada' }, age: { gte: 18, lte: 65 } });
	});
	it('drops filters that carry nothing to send', () => {
		expect(where([{ id: 'status', value: [], operator: 'in' }])).toEqual({});
		expect(where([{ id: 'age', value: [undefined, undefined], operator: 'between' }])).toEqual({});
	});
	it('lets a custom mapFilter take over, and drop a filter by returning nothing', () => {
		const custom = createGraphQLAdapter<string>({
			endpoint: '/g',
			query: 'q',
			mapFilter: (filter) => (filter.id === 'skip' ? undefined : { [filter.id]: { eq: filter.value } }),
			fetchFn: async () => ({ rows: [], total: 0 }),
		});
		const variables = custom.buildQuery({
			page: 0,
			pageSize: 10,
			sorting: [],
			filters: [
				{ id: 'email', value: 'a', operator: 'contains' },
				{ id: 'skip', value: 'x', operator: 'contains' },
			],
		});
		expect(variables.where).toEqual({ email: { eq: 'a' } });
	});
	it('lets a custom mapSort take over', () => {
		const custom = createGraphQLAdapter<string>({
			endpoint: '/g',
			query: 'q',
			mapSort: (sort) => `${sort.id}_${sort.desc ? 'DESC' : 'ASC'}`,
			fetchFn: async () => ({ rows: [], total: 0 }),
		});
		const variables: GraphQLVariables = custom.buildQuery({
			page: 0,
			pageSize: 10,
			sorting: [{ id: 'name', desc: true }],
			filters: [],
		});
		expect(variables.orderBy).toEqual(['name_DESC']);
	});
});

describe('toGraphQLFilterValue', () => {
	it('is exported so callers can reuse one operator mapping', () => {
		expect(toGraphQLFilterValue({ id: 'age', value: 30, operator: 'gte' })).toEqual({ gte: 30 });
		expect(toGraphQLFilterValue({ id: 'age', value: [], operator: 'in' })).toBeUndefined();
	});
});

describe('graphql typed values', () => {
	it('sends numbers as numbers and makes date-only ranges inclusive of the last day', () => {
		expect(
			where([
				{ id: 'age', value: [18, 65], operator: 'between', type: 'number' },
				{ id: 'created', value: ['2024-01-01', '2024-01-31'], operator: 'between', type: 'date' },
			]),
		).toEqual({
			age: { gte: 18, lte: 65 },
			created: { gte: '2024-01-01', lt: '2024-02-01' },
		});
	});
});

describe('graphql negations', () => {
	it('maps notContains', () => {
		expect(toGraphQLFilterValue({ id: 'name', operator: 'notContains', value: 'x', type: 'string' })).toEqual({
			notContains: 'x',
		});
	});
});
