import { Component } from '@angular/core';
import { createRestAdapter, type BrnDataGridColumnMeta } from '@spartan-ng/brain/data-grid';
import { HlmDataGrid } from '@spartan-ng/helm/data-grid';
import {
	columnFilteringFeature,
	columnVisibilityFeature,
	createColumnHelper,
	filterFn_includesString,
	filterFn_weakEquals,
	globalFilteringFeature,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	tableFeatures,
} from '@tanstack/angular-table';

export type DataGridUser = {
	id: string;
	name: string;
	email: string;
};

const features = tableFeatures({
	columnFilteringFeature,
	columnVisibilityFeature,
	globalFilteringFeature,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	// v9 resolves filter functions by name from this registry, and picks `weakEquals` before the first
	// page of rows arrives, so both the string and the empty-table fallback are registered.
	filterFns: { includesString: filterFn_includesString, weakEquals: filterFn_weakEquals },
});

export type DataGridFeatures = typeof features;

const columnHelper = createColumnHelper<DataGridFeatures, DataGridUser>();

const columns = [
	columnHelper.accessor('name', {
		id: 'name',
		header: 'Name',
		cell: (info) => info.getValue<string>(),
		meta: { filter: { type: 'string', label: 'Name' } } as BrnDataGridColumnMeta,
	}),
	columnHelper.accessor('email', {
		id: 'email',
		header: 'Email',
		cell: (info) => `<div class="lowercase">${info.getValue<string>()}</div>`,
		meta: { filter: { type: 'string', label: 'Email' } } as BrnDataGridColumnMeta,
	}),
];

const USERS: DataGridUser[] = [
	{ id: '1', name: 'Ada Lovelace', email: 'ada@example.com' },
	{ id: '2', name: 'Grace Hopper', email: 'grace@example.com' },
	{ id: '3', name: 'Alan Turing', email: 'alan@example.com' },
	{ id: '4', name: 'Edsger Dijkstra', email: 'edsger@example.com' },
	{ id: '5', name: 'Barbara Liskov', email: 'barbara@example.com' },
	{ id: '6', name: 'Donald Knuth', email: 'donald@example.com' },
	{ id: '7', name: 'Linus Torvalds', email: 'linus@example.com' },
	{ id: '8', name: 'Margaret Hamilton', email: 'margaret@example.com' },
];

const adapter = createRestAdapter<DataGridUser>({
	baseUrl: '/api/users',
	fetchFn: async (url, signal) => {
		signal.throwIfAborted();
		const params = new URLSearchParams(url.split('?')[1] ?? '');
		const page = Number(params.get('page') ?? '1') - 1;
		const pageSize = Number(params.get('pageSize') ?? '5');
		const q = (params.get('q') ?? params.get('filter[email]') ?? '').toLowerCase();
		const rows = USERS.filter((u) => u.email.toLowerCase().includes(q));
		return { rows: rows.slice(page * pageSize, page * pageSize + pageSize), total: rows.length };
	},
});

@Component({
	selector: 'spartan-data-grid-preview',
	imports: [HlmDataGrid],
	host: { class: 'w-full' },
	template: `
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
export class DataGridPreview {
	public readonly adapter = adapter;
	public readonly features = features;
	public readonly columns = columns;
	public readonly initial = { pageSize: 5 };
}

export const defaultImports = `
import { HlmDataGrid } from '@spartan-ng/helm/data-grid';
import { createRestAdapter } from '@spartan-ng/brain/data-grid';
`;

export const defaultSkeleton = `
<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" />
`;
