import { Component, computed, viewChild, type Signal } from '@angular/core';
import { faker } from '@faker-js/faker';
import {
	BrnDataGridImports,
	createGraphQLAdapter,
	createODataAdapter,
	createRestAdapter,
	type BrnDataGridColumnMeta,
	type BrnFilter,
	type BrnFilterGroup,
	type BrnGridState,
} from '@spartan-ng/brain/data-grid';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDataGrid, HlmDataGridColumnFilter, HlmDataGridPagination } from '@spartan-ng/helm/data-grid';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmTableImports } from '@spartan-ng/helm/table';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import {
	columnFilteringFeature,
	columnVisibilityFeature,
	createColumnHelper,
	filterFn_includesString,
	filterFn_weakEquals,
	FlexRender,
	globalFilteringFeature,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	tableFeatures,
} from '@tanstack/angular-table';

export type DataGridStoryUser = {
	id: string;
	name: string;
	email: string;
};

// Seeded so every load (and Cypress run) sees the same rows.
faker.seed(4242);

const makeUsers = (count: number): DataGridStoryUser[] =>
	Array.from({ length: count }, () => ({
		id: faker.string.uuid(),
		name: faker.person.fullName(),
		email: faker.internet.email(),
	}));

const REST_USERS = makeUsers(42);
const ODATA_USERS = makeUsers(42);
const GRAPHQL_USERS = makeUsers(42);
const SLOW_USERS = makeUsers(12);

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

const columnHelper = createColumnHelper<typeof features, DataGridStoryUser>();

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

const filterUsers = (rows: DataGridStoryUser[], term: string): DataGridStoryUser[] => {
	const q = term.trim().toLowerCase();
	if (!q) return rows;
	return rows.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
};

const sortUsers = (rows: DataGridStoryUser[], id: string, dir: 'asc' | 'desc'): DataGridStoryUser[] => {
	if (!id) return rows;
	return [...rows].sort((a, b) => {
		const left = String(a[id as keyof DataGridStoryUser]);
		const right = String(b[id as keyof DataGridStoryUser]);
		return dir === 'desc' ? right.localeCompare(left) : left.localeCompare(right);
	});
};

const pageOf = (rows: DataGridStoryUser[], page: number, pageSize: number): DataGridStoryUser[] =>
	rows.slice(page * pageSize, page * pageSize + pageSize);

const readRestParams = (url: string) => {
	const params = new URLSearchParams(url.split('?')[1] ?? '');
	return {
		page: Number(params.get('page') ?? '1') - 1,
		pageSize: Number(params.get('pageSize') ?? '5'),
		term: params.get('q') ?? params.get('filter[email]') ?? '',
		sortBy: params.get('sortBy') ?? '',
		sortDir: (params.get('sortDir') ?? 'asc') as 'asc' | 'desc',
	};
};

const restAdapter = createRestAdapter<DataGridStoryUser>({
	baseUrl: '/api/users',
	fetchFn: async (url, signal) => {
		signal.throwIfAborted();
		const { page, pageSize, term, sortBy, sortDir } = readRestParams(url);
		const rows = sortUsers(filterUsers(REST_USERS, term), sortBy, sortDir);
		return { rows: pageOf(rows, page, pageSize), total: rows.length };
	},
});

const odataAdapter = createODataAdapter<DataGridStoryUser>({
	baseUrl: '/odata/Users',
	globalFilterFields: ['email'],
	fetchFn: async (url, signal) => {
		signal.throwIfAborted();
		const params = new URLSearchParams(url.split('?')[1] ?? '');
		const top = Number(params.get('$top') ?? '5');
		const skip = Number(params.get('$skip') ?? '0');
		const orderby = params.get('$orderby') ?? '';
		const filter = (params.get('$filter') ?? '').toLowerCase();
		const term = filter.match(/contains\(email,'((?:[^']|'')*)'\)/)?.[1].replace(/''/g, "'") ?? '';
		const [sortId, sortDir] = orderby.split(' ');
		const rows = sortUsers(filterUsers(ODATA_USERS, term), sortId ?? '', sortDir === 'desc' ? 'desc' : 'asc');
		// Mock the OData JSON envelope, then map it onto the adapter result.
		const envelope = { value: rows.slice(skip, skip + top), '@odata.count': rows.length };
		return { rows: envelope.value, total: envelope['@odata.count'] };
	},
});

