import type { BrnFilterOperator } from '@spartan-ng/brain/data-grid';

/**
 * Text overrides of the `HlmDataGridColumnFilter` popover. Every key falls back to English, so a
 * partial map localizes one string without repeating the rest.
 */
export type HlmDataGridFilterLabels = {
	filter?: string;
	operator?: string;
	value?: string;
	from?: string;
	to?: string;
	clear?: string;
	apply?: string;
	simple?: string;
	advanced?: string;
	and?: string;
	or?: string;
	caseSensitive?: string;
	mode?: string;
	logic?: string;
	all?: string;
	true?: string;
	false?: string;
	/**
	 * Display names of the filter operators, merged over `HLM_DATA_GRID_OPERATOR_LABELS`. The grid
	 * passes its `operatorLabels` input through here; a standalone popover can also set the
	 * component's own `operatorLabels` input.
	 */
	operatorLabels?: Partial<Record<BrnFilterOperator, string>>;
};

/** English display names of the filter operators; override per grid with `operatorLabels`. */
export const HLM_DATA_GRID_OPERATOR_LABELS: Record<BrnFilterOperator, string> = {
	contains: 'contains',
	equals: 'is',
	startsWith: 'starts with',
	endsWith: 'ends with',
	gt: '>',
	gte: '≥',
	lt: '<',
	lte: '≤',
	between: 'between',
	in: 'is any of',
	isEmpty: 'is empty',
	notEmpty: 'is not empty',
	notContains: 'does not contain',
	notEquals: 'is not',
	isNull: 'is null',
	notNull: 'is not null',
};
