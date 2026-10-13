import { describe, expect, it } from 'vitest';
import {
	BRN_FILTER_OPERATORS,
	brnCoerceFilterValue,
	brnDefaultFilterOperator,
	brnDefaultOperatorForType,
	brnFlattenColumnDefs,
	isBrnFilterSpec,
	toBrnComparisons,
	toBrnFilter,
	toColumnFilters,
	type BrnFilter,
} from './brn-data-source';

describe('brnDefaultFilterOperator', () => {
	it('treats plain text as a contains filter', () => {
		expect(brnDefaultFilterOperator('ada')).toBe('contains');
	});
	it('treats numbers and booleans as equality', () => {
		expect(brnDefaultFilterOperator(0)).toBe('equals');
		expect(brnDefaultFilterOperator(42)).toBe('equals');
		expect(brnDefaultFilterOperator(false)).toBe('equals');
	});
	it('treats an array as a set unless the column is ordered, where a pair is a range', () => {
		expect(brnDefaultFilterOperator(['admin', 'user'])).toBe('in');
		expect(brnDefaultFilterOperator([1, 10])).toBe('in');
		expect(brnDefaultFilterOperator(['a', 'b', 'c'])).toBe('in');
		expect(brnDefaultFilterOperator([1, 10], 'number')).toBe('between');
		expect(brnDefaultFilterOperator(['2024-01-01', '2024-02-01'], 'date')).toBe('between');
		expect(brnDefaultFilterOperator(['admin', 'user'], 'select')).toBe('in');
	});
	it('treats empty values as isEmpty', () => {
		expect(brnDefaultFilterOperator('')).toBe('isEmpty');
		expect(brnDefaultFilterOperator(null)).toBe('isEmpty');
		expect(brnDefaultFilterOperator(undefined)).toBe('isEmpty');
	});
});

describe('isBrnFilterSpec', () => {
	it('recognises the operator/value objects filter controls write', () => {
		expect(isBrnFilterSpec({ operator: 'gte', value: 5 })).toBe(true);
		expect(isBrnFilterSpec({ value: 'ada' })).toBe(true);
		expect(isBrnFilterSpec({ operator: 'isEmpty' })).toBe(true);
	});
	it('rejects primitives, arrays and non-spec objects', () => {
		expect(isBrnFilterSpec('ada')).toBe(false);
		expect(isBrnFilterSpec(7)).toBe(false);
		expect(isBrnFilterSpec(true)).toBe(false);
		expect(isBrnFilterSpec(null)).toBe(false);
		expect(isBrnFilterSpec(['a', 'b'])).toBe(false);
		expect(isBrnFilterSpec({ other: 1 })).toBe(false);
	});
});

