import { Directive, computed, inject, input, signal } from '@angular/core';
import type { RowData } from '@tanstack/angular-table';
import {
	brnCompositeFromRaw,
	brnCompositeSetCondition,
	brnCompositeSetLogic,
	brnCompositeToGroup,
	brnDraftHasOption,
	brnDraftSetOperator,
	brnDraftSetRange,
	brnDraftSetValue,
	brnDraftToggleOption,
	brnFilterOperators,
	type BrnCompositeDraft,
	type BrnFilterDraft,
} from './brn-column-filter-draft';
import { BrnDataGrid } from './brn-data-grid';
import { isFilterGroup, type BrnDataGridColumnMeta, type BrnFilter, type BrnFilterOperator } from './brn-data-source';

/**
 * The part of a TanStack column the filter control needs. Declared structurally so the directive
 * does not depend on TanStack's feature-mapped column types: pass `header.column` straight in.
 */
export interface BrnFilterableColumn {
	readonly id: string;
	readonly columnDef: { readonly meta?: BrnDataGridColumnMeta };
	getFilterValue(): unknown;
	setFilterValue(value: unknown): void;
}

/**
 * Headless state of one column's filter control. It edits a local composite draft (up to two
 * conditions joined by `and`/`or`) and only touches the grid when `apply()` or `clear()` runs, so
 * typing never refetches and the grid sees one atomic write per Apply.
 *
 * Use it inside a `brnDataGrid` (the styled `hlm-data-grid` provides one) on a column that declares
 * `meta.filter`, and bind your own controls to the draft:
 *
 * ```html
 * <div [brnColumnFilter]="header.column" #filter="brnColumnFilter">
 * 	<select (change)="filter.setOperator($any($event.target).value)">...</select>
 * 	<input [value]="filter.draft().first.value ?? ''" (input)="filter.setValue($any($event.target).value)" />
 * 	<button (click)="filter.apply()" [disabled]="!filter.canApply()">Apply</button>
 * </div>
 * ```
 *
 * Call `open()` when your control becomes visible so the draft starts from the column's current
 * filter, and `reset()` when it closes without applying. The `index` parameter of the setters
 * (default `0`) edits the second condition for two-condition groups.
 */
@Directive({
	selector: '[brnColumnFilter]',
	exportAs: 'brnColumnFilter',
})
export class BrnColumnFilter {
	private readonly _grid = inject<BrnDataGrid<RowData>>(BrnDataGrid, { optional: true });

	/**
	 * The TanStack column to filter, e.g. `header.column`.
	 */
	public readonly column = input.required<BrnFilterableColumn>({ alias: 'brnColumnFilter' });

	/**
	 * The column's declared filter metadata (`meta.filter`), or `undefined` when it has none.
	 */
	public readonly meta = computed(() => this.column().columnDef.meta?.filter);

	/**
	 * The operators this column offers.
	 */
	public readonly operators = computed<readonly BrnFilterOperator[]>(() => {
		const meta = this.meta();
		return meta ? brnFilterOperators(meta) : [];
	});

	private readonly _draft = signal<BrnCompositeDraft | undefined>(undefined);

	/**
	 * The conditions being edited: `first` always, `second` once set, joined by `logic`.
	 * Starts from the column's current filter after `open()`.
	 */
	public readonly draft = computed<BrnCompositeDraft>(() => this._draft() ?? this._current());

	/**
	 * Whether the grid currently applies a filter to this column. Reads the grid's applied state, so
	 * it only flips once the (debounced) filter has reached the query. Groups carry the same `id`,
	 * so a two-condition group counts as active too.
	 */
	public readonly isActive = computed(() => {
		const id = this.column().id;
		return this._grid?.state().filters.some((filter) => filter.id === id) ?? false;
	});

	/**
	 * Whether the draft carries something the grid would send. A blank input, a non-numeric value
	 * in a number column or an empty range does not.
	 */
	public readonly canApply = computed(() => brnCompositeToGroup(this.draft(), this.meta()?.type) !== undefined);

	/**
	 * Starts a fresh draft from the column's current filter. Call it when the control opens.
	 */
	public open(): void {
		this._draft.set(this._current());
	}

	/**
	 * Discards the draft and goes back to the column's current filter. Call it when the control
	 * closes without applying.
	 */
	public reset(): void {
		this._draft.set(this._current());
	}

	/**
	 * Switches the operator of one condition, carrying the value over to the new operator's shape.
	 */
	public setOperator(operator: BrnFilterOperator, index: 0 | 1 = 0): void {
		this._update((draft) =>
			brnCompositeSetCondition(draft, index, brnDraftSetOperator(this._condition(draft, index, operator), operator)),
		);
	}

