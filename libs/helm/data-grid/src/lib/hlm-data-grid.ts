import { ChangeDetectionStrategy, Component, computed, input, output, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowDown, lucideArrowUp, lucideChevronsUpDown, lucideX } from '@ng-icons/lucide';
import {
	BRN_FILTER_OPERATORS,
	BrnDataGrid,
	brnColumnDefId,
	brnDefaultFilterOperator,
	brnDefaultOperatorForType,
	brnFlattenColumnDefs,
	isBrnFilterSpec,
	type BrnColumnFilterMeta,
	type BrnDataAdapter,
	type BrnFilter,
	type BrnFilterGroup,
	type BrnFilterOperator,
	type BrnFilterSpec,
	type BrnGridState,
} from '@spartan-ng/brain/data-grid';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { hlm } from '@spartan-ng/helm/utils';
import { FlexRender, type ColumnDef, type RowData, type TableFeatures } from '@tanstack/angular-table';
import { HlmDataGridPagination } from './hlm-data-grid-pagination';

let hlmDataGridNextId = 0;

/**
 * Styled, server-driven data grid. It composes the headless `BrnDataGrid` (state, fetching, sorting,
 * filtering) and renders the toolbar, sortable headers, per-column filters, table, loading, empty
 * and error states for you: pass an adapter plus column definitions and the grid does the rest.
 *
 * Sorting and filtering are driven through the composed TanStack table (`column.toggleSorting`,
 * `column.setFilterValue`, `table.setGlobalFilter`); the operator mapping back to a backend query
 * stays in the brain adapters. Column filter UI comes from the column definition's `meta.filter`
 * (`BrnDataGridColumnMeta`); columns without it render no filter control.
 *
 * Cell and header renderers may return HTML - Angular's default `[innerHTML]` sanitization applies.
 *
 * Required features: `columnVisibilityFeature` (rows render through `row.getVisibleCells()`) and
 * `rowPaginationFeature` (the pager). Sorting needs `rowSortingFeature`, column filters need
 * `columnFilteringFeature`, and the toolbar search needs `globalFilteringFeature`.
 * `rowSelectionFeature` is optional: with it, the pager reports the selected-row count.
 *
 * Filter controls follow the column's `meta.filter.type`: text inputs for `string`, a single value or a
 * `from`/`to` pair (with `between`) for `number`/`date`, a choice for `boolean`, and a single choice or
 * a checkbox list (with `in`) for `select`. Values are coerced to the declared type before they reach
 * the adapter.
 */