describe('toBrnFilter', () => {
	it('resolves a plain value with an inferred operator', () => {
		expect(toBrnFilter('email', 'ada')).toEqual({ id: 'email', value: 'ada', operator: 'contains' });
		expect(toBrnFilter('age', 0)).toEqual({ id: 'age', value: 0, operator: 'equals' });
		expect(toBrnFilter('active', true)).toEqual({ id: 'active', value: true, operator: 'equals' });
	});

	it('keeps the operator the control supplied', () => {
		expect(toBrnFilter('age', { operator: 'gte', value: 30 })).toEqual({
			id: 'age',
			value: 30,
			operator: 'gte',
		});
		expect(toBrnFilter('email', { operator: 'startsWith', value: 'a' })).toEqual({
			id: 'email',
			value: 'a',
			operator: 'startsWith',
		});
	});

	it('drops filters that carry nothing to send', () => {
		expect(toBrnFilter('email', '')).toBeUndefined();
		expect(toBrnFilter('email', null)).toBeUndefined();
		expect(toBrnFilter('email', undefined)).toBeUndefined();
		expect(toBrnFilter('email', [])).toBeUndefined();
		expect(toBrnFilter('tags', { operator: 'in', value: [] })).toBeUndefined();
		expect(toBrnFilter('tags', { operator: 'in', value: ['', null] })).toBeUndefined();
		expect(toBrnFilter('age', { operator: 'between', value: [undefined, undefined] })).toBeUndefined();
	});

	it('keeps zero and false, which are meaningful filter values', () => {
		expect(toBrnFilter('age', { operator: 'equals', value: 0 })).toEqual({
			id: 'age',
			value: 0,
			operator: 'equals',
		});
		expect(toBrnFilter('active', { operator: 'equals', value: false })).toEqual({
			id: 'active',
			value: false,
			operator: 'equals',
		});
	});

	it('keeps an open-ended range when only one bound is set', () => {
		expect(toBrnFilter('age', { operator: 'between', value: [18, undefined] })).toEqual({
			id: 'age',
			value: [18, undefined],
			operator: 'between',
		});
		expect(toBrnFilter('age', { operator: 'between', value: [undefined, 65] })).toEqual({
			id: 'age',
			value: [undefined, 65],
			operator: 'between',
		});
	});

	it('filters empty entries out of an in-filter', () => {
		expect(toBrnFilter('tags', { operator: 'in', value: ['a', '', null, 'b'] })).toEqual({
			id: 'tags',
			value: ['a', 'b'],
			operator: 'in',
		});
	});

	it('carries no value for emptiness checks', () => {
		expect(toBrnFilter('email', { operator: 'isEmpty' })).toEqual({
			id: 'email',
			value: undefined,
			operator: 'isEmpty',
		});
		expect(toBrnFilter('email', { operator: 'notEmpty' })).toEqual({
			id: 'email',
			value: undefined,
			operator: 'notEmpty',
		});
	});

	it('carries a date range as ISO strings', () => {
		expect(toBrnFilter('created', { operator: 'between', value: ['2024-01-01', '2024-02-01'] })).toEqual({
			id: 'created',
			value: ['2024-01-01', '2024-02-01'],
			operator: 'between',
		});
	});
});

describe('toColumnFilters', () => {
	it('round-trips state filters back into TanStack column filters', () => {
		const filters: BrnFilter[] = [
			{ id: 'email', value: 'ada', operator: 'contains' },
			{ id: 'age', value: [18, 65], operator: 'between' },
			{ id: 'email2', value: undefined, operator: 'notEmpty' },
		];
		const columnFilters = toColumnFilters(filters);
		expect(columnFilters).toEqual([
			{ id: 'email', value: { operator: 'contains', value: 'ada' } },
			{ id: 'age', value: { operator: 'between', value: [18, 65] } },
			{ id: 'email2', value: { operator: 'notEmpty', value: undefined } },
		]);
		// …and resolving them again yields the same state filters.
		expect(columnFilters.map((filter) => toBrnFilter(filter.id, filter.value))).toEqual(filters);
	});
});

describe('BRN_FILTER_OPERATORS', () => {
	it('offers text operators only for text columns and ranges for ordered types', () => {
		expect(BRN_FILTER_OPERATORS.string).toContain('contains');
		expect(BRN_FILTER_OPERATORS.string).not.toContain('gte');
		expect(BRN_FILTER_OPERATORS.number).toEqual(['equals', 'gt', 'gte', 'lt', 'lte', 'between']);
		expect(BRN_FILTER_OPERATORS.date).toContain('between');
		expect(BRN_FILTER_OPERATORS.boolean).toEqual(['equals']);
		expect(BRN_FILTER_OPERATORS.select).toContain('in');
	});
});

describe('brnDefaultOperatorForType', () => {
	it('starts ordered columns on a range, choices on equality and text on contains', () => {
		expect(brnDefaultOperatorForType('number')).toBe('between');
		expect(brnDefaultOperatorForType('date')).toBe('between');
		expect(brnDefaultOperatorForType('boolean')).toBe('equals');
		expect(brnDefaultOperatorForType('select')).toBe('equals');
		expect(brnDefaultOperatorForType('string')).toBe('contains');
		expect(brnDefaultOperatorForType(undefined)).toBe('contains');
	});
});

