import { ApplicationRef, ChangeDetectionStrategy, Component } from '@angular/core';
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
import { BrnColumnFilter } from './brn-column-filter';
import { BrnDataGrid } from './brn-data-grid';
import type { BrnDataGridColumnMeta } from './brn-data-source';

type GridUser = { name: string; age: number; role: string };

const features = tableFeatures({
	columnFilteringFeature,
	columnVisibilityFeature,
	rowPaginationFeature,
	rowSortingFeature,
	filterFns: { includesString: filterFn_includesString, weakEquals: filterFn_weakEquals },
});

const columnHelper = createColumnHelper<typeof features, GridUser>();
const columns = [
	columnHelper.accessor('name', {
		id: 'name',
		header: 'Name',
		cell: (info) => info.getValue<string>(),
		meta: { filter: { type: 'string', label: 'Name' } } as BrnDataGridColumnMeta,
	}),
	columnHelper.accessor('age', {
		id: 'age',
		header: 'Age',
		cell: (info) => String(info.getValue<number>()),
		meta: { filter: { type: 'number' } } as BrnDataGridColumnMeta,
	}),
	columnHelper.accessor('role', {
		id: 'role',
		header: 'Role',
		cell: (info) => info.getValue<string>(),
		meta: {
			filter: {
				type: 'select',
				options: [
					{ label: 'Admin', value: 'admin' },
					{ label: 'User', value: 'user' },
				],
			},
		} as BrnDataGridColumnMeta,
	}),
	// A column without `meta.filter`.
	columnHelper.accessor('name', { id: 'plain', header: 'Plain', cell: (info) => info.getValue<string>() }),
];

const fetchFn = vi.fn(async () => ({ rows: [{ name: 'Ada', age: 36, role: 'admin' }], total: 1 }));
const adapter = createRestAdapter<GridUser>({ baseUrl: '/api/users', fetchFn });