@Component({
	selector: 'hlm-data-grid',
	imports: [
		BrnDataGrid,
		HlmDataGridPagination,
		FlexRender,
		NgIcon,
		...HlmTableImports,
		...HlmButtonImports,
		...HlmCheckboxImports,
		...HlmAlertImports,
		...HlmSkeletonImports,
		...HlmInputImports,
		...HlmBadgeImports,
		...HlmFieldImports,
		...HlmNativeSelectImports,
	],
	providers: [provideIcons({ lucideArrowUp, lucideArrowDown, lucideChevronsUpDown, lucideX })],
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { '[class]': '_cls()' },
	template: `
		@if (showToolbar()) {
			<div data-slot="data-grid-toolbar" class="flex flex-col gap-2 py-4">
				@if (_canSearch(grid.table)) {
					<div hlmField class="w-full md:max-w-sm">
						<label hlmFieldLabel [for]="_searchId" class="sr-only">{{ searchLabel() }}</label>
						<div data-slot="data-grid-search">
							<input
								hlmInput
								[id]="_searchId"
								type="search"
								[placeholder]="searchPlaceholder()"
								[attr.aria-label]="searchLabel()"
								[value]="grid.state().globalFilter ?? ''"
								(input)="_onGlobal(grid.table, $event)"
							/>
						</div>
					</div>
				}
				@if (_hasActiveFilters(grid)) {
					<div class="flex flex-wrap items-center gap-2">
						@for (chip of grid.state().filters; track chip.id) {
							<span hlmBadge variant="secondary" data-slot="data-grid-chip">
								<span class="truncate">{{ _chipLabel(chip) }}: {{ _chipValue(chip) }}</span>
								<button
									hlmBtn
									variant="ghost"
									size="icon-xs"
									[attr.aria-label]="_removeLabel(chip)"
									(click)="_removeFilter(grid.table, chip.id)"
								>
									<ng-icon name="lucideX" />
								</button>
							</span>
						}
						@if (grid.state().globalFilter; as global) {
							<span hlmBadge variant="secondary" data-slot="data-grid-chip" data-global="true">
								<span class="truncate">{{ searchLabel() }}: {{ global }}</span>
								<button
									hlmBtn
									variant="ghost"
									size="icon-xs"
									[attr.aria-label]="searchLabel() + ': clear'"
									(click)="_clearGlobal(grid.table)"
								>
									<ng-icon name="lucideX" />
								</button>
							</span>
						}
						<button hlmBtn variant="outline" size="sm" data-slot="data-grid-clear" (click)="_clearAll(grid.table)">
							{{ clearAllText() }}
						</button>
					</div>
				}
			</div>
		}
		<div hlmTableContainer>
			<table
				hlmTable
				brnDataGrid
				#grid="brnDataGrid"
				[adapter]="adapter()"
				[features]="features()"
				[columns]="columns()"
				[initial]="initial()"
				[debounceMs]="debounceMs()"
			>
				<thead>
					@for (headerGroup of grid.table.getHeaderGroups(); track headerGroup.id) {
						<tr hlmTr>
							@for (header of headerGroup.headers; track header.id) {
								<th hlmTh [attr.colSpan]="header.colSpan" [attr.aria-sort]="_ariaSort(header)">
									@if (!header.isPlaceholder) {
										@if (_canSort(header)) {
											<button
												hlmBtn
												variant="ghost"
												size="sm"
												data-slot="data-grid-sort"
												class="gap-1"
												[attr.aria-label]="_sortLabel(header)"
												(click)="_toggleSort(header, $event)"
											>
												<ng-container *flexRenderHeader="header; let headerText">
													<span class="truncate" [innerHTML]="headerText"></span>
												</ng-container>
												@if (_sorted(header) === 'asc') {
													<ng-icon name="lucideArrowUp" aria-hidden="true" />
												} @else if (_sorted(header) === 'desc') {
													<ng-icon name="lucideArrowDown" aria-hidden="true" />
												} @else {
													<ng-icon name="lucideChevronsUpDown" aria-hidden="true" />
												}
												@if (_sortIndex(header) >= 0) {
													<span hlmBadge variant="secondary" data-slot="data-grid-sort-index">
														{{ _sortIndex(header) + 1 }}
													</span>
												}
											</button>
										} @else {
											<ng-container *flexRenderHeader="header; let headerText">
												<div [innerHTML]="headerText"></div>
											</ng-container>
										}
										@if (showColumnFilters() && _filterMeta(header); as meta) {
											<div
												data-slot="data-grid-filter"
												[attr.data-column]="header.column.id"
												class="flex flex-col gap-1 pt-1"
												(click)="$event.stopPropagation()"
											>
												<label class="sr-only" [for]="_operatorId(header)">
													{{ _metaLabel(header, meta) }} {{ operatorText() }}
												</label>
												<hlm-native-select
													data-slot="data-grid-operator"
													[selectId]="_operatorId(header)"
													size="sm"
													[value]="_spec(header).operator ?? ''"
													(change)="_onOperator(header, meta, $event)"
												>
													@for (op of _operators(meta); track op) {
														<option hlmNativeSelectOption [value]="op">{{ _operatorLabel(op) }}</option>
													}
												</hlm-native-select>
												@if (_isEmptiness(_spec(header).operator)) {
													<!-- Emptiness checks carry no value. -->
												} @else if (meta.type === 'number' || meta.type === 'date') {
													@if (_spec(header).operator === 'between') {
														<div class="flex items-center gap-1">
															<label class="sr-only" [for]="_valueId(header, 'from')">
																{{ _metaLabel(header, meta) }} {{ fromText() }}
															</label>
															<input
																hlmInput
																data-slot="data-grid-value-from"
																[id]="_valueId(header, 'from')"
																[type]="meta.type"
																class="w-full"
																[value]="_range(header)[0]"
																[placeholder]="fromText()"
																(input)="_onRange(header, meta, $event)"
															/>
															<label class="sr-only" [for]="_valueId(header, 'to')">
																{{ _metaLabel(header, meta) }} {{ toText() }}
															</label>
															<input
																hlmInput
																data-slot="data-grid-value-to"
																[id]="_valueId(header, 'to')"
																[type]="meta.type"
																class="w-full"
																[value]="_range(header)[1]"
																[placeholder]="toText()"
																(input)="_onRange(header, meta, $event)"
															/>
														</div>
													} @else {
														<label class="sr-only" [for]="_valueId(header)">
															{{ _metaLabel(header, meta) }} {{ valueText() }}
														</label>
														<input
															hlmInput
															data-slot="data-grid-value"
															[id]="_valueId(header)"
															[type]="meta.type"
															class="w-full"
															[value]="_textValue(header)"
															(input)="_onText(header, meta, $event)"
														/>
													}
												} @else if (meta.type === 'boolean') {
													<label class="sr-only" [for]="_valueId(header)">
														{{ _metaLabel(header, meta) }} {{ valueText() }}
													</label>
													<hlm-native-select
														data-slot="data-grid-value"
														[selectId]="_valueId(header)"
														size="sm"
														[value]="_booleanValue(header)"
														(change)="_onChoice(header, meta, $event)"
													>
														<option hlmNativeSelectOption value="">{{ allText() }}</option>
														<option hlmNativeSelectOption value="true">{{ trueText() }}</option>
														<option hlmNativeSelectOption value="false">{{ falseText() }}</option>
													</hlm-native-select>
												} @else if (meta.type === 'select' && _spec(header).operator === 'in') {
													<div
														data-slot="data-grid-value-set"
														role="group"
														class="flex flex-col gap-1"
														[attr.aria-label]="_metaLabel(header, meta)"
													>
														@for (option of meta.options ?? []; track $index) {
															<div class="flex items-center gap-2">
																<hlm-checkbox
																	[inputId]="_valueId(header, 'option-' + $index)"
																	[checked]="_isChosen(header, option.value)"
																	(checkedChange)="_onToggleOption(header, option.value, $event)"
																/>
																<label class="text-sm font-normal" [for]="_valueId(header, 'option-' + $index)">
																	{{ option.label }}
																</label>
															</div>
														}
													</div>
												} @else if (meta.type === 'select') {
													<label class="sr-only" [for]="_valueId(header)">
														{{ _metaLabel(header, meta) }} {{ valueText() }}
													</label>
													<hlm-native-select
														data-slot="data-grid-value"
														[selectId]="_valueId(header)"
														size="sm"
														[value]="_textValue(header)"
														(change)="_onChoice(header, meta, $event)"
													>
														<option hlmNativeSelectOption value="">{{ allText() }}</option>
														@for (option of meta.options ?? []; track $index) {
															<option hlmNativeSelectOption [value]="_optionValue(option.value)">
																{{ option.label }}
															</option>
														}
													</hlm-native-select>
												} @else {
													<label class="sr-only" [for]="_valueId(header)">
														{{ _metaLabel(header, meta) }} {{ valueText() }}
													</label>
													<input
														hlmInput
														data-slot="data-grid-value"
														[id]="_valueId(header)"
														type="text"
														class="w-full"
														[value]="_textValue(header)"
														(input)="_onText(header, meta, $event)"
													/>
												}
											</div>
										}
									}
								</th>
							}
						</tr>
					}
				</thead>
				<tbody hlmTBody>
					@if (grid.loading() && grid.rows().length === 0) {
						<tr hlmTr>
							<td hlmTd [attr.colSpan]="_colSpan(grid.table)">
								<hlm-skeleton class="h-8" />
							</td>
						</tr>
					} @else {
						@if (grid.error()) {
							<tr hlmTr>
								<td hlmTd [attr.colSpan]="_colSpan(grid.table)">
									<div hlmAlert role="alert">
										{{ errorText() }}
										<button hlmBtn size="sm" (click)="_retry(grid)">{{ retryText() }}</button>
									</div>
								</td>
							</tr>
						}
						@if (grid.rows().length === 0) {
							@if (!grid.error()) {
								<tr hlmTr>
									<td hlmTd class="h-24 text-center" [attr.colSpan]="_colSpan(grid.table)">{{ emptyText() }}</td>
								</tr>
							}
						} @else {
							@for (row of grid.table.getRowModel().rows; track row.id) {
								<tr hlmTr [attr.data-state]="_rowSelected(row) ? 'selected' : null">
									@for (cell of row.getVisibleCells(); track cell.id) {
										<td hlmTd>
											<ng-container *flexRenderCell="cell; let cellText">
												<div [innerHTML]="cellText"></div>
											</ng-container>
										</td>
									}
								</tr>
							}
						}
					}
				</tbody>
			</table>
		</div>
		<hlm-data-grid-pagination [table]="grid.table" [pageSizeOptions]="pageSizeOptions()" />
		<div class="text-muted-foreground text-sm" data-slot="data-grid-status" aria-live="polite">
			@if (grid.loading()) {
				{{ loadingText() }}
			} @else {
				{{ grid.total() }} row(s)
			}
		</div>
	`,
})
export class HlmDataGrid<TData extends RowData> {
	/**
	 * Maps the grid state to a backend query and fetches one page.
	 */
	public readonly adapter = input.required<BrnDataAdapter<TData, any>>();

