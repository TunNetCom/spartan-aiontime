import {
	computed,
	Directive,
	inject,
	Injector,
	input,
	runInInjectionContext,
	signal,
	type OnInit,
	type Signal,
} from '@angular/core';
import type { ColumnDef, RowData, TableFeatures } from '@tanstack/angular-table';
import { injectBrnDataGrid } from './brn-data-grid-state';
import type { BrnDataAdapter, BrnGridState } from './brn-data-source';

/**
 * Headless server-driven grid state. It owns page/sort/filter state, fetching (debounced filters,
 * stale-request aborts) and the TanStack table instance.
 *
 * Apply it to your own `<table>` and render from `table` via `exportAs: 'brnDataGrid'`, or use the
 * styled `HlmDataGrid` from `@spartan-ng/helm/data-grid`, which composes this directive for you.
 *
 * ```html
 * <table brnDataGrid #grid="brnDataGrid" [adapter]="adapter" [features]="features" [columns]="columns">
 * 	@for (row of grid.table.getRowModel().rows; track row.id) { ... }
 * </table>
 * ```
 */
@Directive({
	selector: '[brnDataGrid]',
	exportAs: 'brnDataGrid',
	host: {
		'[attr.aria-busy]': 'loading() ? "true" : "false"',
	},
})
export class BrnDataGrid<TData extends RowData> implements OnInit {
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

	private readonly _injector = inject(Injector);
	/**
	 * A signal, not a plain field: a parent template or `computed` that reads the grid before this
	 * directive's ngOnInit (e.g. a query preview rendered above the table) tracks it and updates once
	 * the grid starts, instead of caching its pre-init fallback forever.
	 */
	private readonly _grid = signal<ReturnType<typeof injectBrnDataGrid<TData>> | undefined>(undefined);

	ngOnInit(): void {
		// Built here rather than in a field initializer: the grid evaluates its required inputs the
		// first time it builds a query, and reading a required input before Angular binds it throws
		// NG0950. Inputs are bound by ngOnInit, so the grid starts clean.
		// The adapter/features/columns are read through getters so a rebind (e.g. new columns) still
		// flows into the grid's computed query and table options.
		const adapter = this.adapter;
		const features = this.features;
		const columns = this.columns;
		const initial = this.initial();
		const debounceMs = this.debounceMs();
		const grid = runInInjectionContext(this._injector, () =>
			injectBrnDataGrid<TData>({
				get adapter() {
					return adapter();
				},
				get features() {
					return features();
				},
				get columns() {
					return columns();
				},
				initial,
				debounceMs,
			}),
		);
		this._grid.set(grid);
	}

	/**
	 * The TanStack table instance backing this grid.
	 */
	public get table() {
		return this._assertGrid().table;
	}

	/**
	 * The rows of the current page. Readable before the grid starts (empty until the first page).
	 */
	public readonly rows: Signal<TData[]> = computed(() => this._grid()?.data() ?? []);

	/**
	 * Total row count reported by the adapter (`0` until the first page).
	 */
	public readonly total: Signal<number> = computed(() => this._grid()?.total() ?? 0);

	/**
	 * Whether a fetch is in flight.
	 */
	public readonly loading: Signal<boolean> = computed(() => this._grid()?.loading() ?? false);

	/**
	 * The last fetch error, if any.
	 */
	public readonly error: Signal<unknown> = computed(() => this._grid()?.error() ?? null);

	/**
	 * The current page, pageSize, sorting, filters and globalFilter. Readable before the grid starts,
	 * so a parent template can show it (e.g. a query preview): it reports the `initial` state until
	 * ngOnInit, then follows the grid.
	 */
	public readonly state: Signal<BrnGridState> = computed(() => {
		const grid = this._grid();
		if (grid) return grid.state();
		const initial = this.initial();
		return {
			page: initial.page ?? 0,
			pageSize: initial.pageSize ?? 10,
			sorting: initial.sorting ?? [],
			filters: initial.filters ?? [],
			...(initial.globalFilter ? { globalFilter: initial.globalFilter } : {}),
		};
	});

	/**
	 * Refetches the current page.
	 */
	public reload(): void {
		this._assertGrid().reload();
	}

	/**
	 * Applies any pending filter changes now, skipping the debounce window, and goes back to the
	 * first page. Filter controls with an explicit Apply call this so the fetch is immediate.
	 */
	public flushFilters(): void {
		this._assertGrid().flushFilters();
	}

	private _assertGrid() {
		const grid = this._grid();
		if (!grid) {
			throw new Error('BrnDataGrid: the grid is only available from ngOnInit onwards.');
		}
		return grid;
	}
}