const graphqlAdapter = createGraphQLAdapter<DataGridStoryUser>({
	endpoint: '/graphql',
	query:
		'query Users($offset: Int, $limit: Int, $orderBy: [UserOrder!], $where: UserFilter, $search: String) { users { rows total } }',
	fetchFn: async (vars, signal) => {
		signal.throwIfAborted();
		const offset = vars.offset ?? 0;
		const limit = vars.limit ?? vars.first ?? 5;
		const where = (vars.where ?? {}) as Record<string, { contains?: unknown }>;
		const term = String(where['email']?.contains ?? vars.search ?? '');
		const sortEntry = Object.entries((vars.orderBy as Record<string, string>[] | undefined)?.[0] ?? {})[0];
		const rows = sortUsers(
			filterUsers(GRAPHQL_USERS, term),
			sortEntry?.[0] ?? '',
			sortEntry?.[1] === 'DESC' ? 'desc' : 'asc',
		);
		return { rows: rows.slice(offset, offset + limit), total: rows.length };
	},
});

const loadingAdapter = createRestAdapter<DataGridStoryUser>({
	baseUrl: '/api/users',
	fetchFn: (): Promise<{ rows: DataGridStoryUser[]; total: number }> =>
		new Promise(() => {
			/* never resolves — intentional loading state */
		}),
});

const emptyAdapter = createRestAdapter<DataGridStoryUser>({
	baseUrl: '/api/users',
	fetchFn: async (url, signal) => {
		signal.throwIfAborted();
		return { rows: [], total: 0 };
	},
});

const errorAdapter = createRestAdapter<DataGridStoryUser>({
	baseUrl: '/api/users',
	fetchFn: async () => {
		throw new Error('boom');
	},
});

const slowAdapter = createRestAdapter<DataGridStoryUser>({
	baseUrl: '/api/users',
	fetchFn: async (url, signal) => {
		signal.throwIfAborted();
		await new Promise((resolve) => setTimeout(resolve, 2000));
		signal.throwIfAborted();
		const { page, pageSize, term, sortBy, sortDir } = readRestParams(url);
		const rows = sortUsers(filterUsers(SLOW_USERS, term), sortBy, sortDir);
		return { rows: pageOf(rows, page, pageSize), total: rows.length };
	},
});