	/**
	 * The TanStack features this grid runs with, built with `tableFeatures(...)`.
	 */
	public readonly features = input.required<TableFeatures>();

	/**
	 * Column definitions created with `createColumnHelper<typeof features, TData>()`.
	 */
	public readonly columns = input.required<ColumnDef<any, TData, any>[]>();

	/**
	 * Initial page, pageSize, sorting, filters and globalFilter. Read once when the grid starts.
	 */
	public readonly initial = input<Partial<BrnGridState>>({});

	/**
	 * Debounce window for filter-driven fetches (page and sort apply immediately). Read once when the
	 * grid starts.
	 */
	public readonly debounceMs = input(300);

	/**
	 * Page sizes offered by the pagination. An empty list hides the page-size picker.
	 */
	public readonly pageSizeOptions = input<readonly number[]>([10, 20, 50, 100]);

	/**
	 * Whether the toolbar (global search, active-filter chips, clear-all) renders.
	 */
	public readonly showToolbar = input(true);

	/**
	 * Whether per-column filter controls render under sortable headers.
	 */
	public readonly showColumnFilters = input(true);

	/**
	 * Accessible label of the toolbar search input.
	 */
	public readonly searchLabel = input('Search');

	/**
	 * Placeholder of the toolbar search input.
	 */
	public readonly searchPlaceholder = input('Search…');

