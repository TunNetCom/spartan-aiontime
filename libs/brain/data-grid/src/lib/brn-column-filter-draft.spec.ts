import { describe, expect, it } from 'vitest';
import {
	brnCompositeToGroup,
	brnDraftFromRaw,
	brnDraftHasOption,
	brnDraftSetOperator,
	brnDraftSetRange,
	brnDraftSetValue,
	brnDraftToSpec,
	brnDraftToggleOption,
	brnFilterOperators,
	brnInitialOperator,
	brnOptionKey,
} from './brn-column-filter-draft';
import type { BrnColumnFilterMeta } from './brn-data-source';

const string: BrnColumnFilterMeta = { type: 'string' };
const number: BrnColumnFilterMeta = { type: 'number' };
const select: BrnColumnFilterMeta = {
	type: 'select',
	options: [
		{ label: 'Admin', value: 'admin' },
		{ label: 'User', value: 'user' },
	],
};

describe('brnFilterOperators / brnInitialOperator', () => {
	it('offers the defaults of the declared type', () => {
		expect(brnFilterOperators(string)).toContain('contains');
		expect(brnFilterOperators(number)).toContain('between');
	});

	it('lets a column override the operators', () => {
		expect(brnFilterOperators({ type: 'string', operators: ['equals'] })).toEqual(['equals']);
	});

	it('starts on the type default when it is offered', () => {
		expect(brnInitialOperator(string)).toBe('contains');
		expect(brnInitialOperator(number)).toBe('between');
		expect(brnInitialOperator(select)).toBe('equals');
	});

	it('falls back to the first offered operator when the type default is not offered', () => {
		expect(brnInitialOperator({ type: 'string', operators: ['startsWith', 'endsWith'] })).toBe('startsWith');
	});
});

describe('brnDraftFromRaw', () => {
	it('starts an unfiltered column on its initial operator with no value', () => {
		expect(brnDraftFromRaw(undefined, string)).toEqual({ operator: 'contains', value: undefined });
		expect(brnDraftFromRaw('', number)).toEqual({ operator: 'between', value: undefined });
	});

	it('reads an operator spec as it is', () => {
		expect(brnDraftFromRaw({ operator: 'gt', value: 5 }, number)).toEqual({ operator: 'gt', value: 5 });
	});

	it('fills the initial operator when a spec has none', () => {
		expect(brnDraftFromRaw({ value: 'ada' }, string)).toEqual({ operator: 'contains', value: 'ada' });
	});

	it('resolves a bare value to the default operator for it', () => {
		expect(brnDraftFromRaw('ada', string)).toEqual({ operator: 'contains', value: 'ada' });
		expect(brnDraftFromRaw(true, { type: 'boolean' })).toEqual({ operator: 'equals', value: true });
		expect(brnDraftFromRaw(['a', 'b'], select)).toEqual({ operator: 'in', value: ['a', 'b'] });
	});
});

describe('brnDraftSetOperator', () => {
	it('drops the value for an emptiness check', () => {
		expect(brnDraftSetOperator({ operator: 'contains', value: 'ada' }, 'isEmpty')).toEqual({
			operator: 'isEmpty',
			value: undefined,
		});
		expect(brnDraftSetOperator({ operator: 'equals', value: 'x' }, 'notEmpty').value).toBeUndefined();
	});

	it('turns a single value into the lower bound of a range', () => {
		expect(brnDraftSetOperator({ operator: 'equals', value: 5 }, 'between')).toEqual({
			operator: 'between',
			value: [5, undefined],
		});
	});

	it('keeps both bounds of a range when it stays a range', () => {
		expect(brnDraftSetOperator({ operator: 'between', value: [1, 9] }, 'between').value).toEqual([1, 9]);
	});

	it('has no value when a range has no bound', () => {
		expect(brnDraftSetOperator({ operator: 'equals', value: undefined }, 'between').value).toBeUndefined();
		expect(brnDraftSetOperator({ operator: 'between', value: ['', undefined] }, 'between').value).toBeUndefined();
	});

	it('turns a range into its first set bound for a single operator', () => {
		expect(brnDraftSetOperator({ operator: 'between', value: [3, 9] }, 'gt')).toEqual({ operator: 'gt', value: 3 });
		expect(brnDraftSetOperator({ operator: 'between', value: [undefined, 9] }, 'lt')).toEqual({
			operator: 'lt',
			value: 9,
		});
	});

	it('keeps a chosen set when switching to `in`', () => {
		expect(brnDraftSetOperator({ operator: 'in', value: ['a', 'b'] }, 'in').value).toEqual(['a', 'b']);
		expect(brnDraftSetOperator({ operator: 'equals', value: 'a' }, 'in').value).toEqual(['a']);
		expect(brnDraftSetOperator({ operator: 'equals', value: undefined }, 'in').value).toBeUndefined();
	});

	it('keeps the first chosen entry when leaving a set for a single choice', () => {
		expect(brnDraftSetOperator({ operator: 'in', value: ['a', 'b'] }, 'equals')).toEqual({
			operator: 'equals',
			value: 'a',
		});
	});

	it('keeps a single value across single operators', () => {
		expect(brnDraftSetOperator({ operator: 'contains', value: 'ada' }, 'startsWith')).toEqual({
			operator: 'startsWith',
			value: 'ada',
		});
	});

	it('restores a value after an emptiness check only from what it still holds', () => {
		const empty = brnDraftSetOperator({ operator: 'contains', value: 'ada' }, 'isEmpty');
		expect(brnDraftSetOperator(empty, 'contains').value).toBeUndefined();
	});
});

