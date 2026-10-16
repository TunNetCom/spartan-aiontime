import { ApplicationRef, ChangeDetectionStrategy, Component, computed, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
	columnFilteringFeature,
	columnVisibilityFeature,
	createColumnHelper,
	filterFn_includesString,
	filterFn_weakEquals,
	rowPaginationFeature,
	rowSortingFeature,
	tableFeatures,
} from '@tanstack/angular-table';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRestAdapter } from './adapters/rest-adapter';
import { BrnDataGrid } from './brn-data-grid';

type GridUser = { name: string; email: string };

const features = tableFeatures({
	columnFilteringFeature,
	columnVisibilityFeature,
	rowPaginationFeature,
	rowSortingFeature,
	filterFns: { includesString: filterFn_includesString, weakEquals: filterFn_weakEquals },
});

const columnHelper = createColumnHelper<typeof features, GridUser>();
const columns = [
	columnHelper.accessor('name', { id: 'name', header: 'Name', cell: (info) => info.getValue<string>() }),
	columnHelper.accessor('email', { id: 'email', header: 'Email', cell: (info) => info.getValue<string>() }),
];

const USERS: GridUser[] = [
	{ name: 'Ada', email: 'ada@example.com' },
	{ name: 'Grace', email: 'grace@example.com' },
];

const fetchFn = vi.fn(async () => ({ rows: USERS, total: 42 }));
const adapter = createRestAdapter<GridUser>({ baseUrl: '/api/users', fetchFn });

@Component({
	selector: 'brn-data-grid-host',
	imports: [BrnDataGrid],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<table brnDataGrid #grid="brnDataGrid" [adapter]="adapter" [features]="features" [columns]="columns">
			<tbody>
				@for (row of grid.table.getRowModel().rows; track row.id) {
					<tr class="row">
						<td>{{ row.original.name }}</td>
					</tr>
				}
			</tbody>
		</table>
		<span data-testid="total">{{ grid.total() }}</span>
		<span data-testid="error">{{ grid.error() ? 'error' : 'ok' }}</span>
		<span data-testid="filter">{{ grid.table.getColumn('email')?.getFilterValue() }}</span>
		<span data-testid="filtered">{{ grid.table.getColumn('email')?.getIsFiltered() }}</span>
	`,
})
class Host {
	public readonly adapter = adapter;
	public readonly features = features;
	public readonly columns = columns;
}

describe('BrnDataGrid directive', () => {
	beforeEach(() => {
		fetchFn.mockClear();
		TestBed.configureTestingModule({ imports: [Host] });
	});
	afterEach(() => {
		TestBed.resetTestingModule();
	});

	it('renders rows from the adapter and exposes total on the template ref', async () => {
		const fixture = TestBed.createComponent(Host);
		await fixture.whenStable();
		TestBed.inject(ApplicationRef).tick();

		const el = fixture.nativeElement as HTMLElement;
		expect(el.querySelector('[data-testid="total"]')?.textContent).toBe('42');
		expect(el.querySelectorAll('.row').length).toBe(2);
		expect(el.querySelector('[data-testid="error"]')?.textContent).toBe('ok');
		// Accessibility lives in brain: the directive marks the host busy while fetching.
		expect(el.querySelector('table')?.getAttribute('aria-busy')).toBe('false');
	});

	it('reload() refetches the current page', async () => {
		const fixture = TestBed.createComponent(Host);
		await fixture.whenStable();
		TestBed.inject(ApplicationRef).tick();

		const grid = fixture.debugElement.query(By.directive(BrnDataGrid)).injector.get(BrnDataGrid);
		const before = fetchFn.mock.calls.length;
		grid.reload();
		await fixture.whenStable();
		TestBed.inject(ApplicationRef).tick();

		expect(fetchFn.mock.calls.length).toBeGreaterThan(before);
	});

	it('exposes page state through the template ref', async () => {
		const fixture = TestBed.createComponent(Host);
		await fixture.whenStable();
		TestBed.inject(ApplicationRef).tick();

		const grid = fixture.debugElement.query(By.directive(BrnDataGrid)).injector.get(BrnDataGrid);
		expect(grid.state().page).toBe(0);
		expect(grid.rows().length).toBe(2);
		expect(grid.total()).toBe(42);
	});

	it('reads a filter set through the table back out of the table state', async () => {
		const fixture = TestBed.createComponent(Host);
		await fixture.whenStable();
		TestBed.inject(ApplicationRef).tick();

		const grid = fixture.debugElement.query(By.directive(BrnDataGrid)).injector.get(BrnDataGrid);
		const el = fixture.nativeElement as HTMLElement;
		expect(el.querySelector('[data-testid="filtered"]')?.textContent).toBe('false');

		grid.table.getColumn('email')?.setFilterValue('ada');
		await fixture.whenStable();
		fixture.detectChanges();

		expect(el.querySelector('[data-testid="filter"]')?.textContent).toContain('ada');
		expect(el.querySelector('[data-testid="filtered"]')?.textContent).toBe('true');
	});
});

@Component({
	selector: 'brn-data-grid-preview-host',
	imports: [BrnDataGrid],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<!-- Rendered above the grid, so it first runs before BrnDataGrid's ngOnInit. -->
		<span data-testid="preview">{{ preview() }}</span>
		<table brnDataGrid [adapter]="adapter" [features]="features" [columns]="columns"></table>
		<span data-testid="total">{{ total() }}</span>
	`,
})
class PreviewHost {
	public readonly adapter = adapter;
	public readonly features = features;
	public readonly columns = columns;
	private readonly _grid = viewChild(BrnDataGrid);
	public readonly total = computed(() => this._grid()?.total() ?? -1);

	// No try/catch: `state` is readable before the grid starts and then follows it.
	public readonly preview = computed(() => `page ${this._grid()?.state().page ?? '…'}`);
}

describe('BrnDataGrid read before init', () => {
	afterEach(() => {
		TestBed.resetTestingModule();
	});

	it('lets a parent template read the state before the grid starts, then follow it', async () => {
		TestBed.configureTestingModule({ imports: [PreviewHost] });
		const fixture = TestBed.createComponent(PreviewHost);
		await fixture.whenStable();
		fixture.detectChanges();

		// The computed first runs before ngOnInit (initial state), then must track the started grid.
		expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="preview"]')?.textContent).toBe('page 0');
		expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="total"]')?.textContent).toBe('42');

		fixture.debugElement.query(By.directive(BrnDataGrid)).injector.get(BrnDataGrid).table.setPageIndex(2);
		await fixture.whenStable();
		fixture.detectChanges();
		expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="preview"]')?.textContent).toBe('page 2');
	});
});