	/**
	 * Label of the clear-all-filters button.
	 */
	public readonly clearAllText = input('Clear all');

	/**
	 * Announced while a fetch is in flight.
	 */
	public readonly loadingText = input('Loading…');

	/**
	 * Shown when the backend returns no rows.
	 */
	public readonly emptyText = input('No results.');

	/**
	 * Shown when the fetch fails.
	 */
	public readonly errorText = input('Failed to load.');

	/**
	 * Label of the retry button shown in the error state.
	 */
	public readonly retryText = input('Retry');

	/**
	 * Display names of the filter operators. Merged over the English defaults, so a partial map works.
	 */
	public readonly operatorLabels = input<Partial<Record<BrnFilterOperator, string>>>({});

	/**
	 * Screen-reader suffix of a column's operator picker (`Age operator`).
	 */
	public readonly operatorText = input('operator');

	/**
	 * Screen-reader suffix of a column's value control (`Age value`).
	 */
	public readonly valueText = input('value');

	/**
	 * Label of the lower bound of a range filter.
	 */
	public readonly fromText = input('From');

	/**
	 * Label of the upper bound of a range filter.
	 */
	public readonly toText = input('To');

	/**
	 * The "no filter" choice of boolean and select filters.
	 */
	public readonly allText = input('All');

	/**
	 * The `true` choice of a boolean filter.
	 */
	public readonly trueText = input('True');

	/**
	 * The `false` choice of a boolean filter.
	 */
	public readonly falseText = input('False');

	/**
	 * Extra classes applied to the host.
	 */
	public readonly class = input('');

	/**
	 * Emitted when the user retries, after the grid has been asked to refetch.
	 */
	public readonly retry = output<void>();