describe('value edits', () => {
	it('sets a single value and treats blank as no value', () => {
		expect(brnDraftSetValue({ operator: 'contains', value: undefined }, 'ada')).toEqual({
			operator: 'contains',
			value: 'ada',
		});
		expect(brnDraftSetValue({ operator: 'contains', value: 'ada' }, '').value).toBeUndefined();
		expect(brnDraftSetValue({ operator: 'equals', value: 1 }, 0).value).toBe(0);
	});

	it('sets a range and treats blank bounds as open', () => {
		const draft = { operator: 'between' as const, value: undefined };
		expect(brnDraftSetRange(draft, '2024-01-01', '').value).toEqual(['2024-01-01', undefined]);
		expect(brnDraftSetRange(draft, '', '2024-02-01').value).toEqual([undefined, '2024-02-01']);
		expect(brnDraftSetRange(draft, '', '').value).toBeUndefined();
	});

	it('toggles options of a set on and off', () => {
		let draft = brnDraftSetOperator({ operator: 'equals', value: undefined }, 'in');
		draft = brnDraftToggleOption(draft, 'admin', true);
		draft = brnDraftToggleOption(draft, 'user', true);
		expect(draft).toEqual({ operator: 'in', value: ['admin', 'user'] });
		expect(brnDraftHasOption(draft, 'admin')).toBe(true);

		draft = brnDraftToggleOption(draft, 'admin', false);
		expect(draft.value).toEqual(['user']);
		expect(brnDraftHasOption(draft, 'admin')).toBe(false);

		draft = brnDraftToggleOption(draft, 'user', false);
		expect(draft.value).toBeUndefined();
	});

	it('does not add an option twice', () => {
		let draft = brnDraftToggleOption({ operator: 'in', value: undefined }, 'a', true);
		draft = brnDraftToggleOption(draft, 'a', true);
		expect(draft.value).toEqual(['a']);
	});

	it('compares options by key, so a Date matches its ISO string', () => {
		const when = new Date('2024-05-01T00:00:00.000Z');
		expect(brnOptionKey(when)).toBe('2024-05-01T00:00:00.000Z');
		expect(brnDraftHasOption({ operator: 'in', value: [when] }, '2024-05-01T00:00:00.000Z')).toBe(true);
		expect(brnOptionKey(undefined)).toBe('');
	});
});

describe('brnDraftToSpec', () => {
	it('returns the operator and value when there is something to send', () => {
		expect(brnDraftToSpec({ operator: 'contains', value: 'ada' }, 'string')).toEqual({
			operator: 'contains',
			value: 'ada',
		});
		expect(brnDraftToSpec({ operator: 'between', value: [1, undefined] }, 'number')).toEqual({
			operator: 'between',
			value: [1, undefined],
		});
	});

	it('returns nothing for a blank draft', () => {
		expect(brnDraftToSpec({ operator: 'contains', value: undefined }, 'string')).toBeUndefined();
		expect(brnDraftToSpec({ operator: 'between', value: undefined }, 'number')).toBeUndefined();
		expect(brnDraftToSpec({ operator: 'in', value: undefined }, 'select')).toBeUndefined();
	});

	it('returns an emptiness check without a value', () => {
		expect(brnDraftToSpec({ operator: 'isEmpty', value: undefined }, 'string')).toEqual({
			operator: 'isEmpty',
			value: undefined,
		});
	});

	it('returns nothing for a value the declared type cannot read', () => {
		expect(brnDraftToSpec({ operator: 'equals', value: 'abc' }, 'number')).toBeUndefined();
		expect(brnDraftToSpec({ operator: 'equals', value: '30' }, 'number')).toEqual({
			operator: 'equals',
			value: '30',
		});
	});

	it('keeps date values readable as dates', () => {
		expect(brnDraftToSpec({ operator: 'gte', value: '2024-01-31' }, 'date')).toBeDefined();
		expect(brnDraftToSpec({ operator: 'between', value: [undefined, undefined] }, 'date')).toBeUndefined();
	});
});

describe('brnCompositeToGroup', () => {
	it('drops an empty second condition to single', () => {
		const group = brnCompositeToGroup(
			{
				logic: 'or',
				first: { operator: 'contains', value: 'a' },
				second: { operator: 'contains', value: '' },
				caseSensitive: false,
			},
			'string',
		);
		expect(group).toMatchObject({ operator: 'contains', value: 'a' });
	});
});
