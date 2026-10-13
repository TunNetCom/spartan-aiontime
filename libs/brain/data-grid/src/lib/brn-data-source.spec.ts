import { describe, expect, it } from 'vitest';
import {
	BRN_FILTER_OPERATORS,
	brnDefaultFilterOperator,
	isBrnFilterSpec,
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
	it('treats a two-entry array as a range and longer arrays as a set', () => {
		expect(brnDefaultFilterOperator([1, 10])).toBe('between');
		expect(brnDefaultFilterOperator(['a', 'b', 'c'])).toBe('in');
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