	protected readonly _cls = computed(() => hlm('w-full', this.class()));

	/** Per-instance id prefix: two grids on one page must not share control `id`s. */
	private readonly _idPrefix = `hlm-data-grid-${hlmDataGridNextId++}`;

	/** Per-instance search input id. */
	protected readonly _searchId = `${this._idPrefix}-search`;

	protected readonly _operatorLabels = computed(() => ({ ...HLM_DATA_GRID_OPERATOR_LABELS, ...this.operatorLabels() }));

	private readonly _grid = viewChild.required(BrnDataGrid);

	/**
	 * The TanStack table instance the composed grid runs on - use it to drive external controls
	 * (search inputs, column visibility, programmatic sorting).
	 */
	public get table() {
		return this._grid().table;
	}

	/**
	 * The current page, pageSize, sorting, filters and globalFilter.
	 */
	public get state() {
		return this._grid().state;
	}

	/**
	 * Refetches the current page.
	 */
	public reload(): void {
		this._grid().reload();
	}

	protected _colSpan(table: { getAllLeafColumns: () => readonly unknown[] }): number {
		return Math.max(table.getAllLeafColumns().length, 1);
	}

	protected _retry(grid: { reload: () => void }): void {
		grid.reload();
		this.retry.emit();
	}

	protected _rowSelected(row: any): boolean {
		return typeof row.getIsSelected === 'function' ? !!row.getIsSelected() : false;
	}

	protected _sorted(header: any): 'asc' | 'desc' | false {
		return header.column.getIsSorted?.() ?? false;
	}

	protected _ariaSort(header: any): 'none' | 'ascending' | 'descending' {
		const sorted = this._sorted(header);
		return sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none';
	}

	protected _sortIndex(header: any): number {
		try {
			return header.column.getSortIndex?.() ?? -1;
		} catch {
			return -1;
		}
	}

	protected _sortLabel(header: any): string {
		const sorted = this._sorted(header);
		const id = header.column.id ?? header.id;
		return sorted === 'asc' ? `Sort ${id} descending` : sorted === 'desc' ? `Clear ${id} sort` : `Sort ${id} ascending`;
	}

	protected _toggleSort(header: any, event: MouseEvent): void {
		header.column.toggleSorting(undefined, event.shiftKey);
	}

	/** Sorting is optional: without `rowSortingFeature` the column has no sorting API. */
	protected _canSort(header: any): boolean {
		return typeof header.column.getCanSort === 'function' && !!header.column.getCanSort();
	}

	/** Column filters are optional: without `columnFilteringFeature` no filter control renders. */
	protected _filterMeta(header: any): BrnColumnFilterMeta | undefined {
		if (typeof header.column.setFilterValue !== 'function') return undefined;
		return header.column.columnDef?.meta?.filter as BrnColumnFilterMeta | undefined;
	}

	protected _metaLabel(header: any, meta: BrnColumnFilterMeta): string {
		return meta.label ?? header.column.id;
	}

	protected _operators(meta: BrnColumnFilterMeta): readonly BrnFilterOperator[] {
		return meta.operators ?? BRN_FILTER_OPERATORS[meta.type];
	}

	protected _operatorLabel(operator: BrnFilterOperator): string {
		return this._operatorLabels()[operator] ?? operator;
	}

	/** The operator a column starts on: the type default when offered, else the first offered one. */
	protected _initialOperator(meta: BrnColumnFilterMeta): BrnFilterOperator {
		const operators = this._operators(meta);
		const preferred = brnDefaultOperatorForType(meta.type);
		return operators.includes(preferred) ? preferred : (operators[0] ?? preferred);
	}

	protected _spec(header: any): BrnFilterSpec {
		const raw = header.column.getFilterValue();
		const meta = this._filterMeta(header);
		const fallback = meta ? this._initialOperator(meta) : 'contains';
		if (isBrnFilterSpec(raw)) return { ...raw, operator: raw.operator ?? fallback };
		if (raw === undefined || raw === null || raw === '') return { operator: fallback, value: undefined };
		return { operator: brnDefaultFilterOperator(raw, meta?.type), value: raw };
	}

	protected _isEmptiness(operator: BrnFilterOperator | undefined): boolean {
		return operator === 'isEmpty' || operator === 'notEmpty';
	}