@Component({
	selector: 'data-grid-rest-story',
	imports: [HlmDataGrid, HlmInputImports, HlmButtonImports],
	host: { class: 'block w-full' },
	template: `
		<div class="flex flex-col gap-2 py-4 sm:flex-row sm:items-center">
			<input hlmInput class="w-full md:max-w-sm" placeholder="Filter emails..." (input)="_filterChanged($event)" />
			<button hlmBtn variant="outline" size="sm" (click)="_toggleEmailSort()">Sort by email {{ _sortLabel() }}</button>
		</div>
		<p class="text-muted-foreground font-mono text-xs break-all">GET {{ _queryString() }}</p>
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
class RestStory {
	public readonly adapter = restAdapter;
	public readonly features = features;
	public readonly columns = columns;
	public readonly initial = { pageSize: 5 };

	private readonly _grid = viewChild.required(HlmDataGrid);

	protected readonly _queryString = computed(() => {
		try {
			return `/api/users?${new URLSearchParams(restAdapter.buildQuery(this._grid().state())).toString()}`;
		} catch {
			// The child grid only exists after view init; show a placeholder until then.
			return '/api/users?…';
		}
	});

	protected readonly _sortLabel = computed(() => {
		try {
			const sort = this._grid().table.getColumn('email')?.getIsSorted();
			return sort === 'desc' ? '↓' : sort === 'asc' ? '↑' : '↕';
		} catch {
			return '↕';
		}
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

@Component({
	selector: 'data-grid-odata-story',
	imports: [HlmDataGrid, HlmInputImports, HlmButtonImports],
	host: { class: 'block w-full' },
	template: `
		<div class="flex items-center gap-2 py-4">
			<input hlmInput class="w-full md:max-w-sm" placeholder="Filter emails..." (input)="_filterChanged($event)" />
		</div>
		<p class="text-muted-foreground font-mono text-xs break-all">GET /odata/Users?{{ _query() }}</p>
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
class ODataStory {
	public readonly adapter = odataAdapter;
	public readonly features = features;
	public readonly columns = columns;
	public readonly initial = { pageSize: 5 };

	private readonly _grid = viewChild.required(HlmDataGrid);

	protected readonly _query = computed(() => {
		try {
			return odataAdapter.buildQuery(this._grid().state());
		} catch {
			// The child grid only exists after view init; show a placeholder until then.
			return '';
		}
	});

	protected _filterChanged(event: Event) {
		this._grid()
			.table.getColumn('email')
			?.setFilterValue((event.target as HTMLInputElement).value);
	}
}

@Component({
	selector: 'data-grid-graphql-story',
	imports: [HlmDataGrid, HlmInputImports],
	host: { class: 'block w-full' },
	template: `
		<div class="flex items-center gap-2 py-4">
			<input hlmInput class="w-full md:max-w-sm" placeholder="Filter emails..." (input)="_filterChanged($event)" />
		</div>
		<pre class="text-muted-foreground overflow-x-auto font-mono text-xs">{{ _variables() }}</pre>
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
class GraphQLStory {
	public readonly adapter = graphqlAdapter;
	public readonly features = features;
	public readonly columns = columns;
	public readonly initial = { pageSize: 5 };

	private readonly _grid = viewChild.required(HlmDataGrid);

	protected readonly _variables = computed(() => {
		try {
			return JSON.stringify(graphqlAdapter.buildQuery(this._grid().state()), null, 2);
		} catch {
			// The child grid only exists after view init; show a placeholder until then.
			return '{}';
		}
	});

	protected _filterChanged(event: Event) {
		this._grid()
			.table.getColumn('email')
			?.setFilterValue((event.target as HTMLInputElement).value);
	}
}

@Component({
	selector: 'data-grid-loading-story',
	imports: [HlmDataGrid],
	host: { class: 'block w-full' },
	template: `
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
class LoadingStory {
	public readonly adapter = loadingAdapter;
	public readonly features = features;
	public readonly columns = columns;
	public readonly initial = { pageSize: 5 };
}

@Component({
	selector: 'data-grid-empty-story',
	imports: [HlmDataGrid],
	host: { class: 'block w-full' },
	template: `
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
class EmptyStory {
	public readonly adapter = emptyAdapter;
	public readonly features = features;
	public readonly columns = columns;
	public readonly initial = { pageSize: 5 };
}

@Component({
	selector: 'data-grid-error-story',
	imports: [HlmDataGrid],
	host: { class: 'block w-full' },
	template: `
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
class ErrorStory {
	public readonly adapter = errorAdapter;
	public readonly features = features;
	public readonly columns = columns;
	public readonly initial = { pageSize: 5 };
}

@Component({
	selector: 'data-grid-slow-story',
	imports: [HlmDataGrid],
	host: { class: 'block w-full' },
	template: `
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
class Slow3GStory {
	public readonly adapter = slowAdapter;
	public readonly features = features;
	public readonly columns = columns;
	public readonly initial = { pageSize: 5 };
}

export type DataGridFilterableUser = {
	id: string;
	name: string;
	email: string;
	age: number;
	active: boolean;
	status: string;
	created: string;
};

const STATUSES = ['open', 'closed', 'pending'] as const;

const FILTERABLE_USERS: DataGridFilterableUser[] = Array.from({ length: 42 }, (_, index) => ({
	id: faker.string.uuid(),
	name: faker.person.fullName(),
	email: faker.internet.email(),
	age: faker.number.int({ min: 18, max: 80 }),
	active: index % 2 === 0,
	status: STATUSES[index % STATUSES.length],
	created: faker.date.past({ years: 2 }).toISOString().slice(0, 10),
}));

const filterableFeatures = tableFeatures({
	columnFilteringFeature,
	columnVisibilityFeature,
	globalFilteringFeature,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	// Same fallback registration as the basic stories: v9 picks `weakEquals` before rows arrive.
	filterFns: { includesString: filterFn_includesString, weakEquals: filterFn_weakEquals },
});

const filterableColumnHelper = createColumnHelper<typeof filterableFeatures, DataGridFilterableUser>();

const filterableColumns = [
	filterableColumnHelper.accessor('name', {
		id: 'name',
		header: 'Name',
		cell: (info) => info.getValue<string>(),
		meta: { filter: { type: 'string', label: 'Name' } } as BrnDataGridColumnMeta,
	}),
	filterableColumnHelper.accessor('email', {
		id: 'email',
		header: 'Email',
		cell: (info) => `<div class="lowercase">${info.getValue<string>()}</div>`,
		meta: { filter: { type: 'string', label: 'Email' } } as BrnDataGridColumnMeta,
	}),
	filterableColumnHelper.accessor('age', {
		id: 'age',
		header: 'Age',
		cell: (info) => String(info.getValue<number>()),
		meta: { filter: { type: 'number', label: 'Age' } } as BrnDataGridColumnMeta,
	}),
	filterableColumnHelper.accessor('created', {
		id: 'created',
		header: 'Created',
		cell: (info) => info.getValue<string>(),
		meta: { filter: { type: 'date', label: 'Created' } } as BrnDataGridColumnMeta,
	}),
	filterableColumnHelper.accessor('active', {
		id: 'active',
		header: 'Active',
		cell: (info) => String(info.getValue<boolean>()),
		meta: { filter: { type: 'boolean', label: 'Active' } } as BrnDataGridColumnMeta,
	}),
	filterableColumnHelper.accessor('status', {
		id: 'status',
		header: 'Status',
		cell: (info) => info.getValue<string>(),
		meta: {
			filter: {
				type: 'select',
				label: 'Status',
				options: [
					{ label: 'Open', value: 'open' },
					{ label: 'Closed', value: 'closed' },
					{ label: 'Pending', value: 'pending' },
				],
			},
		} as BrnDataGridColumnMeta,
	}),
];

/** Number-aware comparison so range/equals filters work for ages and ISO dates alike. */
const compareFilterable = (field: unknown, value: string): number => {
	const left = Number(field);
	const right = Number(value);
	if (field !== '' && value !== '' && !Number.isNaN(left) && !Number.isNaN(right)) return left - right;
	return String(field ?? '').localeCompare(String(value));
};

const matchFilterable = (row: DataGridFilterableUser, id: string, op: string, value: string): boolean => {
	const field = row[id as keyof DataGridFilterableUser];
	switch (op) {
		case 'contains':
			return String(field ?? '')
				.toLowerCase()
				.includes(value.toLowerCase());
		case 'equals':
			return String(field ?? '') === value;
		case 'startsWith':
			return String(field ?? '')
				.toLowerCase()
				.startsWith(value.toLowerCase());
		case 'endsWith':
			return String(field ?? '')
				.toLowerCase()
				.endsWith(value.toLowerCase());
		case 'gt':
			return compareFilterable(field, value) > 0;
		case 'gte':
			return compareFilterable(field, value) >= 0;
		case 'lt':
			return compareFilterable(field, value) < 0;
		case 'lte':
			return compareFilterable(field, value) <= 0;
		case 'in':
			return value.split(',').includes(String(field));
		case 'isEmpty':
			return field === undefined || field === null || field === '';
		case 'notEmpty':
			return !(field === undefined || field === null || field === '');
		case 'notContains':
			return !String(field ?? '')
				.toLowerCase()
				.includes(value.toLowerCase());
		case 'notEquals':
			return String(field ?? '') !== value;
		case 'isNull':
			return field === undefined || field === null;
		case 'notNull':
			return field !== undefined && field !== null;
		default:
			return true;
	}
};

const filterableAdapter = createRestAdapter<DataGridFilterableUser>({
	baseUrl: '/api/users',
	fetchFn: async (url, signal) => {
		signal.throwIfAborted();
		const params = new URLSearchParams(url.split('?')[1] ?? '');
		const page = Number(params.get('page') ?? '1') - 1;
		const pageSize = Number(params.get('pageSize') ?? '5');
		const term = (params.get('q') ?? '').trim().toLowerCase();
		const sortList = (params.get('sort') ?? '')
			.split(',')
			.filter(Boolean)
			.map((entry) => {
				const [id, dir] = entry.split(':');
				return { id, desc: dir === 'desc' };
			});
		const sorts =
			sortList.length > 0
				? sortList
				: params.get('sortBy')
					? [{ id: params.get('sortBy') ?? '', desc: params.get('sortDir') === 'desc' }]
					: [];
		// Plain filters (`filter[age][gte]=18`) are AND-ed. A two-condition group arrives as
		// `filter[name][0][contains]=a&filter[name][1][contains]=b&filter[name][logic]=or`.
		const groups = new Map<string, { logic: string; conditions: { op: string; value: string }[] }>();
		const plain: { id: string; op: string; value: string }[] = [];
		for (const [key, value] of params) {
			const match = key.match(/^filter\[(.+?)\](?:\[(\d)\])?(?:\[(.+?)\])?$/);
			if (!match || match[3] === 'case') continue;
			const [, id, index, op = 'contains'] = match;
			if (op === 'logic' || index !== undefined) {
				const group = groups.get(id) ?? { logic: 'and', conditions: [] };
				if (op === 'logic') group.logic = value;
				else group.conditions.push({ op, value });
				groups.set(id, group);
			} else {
				plain.push({ id, op, value });
			}
		}
		let rows = FILTERABLE_USERS.filter((row) => {
			if (term && ![row.name, row.email, row.status].some((v) => v.toLowerCase().includes(term))) return false;
			if (!plain.every(({ id, op, value }) => matchFilterable(row, id, op, value))) return false;
			for (const [id, { logic, conditions }] of groups) {
				const results = conditions.map(({ op, value }) => matchFilterable(row, id, op, value));
				if (logic === 'or' ? !results.some(Boolean) : !results.every(Boolean)) return false;
			}
			return true;
		});
		for (const sort of sorts.reverse()) {
			rows = [...rows].sort((a, b) => {
				const left = a[sort.id as keyof DataGridFilterableUser];
				const right = b[sort.id as keyof DataGridFilterableUser];
				const compared = compareFilterable(left, String(right ?? ''));
				return sort.desc ? -compared : compared;
			});
		}
		return { rows: rows.slice(page * pageSize, page * pageSize + pageSize), total: rows.length };
	},
});

@Component({
	selector: 'data-grid-filterable-story',
	imports: [HlmDataGrid],
	host: { class: 'block w-full' },
	template: `
		<p class="text-muted-foreground font-mono text-xs break-all">GET {{ _queryString() }}</p>
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
class FilterableStory {
	public readonly adapter = filterableAdapter;
	public readonly features = filterableFeatures;
	public readonly columns = filterableColumns;
	public readonly initial = { pageSize: 5 };

	private readonly _grid = viewChild.required(HlmDataGrid);

	protected readonly _queryString = computed(() => {
		try {
			return `/api/users?${new URLSearchParams(filterableAdapter.buildQuery(this._grid().state())).toString()}`;
		} catch {
			// The child grid only exists after view init; show a placeholder until then.
			return '/api/users?…';
		}
	});
}

@Component({
	selector: 'data-grid-sorted-story',
	imports: [HlmDataGrid],
	host: { class: 'block w-full' },
	template: `
		<p class="text-muted-foreground font-mono text-xs break-all">GET {{ _queryString() }}</p>
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
class SortedStory {
	public readonly adapter = filterableAdapter;
	public readonly features = filterableFeatures;
	public readonly columns = filterableColumns;
	public readonly initial = { pageSize: 5, sorting: [{ id: 'email', desc: false }] };

	private readonly _grid = viewChild.required(HlmDataGrid);

	protected readonly _queryString = computed(() => {
		try {
			return `/api/users?${new URLSearchParams(filterableAdapter.buildQuery(this._grid().state())).toString()}`;
		} catch {
			// The child grid only exists after view init; show a placeholder until then.
			return '/api/users?…';
		}
	});
}

const COMBINED_FILTERS: BrnFilter[] = [
	{ id: 'email', value: 'example', operator: 'contains', type: 'string' },
	{ id: 'age', value: [20, 60], operator: 'between', type: 'number' },
];

@Component({
	selector: 'data-grid-combined-story',
	imports: [HlmDataGrid],
	host: { class: 'block w-full' },
	template: `
		<p class="text-muted-foreground font-mono text-xs break-all">GET {{ _queryString() }}</p>
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
class CombinedStory {
	public readonly adapter = filterableAdapter;
	public readonly features = filterableFeatures;
	public readonly columns = filterableColumns;
	public readonly initial = {
		pageSize: 5,
		sorting: [{ id: 'age', desc: true }],
		filters: COMBINED_FILTERS,
		globalFilter: 'open',
	};

	private readonly _grid = viewChild.required(HlmDataGrid);

	protected readonly _queryString = computed(() => {
		try {
			return `/api/users?${new URLSearchParams(filterableAdapter.buildQuery(this._grid().state())).toString()}`;
		} catch {
			// The child grid only exists after view init; show a placeholder until then.
			return '/api/users?…';
		}
	});
}

/** Reads the query the grid would send; the child grid only exists after view init. */
const queryOf = (grid: () => { state: Signal<BrnGridState> }): string => {
	try {
		return `/api/users?${new URLSearchParams(filterableAdapter.buildQuery(grid().state())).toString()}`;
	} catch {
		return '/api/users?…';
	}
};

const ADVANCED_FILTERS: BrnFilterGroup[] = [
	{
		id: 'status',
		logic: 'or',
		type: 'select',
		filters: [
			{ id: 'status', operator: 'equals', value: 'open', type: 'select' },
			{ id: 'status', operator: 'equals', value: 'pending', type: 'select' },
		],
	},
];

@Component({
	selector: 'data-grid-advanced-filters-story',
	imports: [HlmDataGrid],
	host: { class: 'block w-full' },
	template: `
		<p class="text-muted-foreground font-mono text-xs break-all">GET {{ _queryString() }}</p>
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [initial]="initial" />
	`,
})
class AdvancedFiltersStory {
	public readonly adapter = filterableAdapter;
	public readonly features = filterableFeatures;
	public readonly columns = filterableColumns;
	/** Starts on a two-condition group, so the Status popover opens in Advanced mode. */
	public readonly initial = { pageSize: 5, filters: ADVANCED_FILTERS };

	private readonly _grid = viewChild.required(HlmDataGrid);
	protected readonly _queryString = computed(() => queryOf(this._grid));
}

@Component({
	selector: 'data-grid-localized-story',
	imports: [HlmDataGrid],
	host: { class: 'block w-full' },
	template: `
		<hlm-data-grid
			[adapter]="adapter"
			[features]="features"
			[columns]="columns"
			[initial]="{ pageSize: 5 }"
			[operatorLabels]="operatorLabels"
			searchLabel="Rechercher"
			searchPlaceholder="Rechercher…"
			clearAllText="Tout effacer"
			loadingText="Chargement…"
			emptyText="Aucun résultat."
			errorText="Échec du chargement."
			retryText="Réessayer"
			valueText="valeur"
			fromText="De"
			toText="À"
			allText="Tous"
			trueText="Oui"
			falseText="Non"
		/>
	`,
})
class LocalizedStory {
	public readonly adapter = filterableAdapter;
	public readonly features = filterableFeatures;
	public readonly columns = filterableColumns;
	public readonly operatorLabels = {
		contains: 'contient',
		equals: 'est',
		startsWith: 'commence par',
		endsWith: 'finit par',
		between: 'entre',
		in: 'est parmi',
		isEmpty: 'est vide',
		notEmpty: "n'est pas vide",
	};
}

@Component({
	selector: 'data-grid-programmatic-story',
	imports: [HlmDataGrid, HlmButtonImports],
	host: { class: 'block w-full' },
	template: `
		<div class="flex flex-wrap gap-2 pb-2">
			<button hlmBtn size="sm" variant="outline" data-testid="adults" (click)="_adults()">Age 30 and over</button>
			<button hlmBtn size="sm" variant="outline" data-testid="open" (click)="_openOnly()">Open only</button>
			<button hlmBtn size="sm" variant="outline" data-testid="oldest" (click)="_oldestFirst()">Oldest first</button>
			<button hlmBtn size="sm" variant="outline" data-testid="page-2" (click)="_pageTwo()">Page 2</button>
			<button hlmBtn size="sm" variant="ghost" data-testid="reset" (click)="_reset()">Reset</button>
		</div>
		<p class="text-muted-foreground font-mono text-xs break-all">GET {{ _queryString() }}</p>
		<hlm-data-grid
			[adapter]="adapter"
			[features]="features"
			[columns]="columns"
			[initial]="{ pageSize: 5 }"
			[showToolbar]="false"
		/>
	`,
})
class ProgrammaticStory {
	public readonly adapter = filterableAdapter;
	public readonly features = filterableFeatures;
	public readonly columns = filterableColumns;

	private readonly _grid = viewChild.required(HlmDataGrid);
	protected readonly _queryString = computed(() => queryOf(this._grid));

	protected _adults(): void {
		this._grid().table.getColumn('age')?.setFilterValue({ operator: 'gte', value: 30 });
	}

	protected _openOnly(): void {
		this._grid().table.getColumn('status')?.setFilterValue({ operator: 'equals', value: 'open' });
	}

	protected _oldestFirst(): void {
		this._grid().table.setSorting([{ id: 'age', desc: true }]);
	}

	protected _pageTwo(): void {
		this._grid().table.setPageIndex(1);
	}

	protected _reset(): void {
		const table = this._grid().table;
		table.resetColumnFilters(true);
		table.resetSorting(true);
		table.setPageIndex(0);
	}
}

@Component({
	selector: 'data-grid-composed-story',
	imports: [
		...BrnDataGridImports,
		...HlmTableImports,
		...HlmButtonImports,
		HlmDataGridColumnFilter,
		HlmDataGridPagination,
		FlexRender,
	],
	host: { class: 'block w-full' },
	template: `
		<div hlmTableContainer>
			<table
				hlmTable
				brnDataGrid
				#grid="brnDataGrid"
				[adapter]="adapter"
				[features]="features"
				[columns]="columns"
				[initial]="{ pageSize: 5 }"
			>
				<thead hlmTHead>
					@for (headerGroup of grid.table.getHeaderGroups(); track headerGroup.id) {
						<tr hlmTr>
							@for (header of headerGroup.headers; track header.id) {
								<th hlmTh [attr.aria-sort]="_ariaSort(header.column.getIsSorted())">
									<div class="flex items-center gap-1">
										<button
											hlmBtn
											variant="ghost"
											size="sm"
											data-testid="sort"
											(click)="header.column.toggleSorting(undefined, $event.shiftKey)"
										>
											<ng-container *flexRenderHeader="header; let text">{{ text }}</ng-container>
										</button>
										<hlm-data-grid-column-filter [column]="header.column" />
									</div>
								</th>
							}
						</tr>
					}
				</thead>
				<tbody hlmTBody>
					@for (row of grid.table.getRowModel().rows; track row.id) {
						<tr hlmTr>
							@for (cell of row.getVisibleCells(); track cell.id) {
								<td hlmTd>
									<ng-container *flexRenderCell="cell; let text">
										<span [innerHTML]="text"></span>
									</ng-container>
								</td>
							}
						</tr>
					}
				</tbody>
			</table>
		</div>
		<hlm-data-grid-pagination [table]="grid.table" [pageSizeOptions]="[5, 10]" />
	`,
})
class ComposedStory {
	public readonly adapter = filterableAdapter;
	public readonly features = filterableFeatures;
	public readonly columns = filterableColumns;

	protected _ariaSort(sorted: false | 'asc' | 'desc'): 'none' | 'ascending' | 'descending' {
		return sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none';
	}
}

const minimalFeatures = tableFeatures({ columnVisibilityFeature, rowPaginationFeature });
const minimalColumnHelper = createColumnHelper<typeof minimalFeatures, DataGridStoryUser>();
const minimalColumns = [
	minimalColumnHelper.accessor('name', { header: 'Name', cell: (info) => info.getValue<string>() }),
	minimalColumnHelper.accessor('email', { header: 'Email', cell: (info) => info.getValue<string>() }),
];
const minimalAdapter = createRestAdapter<DataGridStoryUser>({
	baseUrl: '/api/users',
	fetchFn: async (url, signal) => {
		signal.throwIfAborted();
		const params = new URLSearchParams(url.split('?')[1] ?? '');
		const page = Number(params.get('page') ?? '1') - 1;
		const pageSize = Number(params.get('pageSize') ?? '10');
		return { rows: REST_USERS.slice(page * pageSize, (page + 1) * pageSize), total: REST_USERS.length };
	},
});

@Component({
	selector: 'data-grid-minimal-story',
	imports: [HlmDataGrid],
	host: { class: 'block w-full' },
	template: `
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" />
	`,
})
class MinimalStory {
	/** Only the required features: no sort buttons, filter popovers or search render. */
	public readonly adapter = minimalAdapter;
	public readonly features = minimalFeatures;
	public readonly columns = minimalColumns;
}

const meta: Meta = {
	title: 'Data Grid',
	tags: ['autodocs'],
	decorators: [
		moduleMetadata({
			imports: [
				RestStory,
				ODataStory,
				GraphQLStory,
				LoadingStory,
				EmptyStory,
				ErrorStory,
				Slow3GStory,
				FilterableStory,
				SortedStory,
				CombinedStory,
				AdvancedFiltersStory,
				LocalizedStory,
				ProgrammaticStory,
				ComposedStory,
				MinimalStory,
			],
		}),
	],
};

export default meta;

export const Rest: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [RestStory] },
		template: '<data-grid-rest-story/>',
	}),
};

export const OData: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [ODataStory] },
		template: '<data-grid-odata-story/>',
	}),
};

export const GraphQL: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [GraphQLStory] },
		template: '<data-grid-graphql-story/>',
	}),
};

