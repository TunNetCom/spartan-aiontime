import { Component, computed, viewChild } from '@angular/core';
import { createODataAdapter } from '@spartan-ng/brain/data-grid';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDataGrid } from '@spartan-ng/helm/data-grid';
import { HlmInputImports } from '@spartan-ng/helm/input';
import {
	columnFilteringFeature,
	columnVisibilityFeature,
	createColumnHelper,
	filterFn_includesString,
	filterFn_weakEquals,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	tableFeatures,
} from '@tanstack/angular-table';

export type DataGridODataUser = {
	id: string;
	name: string;
	email: string;
};

const features = tableFeatures({
	columnFilteringFeature,
	columnVisibilityFeature,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	// v9 resolves filter functions by name from this registry, and picks `weakEquals` before the first
	// page of rows arrives, so both the string and the empty-table fallback are registered.
	filterFns: { includesString: filterFn_includesString, weakEquals: filterFn_weakEquals },
});

export type DataGridODataFeatures = typeof features;

const columnHelper = createColumnHelper<DataGridODataFeatures, DataGridODataUser>();

const columns = [
	columnHelper.accessor('name', {
		id: 'name',
		header: 'Name',
		cell: (info) => info.getValue<string>(),
	}),
	columnHelper.accessor('email', {
		id: 'email',
		header: 'Email',
		cell: (info) => `<div class="lowercase">${info.getValue<string>()}</div>`,
	}),
];

const USERS: DataGridODataUser[] = [
	{ id: '1', name: 'Ada Lovelace', email: 'ada@example.com' },
	{ id: '2', name: 'Grace Hopper', email: 'grace@example.com' },
	{ id: '3', name: 'Alan Turing', email: 'alan@example.com' },
	{ id: '4', name: 'Edsger Dijkstra', email: 'edsger@example.com' },
	{ id: '5', name: 'Barbara Liskov', email: 'barbara@example.com' },
	{ id: '6', name: 'Donald Knuth', email: 'donald@example.com' },
	{ id: '7', name: 'Linus Torvalds', email: 'linus@example.com' },
	{ id: '8', name: 'Margaret Hamilton', email: 'margaret@example.com' },
	{ id: '9', name: 'John von Neumann', email: 'john@example.com' },
	{ id: '10', name: 'Katherine Johnson', email: 'katherine@example.com' },
];

const adapter = createODataAdapter<DataGridODataUser>({
	baseUrl: '/odata/Users',
	// The mock only searches emails, so the global filter is pointed at that field.
	globalFilterFields: ['email'],
	fetchFn: async (url, signal) => {
		signal.throwIfAborted();
		const params = new URLSearchParams(url.split('?')[1] ?? '');
		const top = Number(params.get('$top') ?? '5');
		const skip = Number(params.get('$skip') ?? '0');
		const orderby = params.get('$orderby') ?? '';
		const filter = (params.get('$filter') ?? '').toLowerCase();
		const term = filter.match(/contains\(email,'((?:[^']|'')*)'\)/)?.[1].replace(/''/g, "'") ?? '';
		const rows = USERS.filter((u) => u.email.toLowerCase().includes(term)).sort((a, b) => {
			if (!orderby) return 0;
			const [id, dir] = orderby.split(' ');
			const left = String(a[id as keyof DataGridODataUser]);
			const right = String(b[id as keyof DataGridODataUser]);
			return dir === 'desc' ? right.localeCompare(left) : left.localeCompare(right);
		});
		return { rows: rows.slice(skip, skip + top), total: rows.length };
	},
});

@Component({
	selector: 'spartan-data-grid-odata-preview',
	imports: [HlmDataGrid, HlmInputImports, HlmButtonImports],
	host: { class: 'w-full' },
	template: `
		<div class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center">
			<input hlmInput class="w-full md:max-w-sm" placeholder="Filter emails..." (input)="_filterChanged($event)" />
			<button hlmBtn variant="outline" size="sm" (click)="_toggleEmailSort()">Sort by email {{ _sortLabel() }}</button>
		</div>
		<p class="text-muted-foreground font-mono text-xs break-all">GET /odata/Users?{{ _query() }}</p>
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
export class DataGridODataPreview {
	public readonly adapter = adapter;
	public readonly features = features;
	public readonly columns = columns;
	public readonly initial = { pageSize: 5 };

	private readonly _grid = viewChild.required(HlmDataGrid);

	protected readonly _query = computed(() => adapter.buildQuery(this._grid().state()));

	protected readonly _sortLabel = computed(() => {
		// Read from `state()`, which is available before the grid starts; `table` is not.
		const email = this._grid()
			.state()
			.sorting.find((entry) => entry.id === 'email');
		const sort = email ? (email.desc ? 'desc' : 'asc') : false;
		return sort === 'desc' ? '↓' : sort === 'asc' ? '↑' : '↕';
	});

	protected _filterChanged(event: Event) {
		this._grid()
			.table.getColumn('email')
			?.setFilterValue((event.target as HTMLInputElement).value);
	}

	protected _toggleEmailSort() {
		this._grid().table.getColumn('email')?.toggleSorting();
	}
}
