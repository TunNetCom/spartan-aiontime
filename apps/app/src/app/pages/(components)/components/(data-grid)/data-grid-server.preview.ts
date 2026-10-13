import { Component, computed, viewChild } from '@angular/core';
import { createRestAdapter } from '@spartan-ng/brain/data-grid';
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

export type DataGridServerUser = {
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

export type DataGridServerFeatures = typeof features;

const columnHelper = createColumnHelper<DataGridServerFeatures, DataGridServerUser>();

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

const USERS: DataGridServerUser[] = [
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
	{ id: '11', name: 'Dennis Ritchie', email: 'dennis@example.com' },
	{ id: '12', name: 'Ken Thompson', email: 'ken@example.com' },
];

const adapter = createRestAdapter<DataGridServerUser>({
	baseUrl: '/api/users',
	fetchFn: async (url, signal) => {
		signal.throwIfAborted();
		const params = new URLSearchParams(url.split('?')[1] ?? '');
		const page = Number(params.get('page') ?? '1') - 1;
		const pageSize = Number(params.get('pageSize') ?? '5');
		const sortBy = params.get('sortBy') ?? '';
		const sortDir = params.get('sortDir') ?? 'asc';
		const q = (params.get('q') ?? params.get('filter[email]') ?? '').toLowerCase();
		const rows = USERS.filter((u) => u.email.toLowerCase().includes(q)).sort((a, b) => {
			if (!sortBy) return 0;
			const left = String(a[sortBy as keyof DataGridServerUser]);
			const right = String(b[sortBy as keyof DataGridServerUser]);
			return sortDir === 'desc' ? right.localeCompare(left) : left.localeCompare(right);
		});
		return { rows: rows.slice(page * pageSize, page * pageSize + pageSize), total: rows.length };
	},
});

@Component({
	selector: 'spartan-data-grid-server-preview',
	imports: [HlmDataGrid, HlmInputImports, HlmButtonImports],
	host: { class: 'w-full' },
	template: `
		<div class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center">
			<input hlmInput class="w-full md:max-w-sm" placeholder="Filter emails..." (input)="_filterChanged($event)" />
			<button hlmBtn variant="outline" size="sm" (click)="_toggleEmailSort()">Sort by email {{ _sortLabel() }}</button>
		</div>
		<p class="text-muted-foreground font-mono text-xs break-all">GET {{ _queryString() }}</p>
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
export class DataGridServerPreview {
	public readonly adapter = adapter;
	public readonly features = features;
	public readonly columns = columns;
	public readonly initial = { pageSize: 5 };

	private readonly _grid = viewChild.required(HlmDataGrid);

	protected readonly _queryString = computed(
		() => `/api/users?${new URLSearchParams(adapter.buildQuery(this._grid().state())).toString()}`,
	);

	protected readonly _sortLabel = computed(() => {
		const sort = this._grid().table.getColumn('email')?.getIsSorted();
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