export const Loading: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [LoadingStory] },
		template: '<data-grid-loading-story/>',
	}),
};

export const Empty: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [EmptyStory] },
		template: '<data-grid-empty-story/>',
	}),
};

export const ErrorState: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [ErrorStory] },
		template: '<data-grid-error-story/>',
	}),
};

export const Slow3G: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [Slow3GStory] },
		template: '<data-grid-slow-story/>',
	}),
};

export const WithFilters: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [FilterableStory] },
		template: '<data-grid-filterable-story/>',
	}),
};

export const Sorted: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [SortedStory] },
		template: '<data-grid-sorted-story/>',
	}),
};

export const Combined: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [CombinedStory] },
		template: '<data-grid-combined-story/>',
	}),
};

export const AdvancedFilters: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [AdvancedFiltersStory] },
		template: '<data-grid-advanced-filters-story/>',
	}),
};

export const Localized: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [LocalizedStory] },
		template: '<data-grid-localized-story/>',
	}),
};

export const Programmatic: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [ProgrammaticStory] },
		template: '<data-grid-programmatic-story/>',
	}),
};

export const Composed: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [ComposedStory] },
		template: '<data-grid-composed-story/>',
	}),
};

export const Minimal: StoryObj = {
	render: () => ({
		moduleMetadata: { imports: [MinimalStory] },
		template: '<data-grid-minimal-story/>',
	}),
};