describe('typed filter values', () => {
	it('coerces input strings to the declared column type', () => {
		expect(brnCoerceFilterValue('30', 'number')).toBe(30);
		expect(brnCoerceFilterValue(' 2.5 ', 'number')).toBe(2.5);
		expect(brnCoerceFilterValue('abc', 'number')).toBeUndefined();
		expect(brnCoerceFilterValue('true', 'boolean')).toBe(true);
		expect(brnCoerceFilterValue('false', 'boolean')).toBe(false);
		expect(brnCoerceFilterValue('2024-01-31', 'date')).toBe('2024-01-31');
		expect(brnCoerceFilterValue('30', 'string')).toBe('30');
		expect(brnCoerceFilterValue('30', undefined)).toBe('30');
	});

	it('resolves typed filters with coerced values and drops unreadable ones', () => {
		expect(toBrnFilter('age', { operator: 'gte', value: '30' }, 'number')).toEqual({
			id: 'age',
			value: 30,
			operator: 'gte',
			type: 'number',
		});
		expect(toBrnFilter('age', { operator: 'between', value: ['18', 'x'] }, 'number')).toEqual({
			id: 'age',
			value: [18, undefined],
			operator: 'between',
			type: 'number',
		});
		expect(toBrnFilter('age', { operator: 'gte', value: 'abc' }, 'number')).toBeUndefined();
		expect(toBrnFilter('role', ['admin', 'user'], 'select')).toEqual({
			id: 'role',
			value: ['admin', 'user'],
			operator: 'in',
			type: 'select',
		});
	});
});

describe('toBrnComparisons', () => {
	it('lowers equality, comparisons and ranges into bounds', () => {
		expect(toBrnComparisons({ id: 'age', value: 30, operator: 'equals', type: 'number' })).toEqual([
			{ operator: 'eq', value: 30 },
		]);
		expect(toBrnComparisons({ id: 'age', value: 30, operator: 'lte', type: 'number' })).toEqual([
			{ operator: 'lte', value: 30 },
		]);
		expect(toBrnComparisons({ id: 'age', value: [18, undefined], operator: 'between' })).toEqual([
			{ operator: 'gte', value: 18 },
		]);
		expect(toBrnComparisons({ id: 'name', value: 'a', operator: 'contains' })).toBeUndefined();
	});

	it('makes date-only bounds cover the whole calendar day', () => {
		const date = (operator: BrnFilter['operator'], value: unknown) =>
			toBrnComparisons({ id: 'created', value, operator, type: 'date' });
		expect(date('between', ['2024-01-01', '2024-01-31'])).toEqual([
			{ operator: 'gte', value: '2024-01-01' },
			{ operator: 'lt', value: '2024-02-01' },
		]);
		expect(date('equals', '2024-02-28')).toEqual([
			{ operator: 'gte', value: '2024-02-28' },
			{ operator: 'lt', value: '2024-02-29' },
		]);
		expect(date('lte', '2024-12-31')).toEqual([{ operator: 'lt', value: '2025-01-01' }]);
		expect(date('gt', '2024-03-30')).toEqual([{ operator: 'gte', value: '2024-03-31' }]);
		expect(date('gte', '2024-03-30')).toEqual([{ operator: 'gte', value: '2024-03-30' }]);
		// A full timestamp is already precise and is passed through untouched.
		expect(date('lte', '2024-01-31T12:00:00Z')).toEqual([{ operator: 'lte', value: '2024-01-31T12:00:00Z' }]);
	});
});

describe('brnFlattenColumnDefs', () => {
	it('expands group columns into their leaves', () => {
		const leaves = brnFlattenColumnDefs([
			{ id: 'name' },
			{ id: 'group', columns: [{ accessorKey: 'age' }, { id: 'nested', columns: [{ id: 'email' }] }] },
		]);
		expect(leaves.map((leaf) => leaf.id ?? leaf.accessorKey)).toEqual(['name', 'age', 'email']);
	});
});