	protected _operatorId(header: any): string {
		return `${this._idPrefix}-filter-${header.column.id}-operator`;
	}

	protected _valueId(header: any, suffix?: string): string {
		const base = `${this._idPrefix}-filter-${header.column.id}`;
		return suffix ? `${base}-${suffix}` : base;
	}

	protected _textValue(header: any): string {
		const value = this._spec(header).value;
		const scalar = Array.isArray(value) ? value[0] : value;
		return scalar === undefined || scalar === null ? '' : this._optionValue(scalar);
	}

	protected _range(header: any): [string, string] {
		const value = this._spec(header).value;
		const text = (entry: unknown) => (entry === undefined || entry === null ? '' : String(entry));
		if (Array.isArray(value)) return [text(value[0]), text(value[1])];
		return [text(value), ''];
	}

	protected _booleanValue(header: any): string {
		const value = this._spec(header).value;
		return value === true || value === 'true' ? 'true' : value === false || value === 'false' ? 'false' : '';
	}

	protected _optionValue(value: unknown): string {
		return value instanceof Date ? value.toISOString() : String(value ?? '');
	}

	/** Maps a `<select>` string back to the option's own value, so `1` stays a number. */
	protected _optionFor(meta: BrnColumnFilterMeta, choice: string): unknown {
		const option = (meta.options ?? []).find((entry) => this._optionValue(entry.value) === choice);
		return option ? option.value : choice;
	}

	protected _chosen(header: any): unknown[] {
		const value = this._spec(header).value;
		if (value === undefined || value === null || value === '') return [];
		return Array.isArray(value) ? value : [value];
	}

	protected _isChosen(header: any, value: unknown): boolean {
		const key = this._optionValue(value);
		return this._chosen(header).some((entry) => this._optionValue(entry) === key);
	}

	/**
	 * The filter control root of the event target. Filter handlers read sibling control values from
	 * the DOM rather than from the TanStack table state: the table snapshot only refreshes on change
	 * detection, so two writes in the same tick (operator then value, range from then to) would merge
	 * the second write against the stale first one and drop data.
	 */
	protected _filterRoot(event: Event): HTMLElement | null {
		return (event.target as HTMLElement)?.closest?.('[data-slot="data-grid-filter"]');
	}

	protected _rootOperator(root: HTMLElement | null, meta: BrnColumnFilterMeta): BrnFilterOperator {
		const select = root?.querySelector('[data-slot="data-grid-operator"] select') as HTMLSelectElement | null;
		const operator = select?.value as BrnFilterOperator | '';
		return operator || this._initialOperator(meta);
	}

	/** The value(s) currently typed into a column's controls, whichever shape is on screen. */
	protected _rootValues(root: HTMLElement | null): [string | undefined, string | undefined] {
		const read = (slot: string) =>
			(root?.querySelector(`input[data-slot="${slot}"], [data-slot="${slot}"] select`) as HTMLInputElement | null)
				?.value || undefined;
		const single = read('data-grid-value');
		if (single !== undefined) return [single, undefined];
		return [read('data-grid-value-from'), read('data-grid-value-to')];
	}

	protected _onOperator(header: any, meta: BrnColumnFilterMeta, event: Event): void {
		const operator = (event.target as HTMLSelectElement).value as BrnFilterOperator;
		if (this._isEmptiness(operator)) {
			header.column.setFilterValue({ operator, value: undefined });
			return;
		}
		const [first, second] = this._rootValues(this._filterRoot(event));

		if (operator === 'between') {
			header.column.setFilterValue({ operator, value: (first ?? second) ? [first, second] : undefined });
			return;
		}
		if (operator === 'in') {
			// A set keeps whatever was chosen before; the checkbox list takes over from here.
			const chosen = this._chosen(header);
			header.column.setFilterValue({ operator, value: chosen.length ? chosen : undefined });
			return;
		}
		const single = first ?? second;
		if (meta.type === 'select' && this._spec(header).operator === 'in') {
			// Leaving a set for a single choice keeps its first entry.
			header.column.setFilterValue({ operator, value: this._chosen(header)[0] });
			return;
		}
		const value = single === undefined ? undefined : meta.type === 'select' ? this._optionFor(meta, single) : single;
		header.column.setFilterValue({ operator, value });
	}