@Component({
	selector: 'brn-column-filter-host',
	imports: [BrnDataGrid, BrnColumnFilter],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<table brnDataGrid #grid="brnDataGrid" [adapter]="adapter" [features]="features" [columns]="columns">
			<thead>
				<tr>
					@for (header of grid.table.getHeaderGroups()[0].headers; track header.id) {
						<th>
							<span [brnColumnFilter]="header.column" #filter="brnColumnFilter" [attr.data-col]="header.column.id">
								<span [attr.data-active]="header.column.id">{{ filter.isActive() }}</span>
								<span [attr.data-can-apply]="header.column.id">{{ filter.canApply() }}</span>
							</span>
						</th>
					}
				</tr>
			</thead>
		</table>
	`,
})
class Host {
	public readonly adapter = adapter;
	public readonly features = features;
	public readonly columns = columns;
}

async function settle(fixture: { whenStable: () => Promise<unknown>; detectChanges: () => void }) {
	await fixture.whenStable();
	TestBed.inject(ApplicationRef).tick();
	fixture.detectChanges();
}

describe('BrnColumnFilter', () => {
	beforeEach(() => {
		fetchFn.mockClear();
		TestBed.configureTestingModule({ imports: [Host] });
	});
	afterEach(() => {
		TestBed.resetTestingModule();
	});

	async function setup() {
		const fixture = TestBed.createComponent(Host);
		await settle(fixture);
		const grid = fixture.debugElement.query(By.directive(BrnDataGrid)).injector.get(BrnDataGrid);
		const filterFor = (id: string): BrnColumnFilter =>
			fixture.debugElement.query(By.css(`[data-col="${id}"]`)).injector.get(BrnColumnFilter);
		return { fixture, grid, filterFor };
	}

	it('exposes the column meta and the operators of its type', async () => {
		const { filterFor } = await setup();
		const age = filterFor('age');

		expect(age.meta()?.type).toBe('number');
		expect(age.operators()).toContain('between');
		expect(filterFor('plain').meta()).toBeUndefined();
		expect(filterFor('plain').operators()).toEqual([]);
	});

	it('starts an unfiltered column on its initial operator with nothing to apply', async () => {
		const { filterFor } = await setup();
		const name = filterFor('name');
		name.open();

		expect(name.draft()).toEqual({
			logic: 'and',
			first: { operator: 'contains', value: undefined },
			second: undefined,
			caseSensitive: false,
		});
		expect(name.canApply()).toBe(false);
	});

	it('edits the draft without touching the grid', async () => {
		const { grid, filterFor } = await setup();
		const name = filterFor('name');
		name.open();
		const before = fetchFn.mock.calls.length;

		name.setValue('ada');

		expect(name.draft().first.value).toBe('ada');
		expect(name.canApply()).toBe(true);
		expect(grid.table.getColumn('name')?.getFilterValue()).toBeUndefined();
		expect(grid.state().filters).toEqual([]);
		expect(fetchFn.mock.calls.length).toBe(before);
	});

	it('apply() writes one filter and the grid sees it immediately', async () => {
		const { fixture, grid, filterFor } = await setup();
		const name = filterFor('name');
		name.open();
		name.setOperator('startsWith');
		name.setValue('ad');

		name.apply();
		await settle(fixture);

		expect(grid.state().filters).toEqual([{ id: 'name', operator: 'startsWith', value: 'ad', type: 'string' }]);
		expect(name.isActive()).toBe(true);
		expect(filterFor('age').isActive()).toBe(false);
	});

	it('apply() fetches without waiting for the debounce window', async () => {
		vi.useFakeTimers();
		try {
			const { fixture, filterFor } = await setup();
			const name = filterFor('name');
			name.open();
			name.setValue('ada');
			const before = fetchFn.mock.calls.length;

			name.apply();
			await settle(fixture);
			await vi.advanceTimersByTimeAsync(10);

			expect(fetchFn.mock.calls.length).toBeGreaterThan(before);
		} finally {
			vi.useRealTimers();
		}
	});

	it('applies a range as one `between` filter', async () => {
		const { fixture, grid, filterFor } = await setup();
		const age = filterFor('age');
		age.open();
		age.setRange('18', '65');

		age.apply();
		await settle(fixture);

		expect(grid.state().filters).toEqual([{ id: 'age', operator: 'between', value: [18, 65], type: 'number' }]);
	});

	it('applies a chosen set as an `in` filter', async () => {
		const { fixture, grid, filterFor } = await setup();
		const role = filterFor('role');
		role.open();
		role.setOperator('in');
		role.toggleOption('admin', true);
		role.toggleOption('user', true);
		expect(role.hasOption('admin')).toBe(true);

		role.apply();
		await settle(fixture);

		expect(grid.state().filters[0]).toMatchObject({ id: 'role', operator: 'in', value: ['admin', 'user'] });
	});

	it('applies an emptiness check without a value', async () => {
		const { fixture, grid, filterFor } = await setup();
		const name = filterFor('name');
		name.open();
		name.setOperator('isEmpty');
		expect(name.canApply()).toBe(true);

		name.apply();
		await settle(fixture);

		expect(grid.state().filters).toEqual([{ id: 'name', operator: 'isEmpty', value: undefined, type: 'string' }]);
	});

	it('refuses to apply a value the column type cannot read', async () => {
		const { filterFor } = await setup();
		const age = filterFor('age');
		age.open();
		age.setOperator('equals');
		age.setValue('abc');

		expect(age.canApply()).toBe(false);
	});

	it('applying an empty draft removes the column filter', async () => {
		const { fixture, grid, filterFor } = await setup();
		const name = filterFor('name');
		name.open();
		name.setValue('ada');
		name.apply();
		await settle(fixture);
		expect(grid.state().filters.length).toBe(1);

		name.open();
		name.setValue('');
		name.apply();
		await settle(fixture);

		expect(grid.state().filters).toEqual([]);
		expect(name.isActive()).toBe(false);
	});

	it('open() starts the draft from the filter that is applied', async () => {
		const { fixture, filterFor } = await setup();
		const age = filterFor('age');
		age.open();
		age.setOperator('gt');
		age.setValue('30');
		age.apply();
		await settle(fixture);

		age.open();

		expect(age.draft().first).toEqual({ operator: 'gt', value: '30' });
	});

	it('reset() discards an unapplied draft', async () => {
		const { fixture, filterFor } = await setup();
		const name = filterFor('name');
		name.open();
		name.setValue('ada');
		name.apply();
		await settle(fixture);

		name.open();
		name.setValue('grace');
		name.reset();

		expect(name.draft().first.value).toBe('ada');
	});

	it('clear() removes the filter, empties the draft and fetches', async () => {
		const { fixture, grid, filterFor } = await setup();
		const name = filterFor('name');
		name.open();
		name.setValue('ada');
		name.apply();
		await settle(fixture);
		expect(name.isActive()).toBe(true);

		name.clear();
		await settle(fixture);

		expect(grid.state().filters).toEqual([]);
		expect(name.isActive()).toBe(false);
		expect(name.draft()).toEqual({
			logic: 'and',
			first: { operator: 'contains', value: undefined },
			second: undefined,
			caseSensitive: false,
		});
	});

	it('goes back to the first page when a filter is applied', async () => {
		const { fixture, grid, filterFor } = await setup();
		grid.table.setPageIndex(3);
		await settle(fixture);
		expect(grid.state().page).toBe(3);

		const name = filterFor('name');
		name.open();
		name.setValue('ada');
		name.apply();
		await settle(fixture);

		expect(grid.state().page).toBe(0);
	});
});

describe('BrnColumnFilter advanced', () => {
	beforeEach(() => {
		fetchFn.mockClear();
		TestBed.configureTestingModule({ imports: [Host] });
	});
	afterEach(() => {
		TestBed.resetTestingModule();
	});

	async function setup() {
		const fixture = TestBed.createComponent(Host);
		await settle(fixture);
		const grid = fixture.debugElement.query(By.directive(BrnDataGrid)).injector.get(BrnDataGrid);
		const filterFor = (id: string): BrnColumnFilter =>
			fixture.debugElement.query(By.css(`[data-col="${id}"]`)).injector.get(BrnColumnFilter);
		return { fixture, grid, filterFor };
	}

	it('applies two conditions as one group and fetches immediately', async () => {
		vi.useFakeTimers();
		try {
			const { fixture, grid, filterFor } = await setup();
			const name = filterFor('name');
			name.open();
			name.setValue('a');
			name.setValue('b', 1);
			name.setLogic('or');
			const before = fetchFn.mock.calls.length;

			name.apply();
			await settle(fixture);

			expect(grid.state().filters).toMatchObject([{ id: 'name', logic: 'or' }]);
			expect(name.isActive()).toBe(true);
			// Immediate: no debounce wait, no timer advance.
			expect(fetchFn.mock.calls.length).toBeGreaterThan(before);
		} finally {
			vi.useRealTimers();
		}
	});

	it('applying an emptied group removes the column filter', async () => {
		const { fixture, grid, filterFor } = await setup();
		const name = filterFor('name');
		name.open();
		name.setValue('a');
		name.setValue('b', 1);
		name.setLogic('or');
		name.apply();
		await settle(fixture);
		expect(grid.state().filters.length).toBe(1);

		name.open();
		name.setValue('');
		name.setValue('', 1);
		expect(name.canApply()).toBe(false);
		name.apply();
		await settle(fixture);

		expect(grid.state().filters).toEqual([]);
		expect(name.isActive()).toBe(false);
	});

	it('goes back to the first page when a group filter is applied', async () => {
		const { fixture, grid, filterFor } = await setup();
		grid.table.setPageIndex(3);
		await settle(fixture);
		expect(grid.state().page).toBe(3);

		const name = filterFor('name');
		name.open();
		name.setValue('a');
		name.setValue('b', 1);
		name.setLogic('or');
		name.apply();
		await settle(fixture);

		expect(grid.state().page).toBe(0);
	});

	it('edits the second condition without touching the first', async () => {
		const { filterFor } = await setup();
		const name = filterFor('name');
		name.open();
		name.setValue('a');
		name.setOperator('startsWith', 1);
		name.setValue('b', 1);

		expect(name.draft().first).toEqual({ operator: 'contains', value: 'a' });
		expect(name.draft().second).toEqual({ operator: 'startsWith', value: 'b' });
		expect(name.hasOption('x')).toBe(false);
	});

	it('tracks logic and case sensitivity in the draft', async () => {
		const { filterFor } = await setup();
		const name = filterFor('name');
		name.open();

		expect(name.draft().logic).toBe('and');
		name.setLogic('or');
		name.setCaseSensitive(true);

		expect(name.draft().logic).toBe('or');
		expect(name.draft().caseSensitive).toBe(true);
		expect(name.canApply()).toBe(false);
	});

	it('reopens a group from the filter that is applied', async () => {
		const { fixture, filterFor } = await setup();
		const name = filterFor('name');
		name.open();
		name.setValue('a');
		name.setValue('b', 1);
		name.setLogic('or');
		name.apply();
		await settle(fixture);

		name.open();

		expect(name.draft()).toMatchObject({
			logic: 'or',
			first: { operator: 'contains', value: 'a' },
			second: { operator: 'contains', value: 'b' },
		});
	});
});
