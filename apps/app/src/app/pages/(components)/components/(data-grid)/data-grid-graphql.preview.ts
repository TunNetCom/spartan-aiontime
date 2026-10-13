import { Component, computed, viewChild } from '@angular/core';
import { createGraphQLAdapter } from '@spartan-ng/brain/data-grid';
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

export type DataGridGraphQLUser = {
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

export type DataGridGraphQLFeatures = typeof features;

const columnHelper = createColumnHelper<DataGridGraphQLFeatures, DataGridGraphQLUser>();

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

const USERS: DataGridGraphQLUser[] = [
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

const adapter = createGraphQLAdapter<DataGridGraphQLUser>({
	endpoint: '/graphql',
	query: 'query Users($offset: Int, $limit: Int, $where: UserFilter, $search: String) { users }',
	fetchFn: async (vars, signal) => {
		signal.throwIfAborted();
		const offset = vars.offset ?? 0;
		const limit = vars.limit ?? 5;
		const where = (vars.where as Record<string, unknown> | undefined) ?? {};
		const emailFilter: unknown = where['email'];
		const emailContains =
			typeof emailFilter === 'string'
				? emailFilter
				: String((emailFilter as { contains?: unknown } | undefined)?.contains ?? vars.search ?? '');
		const rows = USERS.filter((u) => u.email.toLowerCase().includes(emailContains.toLowerCase()));
		return { rows: rows.slice(offset, offset + limit), total: rows.length };
	},
});

@Component({
	selector: 'spartan-data-grid-graphql-preview',
	imports: [HlmDataGrid, HlmInputImports],
	host: { class: 'w-full' },
	template: `
		<div class="flex items-center gap-2 py-4">
			<input hlmInput class="w-full md:max-w-sm" placeholder="Filter emails..." (input)="_filterChanged($event)" />
		</div>
		<pre class="text-muted-foreground overflow-x-auto font-mono text-xs">{{ _variables() }}</pre>
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
export class DataGridGraphQLPreview {
	public readonly adapter = adapter;
	public readonly features = features;
	public readonly columns = columns;
	public readonly initial = { pageSize: 5 };

	private readonly _grid = viewChild.required(HlmDataGrid);

	protected readonly _variables = computed(() => JSON.stringify(adapter.buildQuery(this._grid().state()), null, 2));

	protected _filterChanged(event: Event) {
		this._grid()
			.table.getColumn('email')
			?.setFilterValue((event.target as HTMLInputElement).value);
	}
}
