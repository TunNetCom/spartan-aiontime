import { ChangeDetectionStrategy, Component, computed, input, output, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowDown, lucideArrowUp, lucideChevronsUpDown, lucideX } from '@ng-icons/lucide';
import {
	BRN_FILTER_OPERATORS,
	BrnDataGrid,
	isBrnFilterSpec,
	type BrnColumnFilterMeta,
	type BrnDataAdapter,
	type BrnDataGridColumnMeta,
	type BrnFilter,
	type BrnFilterOperator,
	type BrnFilterSpec,
	type BrnFilterType,
	type BrnGridState,
} from '@spartan-ng/brain/data-grid';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
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
 * Rows are rendered through `row.getVisibleCells()`, so the `features` you pass should include
 * `columnVisibilityFeature` (as the docs examples do). Sorting needs `rowSortingFeature`,
 * column filters need `columnFilteringFeature`, and the toolbar search needs `globalFilteringFeature`.
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
										@if (header.column.getCanSort()) {
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
													{{ meta.label ?? header.column.id }} operator
												</label>
												<hlm-native-select
													data-slot="data-grid-operator"
													[id]="_operatorId(header)"
													size="sm"
													[value]="_spec(header).operator ?? ''"
													(change)="_onOperator(header, meta, $event)"
													[attr.aria-label]="(meta.label ?? header.column.id) + ' operator'"
												>
													@for (op of _operators(meta); track op) {
														<option hlmNativeSelectOption [value]="op">{{ op }}</option>
													}
												</hlm-native-select>
												@switch (meta.type) {
													@case ('number') {
														<div class="flex items-center gap-1">
															<label class="sr-only" [for]="_valueId(header, 'from')">
																{{ meta.label ?? header.column.id }} from
															</label>
															<input
																hlmInput
																data-slot="data-grid-value-from"
																[id]="_valueId(header, 'from')"
																type="number"
																class="w-full"
																[value]="_range(header)[0]"
																[attr.aria-label]="(meta.label ?? header.column.id) + ' from'"
																(input)="_onRange(header, meta, 0, $event)"
															/>
															<label class="sr-only" [for]="_valueId(header, 'to')">
																{{ meta.label ?? header.column.id }} to
															</label>
															<input
																hlmInput
																data-slot="data-grid-value-to"
																[id]="_valueId(header, 'to')"
																type="number"
																class="w-full"
																[value]="_range(header)[1]"
																[attr.aria-label]="(meta.label ?? header.column.id) + ' to'"
																(input)="_onRange(header, meta, 1, $event)"
															/>
														</div>
													}
													@case ('date') {
														<div class="flex items-center gap-1">
															<label class="sr-only" [for]="_valueId(header, 'from')">
																{{ meta.label ?? header.column.id }} from
															</label>
															<input
																hlmInput
																data-slot="data-grid-value-from"
																[id]="_valueId(header, 'from')"
																type="date"
																class="w-full"
																[value]="_range(header)[0]"
																[attr.aria-label]="(meta.label ?? header.column.id) + ' from'"
																(input)="_onRange(header, meta, 0, $event)"
															/>
															<label class="sr-only" [for]="_valueId(header, 'to')">
																{{ meta.label ?? header.column.id }} to
															</label>
															<input
																hlmInput
																data-slot="data-grid-value-to"
																[id]="_valueId(header, 'to')"
																type="date"
																class="w-full"
																[value]="_range(header)[1]"
																[attr.aria-label]="(meta.label ?? header.column.id) + ' to'"
																(input)="_onRange(header, meta, 1, $event)"
															/>
														</div>
													}
													@case ('boolean') {
														<label class="sr-only" [for]="_valueId(header)">
															{{ meta.label ?? header.column.id }} value
														</label>
														<hlm-native-select
															data-slot="data-grid-value"
															[id]="_valueId(header)"
															size="sm"
															[value]="_booleanValue(header)"
															(change)="_onBoolean(header, meta, $event)"
															[attr.aria-label]="meta.label ?? header.column.id"
														>
															<option hlmNativeSelectOption value="">All</option>
															<option hlmNativeSelectOption value="true">True</option>
															<option hlmNativeSelectOption value="false">False</option>
														</hlm-native-select>
													}
													@case ('select') {
														<label class="sr-only" [for]="_valueId(header)">
															{{ meta.label ?? header.column.id }} value
														</label>
														<hlm-native-select
															data-slot="data-grid-value"
															[id]="_valueId(header)"
															size="sm"
															[value]="_textValue(header)"
															(change)="_onSelect(header, meta, $event)"
															[attr.aria-label]="meta.label ?? header.column.id"
														>
															<option hlmNativeSelectOption value="">All</option>
															@for (option of meta.options ?? []; track option.value) {
																<option hlmNativeSelectOption [value]="_optionValue(option.value)">
																	{{ option.label }}
																</option>
															}
														</hlm-native-select>
													}
													@default {
														<label class="sr-only" [for]="_valueId(header)">
															{{ meta.label ?? header.column.id }} value
														</label>
														<input
															hlmInput
															data-slot="data-grid-value"
															[id]="_valueId(header)"
															type="text"
															class="w-full"
															[value]="_textValue(header)"
															[attr.aria-label]="meta.label ?? header.column.id"
															[disabled]="_isEmptiness(_spec(header).operator)"
															(input)="_onText(header, meta, $event)"
														/>
													}
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
					@if (grid.loading() && grid.total() === 0) {
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
						@if (!grid.error() && grid.total() === 0) {
							<tr hlmTr>
								<td hlmTd class="h-24 text-center" [attr.colSpan]="_colSpan(grid.table)">{{ emptyText() }}</td>
							</tr>
						} @else if (!grid.error() || grid.total() > 0) {
							@for (row of grid.table.getRowModel().rows; track row.id) {
								<tr hlmTr>
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
		<hlm-data-grid-pagination [table]="grid.table" />
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
	 * Initial page, pageSize, sorting, filters and globalFilter.
	 */
	public readonly initial = input<Partial<BrnGridState>>({});

	/**
	 * Debounce window for filter-driven fetches (page and sort apply immediately).
	 */
	public readonly debounceMs = input(300);

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
	 * Extra classes applied to the host.
	 */
	public readonly class = input('');

	/**
	 * Emitted when the user retries, after the grid has been asked to refetch.
	 */
	public readonly retry = output<void>();

	protected readonly _cls = computed(() => hlm('w-full', this.class()));

	/** Per-instance search input id: two grids on one page must not share an `id`. */
	protected readonly _searchId = `data-grid-search-${hlmDataGridNextId++}`;

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

	protected _sorted(header: any): 'asc' | 'desc' | false {
		return header.column.getIsSorted() ?? false;
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

	protected _filterMeta(header: any): BrnColumnFilterMeta | undefined {
		return header.column.columnDef?.meta?.filter as BrnColumnFilterMeta | undefined;
	}

	protected _operators(meta: BrnColumnFilterMeta): readonly BrnFilterOperator[] {
		return meta.operators ?? BRN_FILTER_OPERATORS[meta.type];
	}

	protected _defaultOperator(type: BrnFilterType): BrnFilterOperator {
		return type === 'number' || type === 'date'
			? 'between'
			: type === 'boolean' || type === 'select'
				? 'equals'
				: 'contains';
	}

	protected _spec(header: any): BrnFilterSpec {
		const raw = header.column.getFilterValue();
		if (isBrnFilterSpec(raw)) return raw;
		const meta = this._filterMeta(header);
		if (raw === undefined || raw === null || raw === '') {
			return { operator: meta ? this._defaultOperator(meta.type) : 'contains', value: undefined };
		}
		return { operator: meta ? this._defaultOperator(meta.type) : 'contains', value: raw };
	}

	protected _isEmptiness(operator: BrnFilterOperator | undefined): boolean {
		return operator === 'isEmpty' || operator === 'notEmpty';
	}

	protected _operatorId(header: any): string {
		return `data-grid-filter-${header.column.id}-operator`;
	}

	protected _valueId(header: any, suffix?: string): string {
		return suffix ? `data-grid-filter-${header.column.id}-${suffix}` : `data-grid-filter-${header.column.id}`;
	}

	protected _textValue(header: any): string {
		const value = this._spec(header).value;
		return Array.isArray(value) ? String(value[0] ?? '') : ((value ?? '') as string);
	}

	protected _range(header: any): [string, string] {
		const value = this._spec(header).value;
		if (Array.isArray(value))
			return [value[0] == null ? '' : String(value[0]), value[1] == null ? '' : String(value[1])];
		return [value == null ? '' : String(value), ''];
	}

	protected _booleanValue(header: any): string {
		const value = this._spec(header).value;
		return value === true ? 'true' : value === false ? 'false' : '';
	}

	protected _optionValue(value: unknown): string {
		return String(value ?? '');
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
		return operator || this._defaultOperator(meta.type);
	}

	protected _rootText(root: HTMLElement | null): string {
		return (root?.querySelector('[data-slot="data-grid-value"]') as HTMLInputElement | null)?.value ?? '';
	}

	protected _rootRange(root: HTMLElement | null): [unknown, unknown] {
		const from = (root?.querySelector('[data-slot="data-grid-value-from"]') as HTMLInputElement | null)?.value ?? '';
		const to = (root?.querySelector('[data-slot="data-grid-value-to"]') as HTMLInputElement | null)?.value ?? '';
		return [from || undefined, to || undefined];
	}

	protected _rootChoice(root: HTMLElement | null): string {
		return (root?.querySelector('[data-slot="data-grid-value"] select') as HTMLSelectElement | null)?.value ?? '';
	}

	protected _onOperator(header: any, meta: BrnColumnFilterMeta, event: Event): void {
		const operator = (event.target as HTMLSelectElement).value as BrnFilterOperator;
		if (this._isEmptiness(operator)) {
			header.column.setFilterValue({ operator, value: undefined });
			return;
		}
		const root = this._filterRoot(event);
		if (meta.type === 'number' || meta.type === 'date') {
			if (operator === 'between') {
				const [from, to] = this._rootRange(root);
				if (from === undefined && to === undefined) {
					header.column.setFilterValue({ operator, value: undefined });
					return;
				}
				header.column.setFilterValue({ operator, value: [from, to] });
				return;
			}
			const [from, to] = this._rootRange(root);
			const single = from ?? to;
			header.column.setFilterValue(single === undefined ? { operator, value: undefined } : { operator, value: single });
			return;
		}
		if (meta.type === 'boolean') {
			const choice = this._rootChoice(root);
			if (choice === '') {
				header.column.setFilterValue({ operator, value: undefined });
				return;
			}
			header.column.setFilterValue({ operator, value: choice === 'true' });
			return;
		}
		if (meta.type === 'select') {
			const choice = this._rootChoice(root);
			header.column.setFilterValue({ operator, value: choice === '' ? undefined : choice });
			return;
		}
		const value = this._rootText(root);
		header.column.setFilterValue({ operator, value: value === '' ? undefined : value });
	}

	protected _onText(header: any, meta: BrnColumnFilterMeta, event: Event): void {
		const operator = this._rootOperator(this._filterRoot(event), meta);
		if (this._isEmptiness(operator)) {
			header.column.setFilterValue({ operator, value: undefined });
			return;
		}
		const value = (event.target as HTMLInputElement).value;
		if (value === '') {
			header.column.setFilterValue(undefined);
			return;
		}
		header.column.setFilterValue({ operator, value });
	}

	protected _onRange(header: any, meta: BrnColumnFilterMeta, index: 0 | 1, event: Event): void {
		const root = this._filterRoot(event);
		const operator = this._rootOperator(root, meta);
		if (operator !== 'between') {
			const value = (event.target as HTMLInputElement).value;
			header.column.setFilterValue(value === '' ? undefined : { operator, value });
			return;
		}
		const [from, to] = this._rootRange(root);
		if (from === undefined && to === undefined) {
			header.column.setFilterValue(undefined);
			return;
		}
		header.column.setFilterValue({ operator: 'between', value: [from, to] });
	}

	protected _onBoolean(header: any, meta: BrnColumnFilterMeta, event: Event): void {
		const operator = this._rootOperator(this._filterRoot(event), meta);
		if (this._isEmptiness(operator)) {
			header.column.setFilterValue({ operator, value: undefined });
			return;
		}
		const value = (event.target as HTMLSelectElement).value;
		if (value === '') {
			header.column.setFilterValue(undefined);
			return;
		}
		header.column.setFilterValue({ operator, value: value === 'true' });
	}

	protected _onSelect(header: any, meta: BrnColumnFilterMeta, event: Event): void {
		const operator = this._rootOperator(this._filterRoot(event), meta);
		const value = (event.target as HTMLSelectElement).value;
		if (value === '' && !this._isEmptiness(operator)) {
			header.column.setFilterValue(undefined);
			return;
		}
		header.column.setFilterValue({ operator, value: value === '' ? undefined : value });
	}

	protected _onGlobal(table: any, event: Event): void {
		const value = (event.target as HTMLInputElement).value;
		table?.setGlobalFilter(value === '' ? undefined : value);
	}

	protected _hasActiveFilters(grid: any): boolean {
		return grid.state().filters.length > 0 || (grid.state().globalFilter ?? '') !== '';
	}

	protected _columnLabel(label: string): string {
		const columns = this.columns() as { id?: unknown; accessorKey?: unknown; meta?: BrnDataGridColumnMeta }[];
		for (const column of columns) {
			const id = column.id ?? column.accessorKey;
			if (id !== undefined && String(id) === label) return column.meta?.filter?.label ?? label;
		}
		return label;
	}

	protected _chipLabel(chip: BrnFilter): string {
		return this._columnLabel(chip.id);
	}

	protected _chipValue(chip: BrnFilter): string {
		if (chip.operator === 'isEmpty') return 'is empty';
		if (chip.operator === 'notEmpty') return 'is not empty';
		if (chip.operator === 'between' && Array.isArray(chip.value)) {
			const [from, to] = chip.value;
			return `${from ?? '…'} – ${to ?? '…'}`;
		}
		if (chip.operator === 'in' && Array.isArray(chip.value)) return chip.value.map(String).join(', ');
		return String(chip.value ?? '');
	}

	protected _removeLabel(chip: BrnFilter): string {
		return `Remove ${this._chipLabel(chip)} filter`;
	}

	protected _removeFilter(table: any, id: string): void {
		table?.getColumn?.(id)?.setFilterValue(undefined);
	}

	protected _clearGlobal(table: any): void {
		table?.setGlobalFilter('');
	}

	protected _clearAll(table: any): void {
		for (const column of table?.getAllLeafColumns?.() ?? []) {
			column?.setFilterValue?.(undefined);
		}
		table?.setGlobalFilter('');
	}
}