	protected _onText(header: any, meta: BrnColumnFilterMeta, event: Event): void {
		const operator = this._rootOperator(this._filterRoot(event), meta);
		const value = (event.target as HTMLInputElement).value;
		header.column.setFilterValue(value === '' ? undefined : { operator, value });
	}

	protected _onRange(header: any, meta: BrnColumnFilterMeta, event: Event): void {
		const [from, to] = this._rootValues(this._filterRoot(event));
		header.column.setFilterValue(
			from === undefined && to === undefined ? undefined : { operator: 'between', value: [from, to] },
		);
	}

	protected _onChoice(header: any, meta: BrnColumnFilterMeta, event: Event): void {
		const operator = this._rootOperator(this._filterRoot(event), meta);
		const choice = (event.target as HTMLSelectElement).value;
		if (choice === '') {
			header.column.setFilterValue(undefined);
			return;
		}
		const value = meta.type === 'boolean' ? choice === 'true' : this._optionFor(meta, choice);
		header.column.setFilterValue({ operator, value });
	}

	protected _onToggleOption(header: any, value: unknown, checked: boolean): void {
		const key = this._optionValue(value);
		const rest = this._chosen(header).filter((entry) => this._optionValue(entry) !== key);
		const next = checked ? [...rest, value] : rest;
		header.column.setFilterValue({ operator: 'in', value: next.length ? next : undefined });
	}

	/** The search box needs `globalFilteringFeature`; without it the table has no global filter API. */
	protected _canSearch(table: any): boolean {
		return typeof table?.setGlobalFilter === 'function';
	}

	protected _onGlobal(table: any, event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		table?.setGlobalFilter(value === '' ? undefined : value);
	}

	protected _hasActiveFilters(grid: any): boolean {
		return grid.state().filters.length > 0 || (grid.state().globalFilter ?? '') !== '';
	}

	protected _columnLabel(id: string): string {
		for (const def of brnFlattenColumnDefs(this.columns())) {
			if (brnColumnDefId(def) === id) return def.meta?.filter?.label ?? id;
		}
		return id;
	}

	protected _chipLabel(chip: BrnFilter | BrnFilterGroup): string {
		return this._columnLabel(chip.id);
	}

	protected _chipValue(chip: BrnFilter | BrnFilterGroup): string {
		if ('logic' in chip && 'filters' in chip) {
			const members = chip.filters
				.filter((entry): entry is BrnFilter => !!entry)
				.map((entry) => this._singleChipValue(entry));
			return members.join(chip.logic === 'or' ? ' or ' : ' and ');
		}
		return this._singleChipValue(chip);
	}

	private _singleChipValue(chip: BrnFilter): string {
		const option = (value: unknown) => {
			const def = brnFlattenColumnDefs(this.columns()).find((entry) => brnColumnDefId(entry) === chip.id);
			const match = def?.meta?.filter?.options?.find(
				(entry) => this._optionValue(entry.value) === this._optionValue(value),
			);
			return match ? match.label : this._optionValue(value);
		};
		const operator = this._operatorLabel(chip.operator);
		if (chip.operator === 'isEmpty' || chip.operator === 'notEmpty') return operator;
		if (chip.operator === 'between' && Array.isArray(chip.value)) {
			const [from, to] = chip.value;
			return `${from ?? '…'} – ${to ?? '…'}`;
		}
		if (chip.operator === 'in' && Array.isArray(chip.value)) return chip.value.map(option).join(', ');
		if (chip.operator === 'contains' || chip.operator === 'equals') return option(chip.value);
		return `${operator} ${option(chip.value)}`;
	}

	protected _removeLabel(chip: BrnFilter | BrnFilterGroup): string {
		return `Remove ${this._chipLabel(chip)} filter`;
	}

	protected _removeFilter(table: any, id: string): void {
		table?.getColumn?.(id)?.setFilterValue(undefined);
	}

	protected _clearGlobal(table: any): void {
		table?.setGlobalFilter(undefined);
	}

	protected _clearAll(table: any): void {
		table?.resetColumnFilters?.(true);
		table?.setGlobalFilter?.(undefined);
	}
}

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
