import {
	BRN_FILTER_OPERATORS,
	brnDefaultFilterOperator,
	brnDefaultOperatorForType,
	isBrnFilterSpec,
	toBrnFilter,
	toBrnFilterGroup,
	type BrnColumnFilterMeta,
	type BrnFilter,
	type BrnFilterGroup,
	type BrnFilterOperator,
	type BrnFilterSpec,
	type BrnFilterType,
} from './brn-data-source';

/**
 * What a column filter control edits before the user applies it: one operator and its value. The
 * value shape follows the operator: a scalar for most, `[from, to]` for `between`, a list for `in`,
 * and nothing for the emptiness checks.
 */
export type BrnFilterDraft = {
	operator: BrnFilterOperator;
	value: unknown;
};

const isBlank = (value: unknown): boolean => value === undefined || value === null || value === '';

const isEmptiness = (operator: BrnFilterOperator): boolean => operator === 'isEmpty' || operator === 'notEmpty';

/** The operators a column offers: its own override, else the defaults of its declared type. */
export function brnFilterOperators(meta: BrnColumnFilterMeta): readonly BrnFilterOperator[] {
	return meta.operators ?? BRN_FILTER_OPERATORS[meta.type];
}

/** The operator a column starts on: the type default when offered, else the first offered one. */
export function brnInitialOperator(meta: BrnColumnFilterMeta): BrnFilterOperator {
	const operators = brnFilterOperators(meta);
	const preferred = brnDefaultOperatorForType(meta.type);
	return operators.includes(preferred) ? preferred : (operators[0] ?? preferred);
}

/**
 * A stable string for an option value, so a `Date`, a number and the string a form control hands
 * back all compare equal.
 */
export function brnOptionKey(value: unknown): string {
	return value instanceof Date ? value.toISOString() : String(value ?? '');
}

/** The draft a control starts from: the column's current filter value, or an empty draft. */
export function brnDraftFromRaw(raw: unknown, meta: BrnColumnFilterMeta): BrnFilterDraft {
	const fallback = brnInitialOperator(meta);
	if (isBrnFilterSpec(raw)) return { operator: raw.operator ?? fallback, value: raw.value };
	if (isBlank(raw)) return { operator: fallback, value: undefined };
	return { operator: brnDefaultFilterOperator(raw, meta.type), value: raw };
}

/** The draft's value as a list, whatever shape it holds. A blank value is an empty list. */
function toList(value: unknown): unknown[] {
	if (isBlank(value)) return [];
	return Array.isArray(value) ? value : [value];
}

/**
 * Switches the operator and carries the value over to the new operator's shape: a range keeps both
 * bounds, a set keeps what was chosen, a single value keeps the first entry, and an emptiness check
 * drops the value.
 */
export function brnDraftSetOperator(draft: BrnFilterDraft, operator: BrnFilterOperator): BrnFilterDraft {
	if (isEmptiness(operator)) return { operator, value: undefined };

	if (operator === 'between') {
		const [from, to] = Array.isArray(draft.value) ? draft.value : [draft.value, undefined];
		const bounds = [from, to].map((bound) => (isBlank(bound) ? undefined : bound));
		return { operator, value: bounds[0] === undefined && bounds[1] === undefined ? undefined : bounds };
	}

	const chosen = toList(draft.value).filter((entry) => !isBlank(entry));
	if (operator === 'in') return { operator, value: chosen.length ? chosen : undefined };
	return { operator, value: chosen[0] };
}

/** Replaces the single value. A blank value clears it. */
export function brnDraftSetValue(draft: BrnFilterDraft, value: unknown): BrnFilterDraft {
	return { operator: draft.operator, value: isBlank(value) ? undefined : value };
}

/** Sets both bounds of a range. When both are blank the draft carries no value. */
export function brnDraftSetRange(draft: BrnFilterDraft, from: unknown, to: unknown): BrnFilterDraft {
	const bounds = [from, to].map((bound) => (isBlank(bound) ? undefined : bound));
	return {
		operator: 'between',
		value: bounds[0] === undefined && bounds[1] === undefined ? undefined : bounds,
	};
}

/** Adds or removes one option of a set (`in`). The result keeps the order the options were chosen in. */
export function brnDraftToggleOption(draft: BrnFilterDraft, option: unknown, checked: boolean): BrnFilterDraft {
	const key = brnOptionKey(option);
	const rest = toList(draft.value).filter((entry) => brnOptionKey(entry) !== key);
	const next = checked ? [...rest, option] : rest;
	return { operator: 'in', value: next.length ? next : undefined };
}

/** Whether an option of a set (`in`) or a single choice is currently selected in the draft. */
export function brnDraftHasOption(draft: BrnFilterDraft, option: unknown): boolean {
	const key = brnOptionKey(option);
	return toList(draft.value).some((entry) => brnOptionKey(entry) === key);
}

/**
 * What the draft writes into TanStack's `columnFilters` state, or `undefined` when it carries
 * nothing to send. The rule is `toBrnFilter`'s, so a draft is only applicable when the grid itself
 * would send it: a blank input, a non-numeric value in a number column or an empty range is not.
 */
export function brnDraftToSpec(draft: BrnFilterDraft, type?: BrnFilterType): BrnFilterSpec | undefined {
	const spec: BrnFilterSpec = { operator: draft.operator, value: draft.value };
	return toBrnFilter('draft', spec, type) === undefined ? undefined : spec;
}

export type BrnCompositeDraft = {
	logic: 'and' | 'or';
	first: BrnFilterDraft;
	second?: BrnFilterDraft;
	caseSensitive: boolean;
};

export function brnCompositeFromRaw(raw: unknown, meta: BrnColumnFilterMeta): BrnCompositeDraft {
	if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && 'conditions' in raw) {
		const spec = raw as { logic?: 'and' | 'or'; conditions: [unknown, unknown?]; caseSensitive?: boolean };
		return {
			logic: spec.logic ?? 'and',
			first: brnDraftFromRaw(spec.conditions[0], meta),
			second: spec.conditions[1] ? brnDraftFromRaw(spec.conditions[1], meta) : undefined,
			caseSensitive: spec.caseSensitive ?? false,
		};
	}
	return { logic: 'and', first: brnDraftFromRaw(raw, meta), second: undefined, caseSensitive: false };
}

export function brnCompositeSetLogic(draft: BrnCompositeDraft, logic: 'and' | 'or'): BrnCompositeDraft {
	return { ...draft, logic };
}

export function brnCompositeSetCondition(
	draft: BrnCompositeDraft,
	index: 0 | 1,
	next: BrnFilterDraft,
): BrnCompositeDraft {
	return index === 0 ? { ...draft, first: next } : { ...draft, second: next };
}

export function brnCompositeToGroup(
	draft: BrnCompositeDraft,
	type?: BrnFilterType,
): BrnFilter | BrnFilterGroup | undefined {
	const second = draft.second && brnDraftToSpec(draft.second, type) ? draft.second : undefined;
	if (!second) {
		const single = brnDraftToSpec(draft.first, type);
		if (!single) return undefined;
		return draft.caseSensitive
			? ({ id: 'draft', operator: single.operator, value: single.value, type, caseSensitive: true } as BrnFilter)
			: ({ id: 'draft', ...single, type } as BrnFilter);
	}
	return toBrnFilterGroup(
		'draft',
		{
			logic: draft.logic,
			conditions: [
				{ operator: draft.first.operator, value: draft.first.value },
				{ operator: second.operator, value: second.value },
			],
			caseSensitive: draft.caseSensitive || undefined,
		},
		type,
	) as BrnFilter | BrnFilterGroup | undefined;
}
