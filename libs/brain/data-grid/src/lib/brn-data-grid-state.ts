import { computed, effect, resource, signal, type ResourceRef } from '@angular/core';
import {
	injectTable,
	type ColumnDef,
	type ColumnFiltersState,
	type RowData,
	type TableFeatures,
	type TableOptions,
} from '@tanstack/angular-table';
import {
	brnColumnDefId,
	brnFlattenColumnDefs,
	toBrnFilterGroup,
	toColumnFilters,
	type BrnDataAdapter,
	type BrnFilter,
	type BrnFilterGroup,
	type BrnFilterType,
	type BrnGridState,
} from './brn-data-source';

/** The internal state: filter slices stay in TanStack's shape and are resolved for the adapter. */
type GridState = {
	page: number;
	pageSize: number;
	sorting: BrnGridState['sorting'];
	columnFilters: ColumnFiltersState;
	globalFilter: unknown;
};

export function injectBrnDataGrid<TData extends RowData>(opts: {
	adapter: BrnDataAdapter<TData, any>;
	initial?: Partial<BrnGridState>;
	/** Debounce window for filter-driven fetches. Filter inputs stay responsive; only the query is delayed. */
	debounceMs?: number;
	/**
	 * The feature registry built with `tableFeatures(...)`.
	 */
	features: TableFeatures;
	/**
	 * Column definitions created with `createColumnHelper<typeof features, TData>()`.
	 */
	columns: ColumnDef<any, TData, any>[];
}) {
	const debounceMs = opts.debounceMs ?? 300;
	const raw = signal<GridState>({
		page: opts.initial?.page ?? 0,
		pageSize: opts.initial?.pageSize ?? 10,
		sorting: opts.initial?.sorting ?? [],
		columnFilters: toColumnFilters(opts.initial?.filters ?? []),
		globalFilter: opts.initial?.globalFilter,
	});
	// Debounced copy of the filter slices. The TanStack-visible state updates immediately (inputs stay
	// responsive) while `query` below reads the applied copy, so filter keystrokes fetch once per pause
	// instead of once per keystroke. Page/sort stay immediate via `query`.
	const appliedFilters = signal({ columnFilters: raw().columnFilters, globalFilter: raw().globalFilter });

	// Per-slice views of the raw state. Each one only notifies when its own slice changes, so a filter
	// keystroke (which replaces the `raw` object) does not recompute the query or refetch the page.
	const page = computed(() => raw().page);
	const pageSize = computed(() => raw().pageSize);
	const sorting = computed(() => raw().sorting);
	const pendingColumnFilters = computed(() => raw().columnFilters);
	const pendingGlobalFilter = computed(() => raw().globalFilter);
	let filterTimer: ReturnType<typeof setTimeout> | undefined;

	const setPage = (page: number) => {
		if (raw().page !== page) raw.update((s) => ({ ...s, page }));
	};

	/** Pushes the pending filters into the applied copy. A new filter makes the current page meaningless. */
	const applyPendingFilters = (resetPage: boolean) => {
		const current = appliedFilters();
		if (current.columnFilters !== raw().columnFilters || current.globalFilter !== raw().globalFilter) {
			appliedFilters.set({ columnFilters: raw().columnFilters, globalFilter: raw().globalFilter });
			if (resetPage) setPage(0);
		}
	};

	const scheduleAppliedFilters = () => {
		clearTimeout(filterTimer);
		filterTimer = setTimeout(() => applyPendingFilters(true), debounceMs);
	};

	// Safety net for filter updates that bypass the table handlers (direct `state` writes):
	// the same shared timer debounces them into the applied copy.
	effect((onCleanup) => {
		pendingColumnFilters();
		pendingGlobalFilter();
		scheduleAppliedFilters();
		onCleanup(() => clearTimeout(filterTimer));
	});

	/** Applies any pending filters immediately. Paging passes `false`: that click owns the page. */
	const flushAppliedFilters = (resetPage = true) => {
		clearTimeout(filterTimer);
		filterTimer = undefined;
		applyPendingFilters(resetPage);
	};

	/** Column filter types declared through `meta`, so the adapters can quote literals correctly. */
	const filterTypes = computed<Record<string, BrnFilterType>>(() => {
		const types: Record<string, BrnFilterType> = {};
		for (const def of brnFlattenColumnDefs(opts.columns)) {
			const type = def.meta?.filter?.type;
			const id = brnColumnDefId(def);
			if (type && id !== undefined) types[id] = type;
		}
		return types;
	});

	/** The applied filters, resolved to operators (and declared column types) the adapters can map. */
	const filters = computed<(BrnFilter | BrnFilterGroup)[]>(() => {
		const types = filterTypes();
		return appliedFilters()
			.columnFilters.map((filter) => toBrnFilterGroup(filter.id, filter.value, types[filter.id]))
			.filter((filter): filter is BrnFilter | BrnFilterGroup => filter !== undefined);
	});
	const globalFilter = computed(() => {
		const value = appliedFilters().globalFilter;
		return value === undefined || value === null || value === '' ? undefined : String(value);
	});

	/** The state adapters and consumers see: filters carry their resolved operator. */
	const state = computed<BrnGridState>(() => ({
		page: page(),
		pageSize: pageSize(),
		sorting: sorting(),
		filters: filters(),
		globalFilter: globalFilter(),
	}));
	// Only reads the applied slices: pending filter keystrokes never rebuild the query, so the
	// resource below (which refetches whenever its params change identity) stays put until they apply.
	const query = computed(() => opts.adapter.buildQuery(state()));
	const res: ResourceRef<{ rows: TData[]; total: number } | undefined> = resource({
		params: () => ({ q: query() }),
		loader: ({ params, abortSignal }) => opts.adapter.fetch(params.q, abortSignal),
	});
	// `resource.value()` throws once the resource is in an error state and `hasValue()` is false
	// there, so the last successful payload is mirrored: a failed refetch keeps the previous page on
	// screen and `rows()`/`total()` stay readable instead of throwing while the template renders.
	const loaded = signal<{ rows: TData[]; total: number } | undefined>(undefined);
	effect(() => {
		if (res.hasValue()) {
			loaded.set(res.value());
		}
	});
	const data = computed(() => loaded()?.rows ?? []);
	const total = computed(() => loaded()?.total ?? 0);
	const loading = computed(() => res.isLoading());
	const error = computed(() => res.error() ?? null);
	const table = injectTable(
		() =>
			({
				features: opts.features,
				columns: opts.columns,
				data: data(),
				rowCount: total(),
				manualPagination: true,
				manualSorting: true,
				manualFiltering: true,
				onPaginationChange: (u: any) => {
					const next = typeof u === 'function' ? u({ pageIndex: raw().page, pageSize: raw().pageSize }) : u;
					raw.update((s) => ({
						...s,
						page: next.pageIndex ?? s.page,
						pageSize: next.pageSize ?? s.pageSize,
					}));
					flushAppliedFilters(false);
				},
				onSortingChange: (u: any) => {
					raw.update((s) => ({ ...s, sorting: typeof u === 'function' ? u(s.sorting) : u }));
					// A new sort order invalidates the current page. Pending filters ride along.
					flushAppliedFilters(false);
					setPage(0);
				},
				onColumnFiltersChange: (u: any) => {
					raw.update((s) => ({ ...s, columnFilters: typeof u === 'function' ? u(s.columnFilters) : u }));
					scheduleAppliedFilters();
				},
				onGlobalFilterChange: (u: any) => {
					raw.update((s) => ({ ...s, globalFilter: typeof u === 'function' ? u(s.globalFilter) : u }));
					scheduleAppliedFilters();
				},
				state: {
					pagination: { pageIndex: raw().page, pageSize: raw().pageSize },
					sorting: raw().sorting,
					columnFilters: raw().columnFilters,
					globalFilter: raw().globalFilter,
				},
				// TanStack v9 types table options through conditional feature maps
				// (`ExtractFeatureMapTypes<TFeatures, ...>` and `ValidateFeatureSlots<TFeatures>`), which
				// TypeScript cannot resolve, or structurally compare, for a reusable helper. The assertion
				// is confined to this internal call: every value above is constructed from TanStack's own
				// state and option shapes, and this function's public signature stays typed.
			}) as unknown as TableOptions<any, TData>,
	);
	return {
		table,
		state,
		query,
		data,
		total,
		loading,
		error,
		reload: () => res.reload(),
		/** Applies pending filters now instead of after the debounce window, e.g. on an explicit Apply. */
		flushFilters: () => flushAppliedFilters(true),
	};
}
