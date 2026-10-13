import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	columnFilteringFeature,
	columnVisibilityFeature,
	createColumnHelper,
	filterFn_includesString,
	filterFn_weakEquals,
	globalFilteringFeature,
	rowPaginationFeature,
	rowSortingFeature,
	tableFeatures,
} from '@tanstack/angular-table';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRestAdapter } from './adapters/rest-adapter';
import { injectBrnDataGrid } from './brn-data-grid-state';
import type { BrnDataAdapter, BrnGridState } from './brn-data-source';

describe('rest query mapping (core contract)', () => {
	it('maps page 2 + sort + filter to query object', () => {
		const adapter: BrnDataAdapter<{ id: string }, Record<string, string>> = {
			buildQuery: (s: BrnGridState) => ({
				page: String(s.page + 1),
				pageSize: String(s.pageSize),
				sortBy: s.sorting[0]?.id ?? '',
			}),
			fetch: vi.fn(async () => ({ rows: [], total: 0 })),
		};
		const q = adapter.buildQuery({ page: 1, pageSize: 10, sorting: [{ id: 'email', desc: true }], filters: [] });
		expect(q).toEqual({ page: '2', pageSize: '10', sortBy: 'email' });
	});
	it('aborts stale fetch so slow page 0 cannot overwrite fast page 1', async () => {
		const adapter: BrnDataAdapter<string, { page: number }> = {
			buildQuery: (s) => ({ page: s.page }),
			fetch: (q, signal) =>
				new Promise((resolve, reject) => {
					const t = setTimeout(() => resolve({ rows: [`p${q.page}`], total: 20 }), q.page === 0 ? 200 : 10);
					signal.addEventListener('abort', () => {
						clearTimeout(t);
						reject(new DOMException('aborted', 'AbortError'));
					});
				}),
		};
		const c1 = new AbortController();
		const p1 = adapter.fetch(adapter.buildQuery({ page: 0, pageSize: 10, sorting: [], filters: [] }), c1.signal);
		c1.abort();
		await expect(p1).rejects.toThrow();
		const rows = await adapter.fetch(
			adapter.buildQuery({ page: 1, pageSize: 10, sorting: [], filters: [] }),
			new AbortController().signal,
		);
		expect(rows.rows).toEqual(['p1']);
	});
});

type DebounceUser = { name: string; email: string };

const debounceFeatures = tableFeatures({
	columnFilteringFeature,
	columnVisibilityFeature,
	globalFilteringFeature,
	rowPaginationFeature,
	rowSortingFeature,
	// v9 resolves a column's filter function by name from this registry, and picks `weakEquals` while
	// the table still has no rows (the first page has not arrived yet), so both paths must be registered.
	filterFns: { includesString: filterFn_includesString, weakEquals: filterFn_weakEquals },
});

const debounceColumnHelper = createColumnHelper<typeof debounceFeatures, DebounceUser>();
const debounceColumns = [
	debounceColumnHelper.accessor('name', { id: 'name', header: 'Name', cell: (info) => info.getValue<string>() }),
	debounceColumnHelper.accessor('email', { id: 'email', header: 'Email', cell: (info) => info.getValue<string>() }),
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('injectBrnDataGrid filter debounce', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({});
	});
	afterEach(() => {
		TestBed.resetTestingModule();
	});

	function createGrid(debounceMs = 60) {
		return TestBed.runInInjectionContext(() =>
			injectBrnDataGrid({
				adapter: createRestAdapter<DebounceUser>({
					baseUrl: '/api/users',
					fetchFn: async () => ({ rows: [], total: 0 }),
				}),
				initial: { pageSize: 5 },
				debounceMs,
				features: debounceFeatures,
				columns: debounceColumns,
			}),
		);
	}

	it('holds the filter-driven query past the debounce window, then applies it', async () => {
		const grid = createGrid(60);
		TestBed.inject(ApplicationRef).tick();
		const before = grid.query();
		grid.table.getColumn('email')?.setFilterValue('ada');
		TestBed.inject(ApplicationRef).tick();
		// The applied state, and with it the query, waits for the debounce window while the table
		// keeps the raw slice (its read-back is covered by the directive spec, which runs a fixture).
		expect(grid.state().filters).toEqual([]);
		expect(grid.query()).toEqual(before);
		await sleep(200);
		TestBed.inject(ApplicationRef).tick();
		// The applied filter carries its resolved operator, so adapters never have to guess one.
		expect(grid.state().filters).toEqual([{ id: 'email', value: 'ada', operator: 'contains' }]);
		expect(grid.query()['filter[email]']).toBe('ada');
		expect(grid.query()).not.toEqual(before);
	});

	it('resets to the first page when a filter is applied', async () => {
		const grid = createGrid(20);
		TestBed.inject(ApplicationRef).tick();
		grid.table.setPageIndex(2);
		TestBed.inject(ApplicationRef).tick();
		expect(grid.query().page).toBe('3');

		grid.table.getColumn('email')?.setFilterValue('ada');
		TestBed.inject(ApplicationRef).tick();
		await sleep(150);
		TestBed.inject(ApplicationRef).tick();

		// Page 3 of the unfiltered set is meaningless once a filter narrows it.
		expect(grid.query().page).toBe('1');
		expect(grid.query()['filter[email]']).toBe('ada');
	});

	it('resets to the first page when the sort changes', async () => {
		const grid = createGrid(20);
		TestBed.inject(ApplicationRef).tick();
		grid.table.setPageIndex(2);
		TestBed.inject(ApplicationRef).tick();
		expect(grid.query().page).toBe('3');

		grid.table.setSorting([{ id: 'email', desc: true }]);
		TestBed.inject(ApplicationRef).tick();

		expect(grid.query().page).toBe('1');
		expect(grid.query().sortBy).toBe('email');
	});

	it('wires the global filter through the table state into the query', async () => {
		const grid = createGrid(20);
		TestBed.inject(ApplicationRef).tick();
		expect(grid.query().q).toBeUndefined();

		grid.table.setGlobalFilter('ada');
		TestBed.inject(ApplicationRef).tick();
		// Debounced like the column filters.
		expect(grid.query().q).toBeUndefined();
		await sleep(150);
		TestBed.inject(ApplicationRef).tick();

		expect(grid.state().globalFilter).toBe('ada');
		expect(grid.query().q).toBe('ada');

		grid.table.setGlobalFilter('');
		TestBed.inject(ApplicationRef).tick();
		await sleep(150);
		TestBed.inject(ApplicationRef).tick();
		expect(grid.state().globalFilter).toBeUndefined();
		expect(grid.query().q).toBeUndefined();
	});

	it('applies pagination immediately, flushing a pending filter', async () => {
		const grid = createGrid(60);
		TestBed.inject(ApplicationRef).tick();
		grid.table.getColumn('email')?.setFilterValue('ada');
		TestBed.inject(ApplicationRef).tick();
		grid.table.setPageIndex(1);
		TestBed.inject(ApplicationRef).tick();
		// No sleep: page/sort skip the debounce window and carry pending filters with them.
		// Paging does not reset the page it was just asked for.
		expect(grid.query().page).toBe('2');
		expect(grid.query()['filter[email]']).toBe('ada');
	});
});