	/**
	 * Sets the single value of one condition. A blank value clears it. A fresh second condition
	 * starts on the first condition's operator, so it stays valid for the column type.
	 */
	public setValue(value: unknown, index: 0 | 1 = 0): void {
		this._update((draft) =>
			brnCompositeSetCondition(
				draft,
				index,
				brnDraftSetValue(this._condition(draft, index, draft.first.operator), value),
			),
		);
	}

	/**
	 * Sets both bounds of a `between` filter on one condition.
	 */
	public setRange(from: unknown, to: unknown, index: 0 | 1 = 0): void {
		this._update((draft) =>
			brnCompositeSetCondition(draft, index, brnDraftSetRange(this._condition(draft, index, 'between'), from, to)),
		);
	}

	/**
	 * Adds or removes one option of an `in` filter on one condition.
	 */
	public toggleOption(option: unknown, checked: boolean, index: 0 | 1 = 0): void {
		this._update((draft) =>
			brnCompositeSetCondition(
				draft,
				index,
				brnDraftToggleOption(this._condition(draft, index, 'in'), option, checked),
			),
		);
	}

	/**
	 * Whether an option is selected in one condition of the draft.
	 */
	public hasOption(option: unknown, index: 0 | 1 = 0): boolean {
		const draft = this.draft();
		const condition = index === 0 ? draft.first : draft.second;
		return condition ? brnDraftHasOption(condition, option) : false;
	}

	/**
	 * Joins the two conditions with `and`/`or`. A single condition ignores it until a second one
	 * is set.
	 */
	public setLogic(logic: 'and' | 'or'): void {
		this._update((draft) => brnCompositeSetLogic(draft, logic));
	}

	/**
	 * Opts the draft into (or out of) case-sensitive matching. Only the case-sensitive side is
	 * written through: text matching stays insensitive unless asked otherwise.
	 *
	 * NOTE: a single-condition apply drops the flag — `BrnFilterSpec` has no `caseSensitive` slot,
	 * so only the group path writes it. TODO(data-grid): give single-condition filters a spec
	 * slot in a future task instead of dropping the flag silently.
	 */
	public setCaseSensitive(sensitive: boolean): void {
		this._update((draft) => ({ ...draft, caseSensitive: sensitive }));
	}

	/**
	 * Writes the draft to the grid as one filter (or one group) and fetches immediately. A draft
	 * with nothing to send removes the column's filter instead, so applying an empty control
	 * clears it.
	 */
	public apply(): void {
		const group = brnCompositeToGroup(this.draft(), this.meta()?.type);
		if (group === undefined) {
			this.column().setFilterValue(undefined);
		} else if (isFilterGroup(group)) {
			this.column().setFilterValue({
				logic: group.logic,
				conditions: group.filters
					.filter((entry): entry is BrnFilter => !!entry)
					.map((entry) => ({ operator: entry.operator, value: entry.value })),
				...(group.caseSensitive ? { caseSensitive: true as const } : {}),
			});
		} else {
			// NOTE: singles have no `caseSensitive` slot, so the flag is dropped here (see
			// `setCaseSensitive`). TODO(data-grid): write it through once a single-spec slot exists.
			this.column().setFilterValue({ operator: group.operator, value: group.value });
		}
		this._grid?.flushFilters();
	}

	/**
	 * Removes the column's filter, resets the draft and fetches immediately.
	 */
	public clear(): void {
		this.column().setFilterValue(undefined);
		this._grid?.flushFilters();
		// The table snapshot only refreshes on change detection, so the empty draft is built here
		// instead of being read back from the column.
		this._draft.set(this._fromRaw(undefined));
	}

	/** One condition of the composite draft, or a fresh one when the second is not set yet. */
	private _condition(draft: BrnCompositeDraft, index: 0 | 1, operator: BrnFilterOperator): BrnFilterDraft {
		if (index === 0) return draft.first;
		return draft.second ?? { operator, value: undefined };
	}

	/** The draft the column's current filter value describes. */
	private _current(): BrnCompositeDraft {
		return this._fromRaw(this.column().getFilterValue());
	}

	private _fromRaw(raw: unknown): BrnCompositeDraft {
		const meta = this.meta();
		return meta
			? brnCompositeFromRaw(raw, meta)
			: { logic: 'and' as const, first: { operator: 'contains' as const, value: undefined }, caseSensitive: false };
	}

	private _update(change: (draft: BrnCompositeDraft) => BrnCompositeDraft): void {
		this._draft.set(change(this.draft()));
	}
}
