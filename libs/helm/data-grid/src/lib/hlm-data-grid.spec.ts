import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
	BrnDataGrid,
	createRestAdapter,
	type BrnDataGridColumnMeta,
	type BrnFilterableColumn,
} from '@spartan-ng/brain/data-grid';
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HlmDataGrid } from './hlm-data-grid';
import { HlmDataGridColumnFilter } from './hlm-data-grid-column-filter';

type GridUser = { name: string; email: string };

const features = tableFeatures({
	columnFilteringFeature,
	columnVisibilityFeature,
	rowPaginationFeature,
	rowSelectionFeature,
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

/** The backend each test drives. */
let fetchImpl: () => Promise<{ rows: GridUser[]; total: number }>;
let fetchCount = 0;
let lastUrl = '';

const adapter = createRestAdapter<GridUser>({
	baseUrl: '/api/users',
	fetchFn: async (url, signal) => {
		signal.throwIfAborted();
		fetchCount++;
		lastUrl = url;
		return fetchImpl();
	},
});

@Component({
	selector: 'hlm-data-grid-host',
	imports: [HlmDataGrid],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<hlm-data-grid
			[adapter]="adapter"
			[features]="features"
			[columns]="columns"
			[emptyText]="emptyText()"
			(retry)="onRetry()"
		/>
	`,
})
class Host {
	public readonly adapter = adapter;
	public readonly features = features;
	public readonly columns = columns;
	public readonly emptyText = signal('No results.');
	public retries = 0;

	public onRetry(): void {
		this.retries++;
	}
}

/**
 * Settles the component.
 *
 * `settle: false` is for the pending-fetch case, where Angular's task queue never drains.
 * A rejected fetch also rejects `whenStable()`, and the error state is exactly what those tests
 * assert, so the rejection is swallowed.
 */
async function setup(
	opts: { settle?: boolean } = {},
): Promise<{ fixture: ComponentFixture<Host>; host: Host; el: HTMLElement }> {
	TestBed.configureTestingModule({ imports: [Host] });
	const fixture = TestBed.createComponent(Host);
	const host = fixture.componentInstance;
	if (opts.settle === false) {
		fixture.detectChanges();
	} else {
		await fixture.whenStable().catch(() => undefined);
	}
	fixture.detectChanges();
	return { fixture, host, el: fixture.nativeElement as HTMLElement };
}

/** Settles after an action that is expected to fail (e.g. retry against a broken backend). */
async function settle(fixture: ComponentFixture<Host>): Promise<void> {
	await fixture.whenStable().catch(() => undefined);
	fixture.detectChanges();
}

/** The placeholder cell a loading/empty/error row renders. */
const placeholderCell = (el: HTMLElement) => el.querySelector('tbody td[colspan]') as HTMLTableCellElement | null;

describe('hlm-data-grid states', () => {
	beforeEach(() => {
		fetchCount = 0;
		fetchImpl = async () => ({ rows: USERS, total: 42 });
	});
	afterEach(() => {
		TestBed.resetTestingModule();
	});

	it('renders the rows and total it fetched', async () => {
		const { el } = await setup();

		expect(el.textContent).toContain('Ada');
		expect(el.textContent).toContain('grace@example.com');
		expect(el.textContent).toContain('42 row(s)');
		expect(el.querySelector('[role="alert"]')).toBeNull();
		expect(el.querySelector('hlm-skeleton')).toBeNull();
		expect(el.querySelector('table')?.getAttribute('aria-busy')).toBe('false');
	});

	it('announces busy state with a skeleton while the fetch is pending', async () => {
		fetchImpl = () => new Promise(() => undefined);
		const { el } = await setup({ settle: false });

		expect(el.querySelector('table')?.getAttribute('aria-busy')).toBe('true');
		expect(el.querySelector('hlm-skeleton')).not.toBeNull();
		expect(el.querySelector('[data-slot="data-grid-status"]')?.textContent).toContain('Loading');
		// Data cells are not projected while loading, only the skeleton placeholder.
		expect(el.querySelectorAll('tbody td:not([colspan])').length).toBe(0);
	});

	it('shows the empty message with a colspan derived from the columns', async () => {
		fetchImpl = async () => ({ rows: [], total: 0 });
		const { el } = await setup();

		expect(el.textContent).toContain('No results.');
		expect(el.querySelector('[role="alert"]')).toBeNull();
		expect(el.querySelector('table')?.getAttribute('aria-busy')).toBe('false');
		// Two columns -> colspan 2, where the old implementation hardcoded 99.
		expect(placeholderCell(el)?.getAttribute('colspan')).toBe('2');
	});

	it('shows the error alert with a retry button when the fetch fails', async () => {
		fetchImpl = async () => {
			throw new Error('boom');
		};
		const { el } = await setup();

		const alert = el.querySelector('[role="alert"]');
		expect(alert).not.toBeNull();
		expect(alert?.textContent).toContain('Failed to load.');
		expect(el.textContent).not.toContain('No results.');
		expect(el.querySelectorAll('tbody td:not([colspan])').length).toBe(0);
	});

	it('keeps the rows visible under the alert banner when a refetch fails', async () => {
		const { fixture, el } = await setup();
		expect(el.textContent).toContain('Ada');

		fetchImpl = async () => {
			throw new Error('boom');
		};
		fixture.debugElement.query(By.directive(BrnDataGrid)).injector.get(BrnDataGrid).reload();
		await settle(fixture);

		expect(el.querySelector('[role="alert"]')).not.toBeNull();
		// The previous page is still on screen instead of being replaced by the alert alone.
		expect(el.textContent).toContain('Ada');
	});

	it('retries through the grid and emits the retry output', async () => {
		fetchImpl = async () => {
			throw new Error('boom');
		};
		const { fixture, host, el } = await setup();
		const before = fetchCount;

		(el.querySelector('[role="alert"] button') as HTMLButtonElement).click();
		await settle(fixture);

		expect(fetchCount).toBeGreaterThan(before);
		expect(host.retries).toBe(1);
	});

	it('accepts overrides for the state texts', async () => {
		fetchImpl = async () => ({ rows: [], total: 0 });
		const { fixture, host, el } = await setup();

		host.emptyText.set('Rien à afficher.');
		await settle(fixture);

		expect(el.textContent).toContain('Rien à afficher.');
	});
});

describe('hlm-data-grid composition', () => {
	beforeEach(() => {
		fetchCount = 0;
		fetchImpl = async () => ({ rows: USERS, total: 42 });
	});
	afterEach(() => {
		TestBed.resetTestingModule();
	});

	it('pages through the brain grid it composes', async () => {
		const { fixture, el } = await setup();
		const nextButton = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Next');
		expect(nextButton).toBeTruthy();
		expect((nextButton as HTMLButtonElement).disabled).toBe(false);

		(nextButton as HTMLButtonElement).click();
		await settle(fixture);

		// Paging is the composed grid's job: the second page goes to the backend.
		expect(lastUrl).toContain('page=2');
	});

	it('renders headers through the column definitions', async () => {
		const { el } = await setup();

		expect(el.querySelector('thead')?.textContent).toContain('Name');
		expect(el.querySelector('thead')?.textContent).toContain('Email');
	});
});

type FilterGridUser = { name: string; email: string; age: number; active: boolean; status: string };

const filterFeatures = tableFeatures({
	columnFilteringFeature,
	columnVisibilityFeature,
	globalFilteringFeature,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	filterFns: { includesString: filterFn_includesString, weakEquals: filterFn_weakEquals },
});

const filterColumnHelper = createColumnHelper<typeof filterFeatures, FilterGridUser>();
const filterColumns = [
	filterColumnHelper.accessor('name', {
		id: 'name',
		header: 'Name',
		cell: (info) => info.getValue<string>(),
		meta: { filter: { type: 'string', label: 'Name' } } as BrnDataGridColumnMeta,
	}),
	filterColumnHelper.accessor('email', {
		id: 'email',
		header: 'Email',
		cell: (info) => info.getValue<string>(),
		meta: { filter: { type: 'string', label: 'Email' } } as BrnDataGridColumnMeta,
	}),
	filterColumnHelper.accessor('age', {
		id: 'age',
		header: 'Age',
		cell: (info) => String(info.getValue<number>()),
		meta: { filter: { type: 'number', label: 'Age' } } as BrnDataGridColumnMeta,
	}),
	filterColumnHelper.accessor('active', {
		id: 'active',
		header: 'Active',
		cell: (info) => String(info.getValue<boolean>()),
		meta: { filter: { type: 'boolean', label: 'Active' } } as BrnDataGridColumnMeta,
	}),
	filterColumnHelper.accessor('status', {
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
				],
			},
		} as BrnDataGridColumnMeta,
	}),
];

const FILTER_USERS: FilterGridUser[] = [
	{ name: 'Ada', email: 'ada@example.com', age: 36, active: true, status: 'open' },
	{ name: 'Grace', email: 'grace@example.com', age: 85, active: false, status: 'closed' },
];

let filterFetchImpl: () => Promise<{ rows: FilterGridUser[]; total: number }>;
let filterLastUrl = '';

const filterAdapter = createRestAdapter<FilterGridUser>({
	baseUrl: '/api/users',
	fetchFn: async (url, signal) => {
		signal.throwIfAborted();
		filterLastUrl = url;
		return filterFetchImpl();
	},
});

@Component({
	selector: 'hlm-data-grid-filter-host',
	imports: [HlmDataGrid],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [debounceMs]="0" />
	`,
})
class FilterHost {
	public readonly adapter = filterAdapter;
	public readonly features = filterFeatures;
	public readonly columns = filterColumns;
}

async function setupFilter(): Promise<{ fixture: ComponentFixture<FilterHost>; el: HTMLElement }> {
	TestBed.configureTestingModule({ imports: [FilterHost] });
	const fixture = TestBed.createComponent(FilterHost);
	await fixture.whenStable().catch(() => undefined);
	fixture.detectChanges();
	return { fixture, el: fixture.nativeElement as HTMLElement };
}

async function settleFilter(fixture: ComponentFixture<FilterHost>): Promise<void> {
	await fixture.whenStable().catch(() => undefined);
	fixture.detectChanges();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('hlm-data-grid sorting', () => {
	beforeEach(() => {
		filterLastUrl = '';
		filterFetchImpl = async () => ({ rows: FILTER_USERS, total: 2 });
	});
	afterEach(() => {
		TestBed.resetTestingModule();
	});

	it('renders a sort button per header with aria-sort none initially', async () => {
		const { el } = await setupFilter();

		const nameTh = Array.from(el.querySelectorAll('thead th')).find((th) =>
			th.textContent?.includes('Name'),
		) as HTMLTableCellElement;
		expect(nameTh).toBeTruthy();
		expect(nameTh.getAttribute('aria-sort')).toBe('none');
		expect(nameTh.querySelector('[data-slot="data-grid-sort"]')).not.toBeNull();
	});

	it('toggles ascending then descending through the sort button', async () => {
		const { fixture, el } = await setupFilter();

		const nameTh = Array.from(el.querySelectorAll('thead th')).find((th) =>
			th.textContent?.includes('Name'),
		) as HTMLTableCellElement;
		(nameTh.querySelector('[data-slot="data-grid-sort"]') as HTMLButtonElement).click();
		await settleFilter(fixture);

		expect(nameTh.getAttribute('aria-sort')).toBe('ascending');
		expect(filterLastUrl).toContain('sortBy=name');
		expect(filterLastUrl).toContain('sortDir=asc');

		(nameTh.querySelector('[data-slot="data-grid-sort"]') as HTMLButtonElement).click();
		await settleFilter(fixture);

		expect(nameTh.getAttribute('aria-sort')).toBe('descending');
		expect(filterLastUrl).toContain('sortDir=desc');
	});

	it('shift-clicks a second header for multi-sort and shows the sort order', async () => {
		const { fixture, el } = await setupFilter();

		const ths = Array.from(el.querySelectorAll('thead th')) as HTMLTableCellElement[];
		const nameBtn = ths
			.find((th) => th.textContent?.includes('Name'))
			?.querySelector('[data-slot="data-grid-sort"]') as HTMLButtonElement;
		const emailBtn = ths
			.find((th) => th.textContent?.includes('Email'))
			?.querySelector('[data-slot="data-grid-sort"]') as HTMLButtonElement;

		nameBtn.click();
		await settleFilter(fixture);
		emailBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
		await settleFilter(fixture);

		expect(filterLastUrl).toContain('sort=name%3Aasc%2Cemail%3Aasc');
		expect(el.querySelector('[data-slot="data-grid-sort-index"]')?.textContent).toMatch(/1|2/);
	});

	it('keeps the loaded rows on screen while a refetch is pending', async () => {
		const { fixture, el } = await setupFilter();
		expect(el.textContent).toContain('Ada');

		filterFetchImpl = () => new Promise(() => undefined);
		const nameTh = Array.from(el.querySelectorAll('thead th')).find((th) =>
			th.textContent?.includes('Name'),
		) as HTMLTableCellElement;
		(nameTh.querySelector('[data-slot="data-grid-sort"]') as HTMLButtonElement).click();
		fixture.detectChanges();

		expect(el.querySelector('table')?.getAttribute('aria-busy')).toBe('true');
		expect(el.textContent).toContain('Ada');
		expect(el.querySelector('hlm-skeleton')).toBeNull();
	});
});

describe('HlmDataGrid header', () => {
	beforeEach(() => {
		filterLastUrl = '';
		filterFetchImpl = async () => ({ rows: FILTER_USERS, total: 2 });
	});
	afterEach(() => {
		TestBed.resetTestingModule();
	});

	it('shows one filter button per filterable column', async () => {
		const { el } = await setupFilter();

		// One popover trigger per filterable column: all five columns declare meta.filter.
		expect(el.querySelectorAll('[data-slot="data-grid-filter-trigger"]').length).toBe(5);

		// The tall inline filter block is gone: no filter root renders inline controls in the
		// header, and the operator select only exists inside the popover overlay while open.
		expect(el.querySelectorAll('div[data-slot="data-grid-filter"]').length).toBe(0);
		expect(el.querySelector('[data-slot="data-grid-filter"] select')).toBeNull();
	});

	it('renders no filter button for columns without filter metadata', async () => {
		const { el } = await setup();

		expect(el.querySelectorAll('[data-slot="data-grid-filter-trigger"]').length).toBe(0);
		expect(el.querySelectorAll('div[data-slot="data-grid-filter"]').length).toBe(0);
	});
});

describe('hlm-data-grid column filters', () => {
	beforeEach(() => {
		filterLastUrl = '';
		filterFetchImpl = async () => ({ rows: FILTER_USERS, total: 2 });
	});
	afterEach(() => {
		TestBed.resetTestingModule();
	});

	it('renders a type-aware filter control per filterable column', async () => {
		const { el } = await setupFilter();

		expect(el.querySelector('[data-slot="data-grid-filter"][data-column="email"]')).not.toBeNull();
		expect(el.querySelector('[data-slot="data-grid-filter"][data-column="age"]')).not.toBeNull();
		expect(el.querySelector('[data-slot="data-grid-filter"][data-column="active"]')).not.toBeNull();
		expect(el.querySelector('[data-slot="data-grid-filter"][data-column="status"]')).not.toBeNull();
		expect(el.querySelector('[data-slot="data-grid-filter"][data-column="email"] select')).not.toBeNull();
	});

	it('writes a text contains filter into the debounced query', async () => {
		const { fixture, el } = await setupFilter();

		const emailFilter = el.querySelector('[data-slot="data-grid-filter"][data-column="email"]') as HTMLElement;
		const input = emailFilter.querySelector('input') as HTMLInputElement;
		input.value = 'ada';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		fixture.detectChanges();
		await sleep(50);
		await settleFilter(fixture);

		expect(filterLastUrl).toContain('filter%5Bemail%5D=ada');
	});

	it('switches the text operator and qualifies the query param', async () => {
		const { fixture, el } = await setupFilter();

		const emailFilter = el.querySelector('[data-slot="data-grid-filter"][data-column="email"]') as HTMLElement;
		(emailFilter.querySelector('[data-slot="data-grid-operator"] select') as HTMLSelectElement).value = 'startsWith';
		(emailFilter.querySelector('[data-slot="data-grid-operator"] select') as HTMLSelectElement).dispatchEvent(
			new Event('change', { bubbles: true }),
		);
		const input = emailFilter.querySelector('input') as HTMLInputElement;
		input.value = 'ad';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		fixture.detectChanges();
		await sleep(50);
		await settleFilter(fixture);

		expect(filterLastUrl).toContain('filter%5Bemail%5D%5BstartsWith%5D=ad');
	});

	it('maps a number range to gte/lte bounds and keeps open ends', async () => {
		const { fixture, el } = await setupFilter();

		const ageFilter = el.querySelector('[data-slot="data-grid-filter"][data-column="age"]') as HTMLElement;
		const inputs = Array.from(ageFilter.querySelectorAll('input')) as HTMLInputElement[];
		expect(inputs.length).toBe(2);
		inputs[0].value = '18';
		inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
		inputs[1].value = '65';
		inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
		fixture.detectChanges();
		await sleep(50);
		await settleFilter(fixture);

		expect(filterLastUrl).toContain('filter%5Bage%5D%5Bgte%5D=18');
		expect(filterLastUrl).toContain('filter%5Bage%5D%5Blte%5D=65');
	});

	it('filters booleans and select options without guessing operators', async () => {
		const { fixture, el } = await setupFilter();

		const activeFilter = el.querySelector('[data-slot="data-grid-filter"][data-column="active"]') as HTMLElement;
		const activeSelect = activeFilter.querySelector('[data-slot="data-grid-value"] select') as HTMLSelectElement;
		activeSelect.value = 'true';
		activeSelect.dispatchEvent(new Event('change', { bubbles: true }));
		fixture.detectChanges();
		await sleep(50);
		await settleFilter(fixture);
		expect(filterLastUrl).toContain('filter%5Bactive%5D%5Bequals%5D=true');

		const statusFilter = el.querySelector('[data-slot="data-grid-filter"][data-column="status"]') as HTMLElement;
		const statusSelect = statusFilter.querySelector('[data-slot="data-grid-value"] select') as HTMLSelectElement;
		statusSelect.value = 'open';
		statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
		fixture.detectChanges();
		await sleep(50);
		await settleFilter(fixture);
		expect(filterLastUrl).toContain('filter%5Bstatus%5D');
	});

	it('drops a cleared text filter from the query', async () => {
		const { fixture, el } = await setupFilter();

		const emailFilter = el.querySelector('[data-slot="data-grid-filter"][data-column="email"]') as HTMLElement;
		const input = emailFilter.querySelector('input') as HTMLInputElement;
		input.value = 'ada';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		fixture.detectChanges();
		await sleep(50);
		await settleFilter(fixture);
		expect(filterLastUrl).toContain('filter%5Bemail%5D');

		input.value = '';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		fixture.detectChanges();
		await sleep(50);
		await settleFilter(fixture);
		expect(filterLastUrl).not.toContain('filter%5Bemail%5D');
	});
});

describe('hlm-data-grid toolbar', () => {
	beforeEach(() => {
		filterLastUrl = '';
		filterFetchImpl = async () => ({ rows: FILTER_USERS, total: 2 });
	});
	afterEach(() => {
		TestBed.resetTestingModule();
	});

	it('searches globally through the toolbar', async () => {
		const { fixture, el } = await setupFilter();

		const search = el.querySelector('[data-slot="data-grid-search"] input') as HTMLInputElement;
		expect(search).not.toBeNull();
		search.value = 'grace';
		search.dispatchEvent(new Event('input', { bubbles: true }));
		fixture.detectChanges();
		await sleep(50);
		await settleFilter(fixture);

		expect(filterLastUrl).toContain('q=grace');
	});

	it('shows active-filter chips and removes one filter at a time', async () => {
		const { fixture, el } = await setupFilter();

		const emailFilter = el.querySelector('[data-slot="data-grid-filter"][data-column="email"]') as HTMLElement;
		const input = emailFilter.querySelector('input') as HTMLInputElement;
		input.value = 'ada';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		fixture.detectChanges();
		await sleep(50);
		await settleFilter(fixture);

		const chip = el.querySelector('[data-slot="data-grid-chip"]') as HTMLElement;
		expect(chip?.textContent).toContain('Email');
		(chip.querySelector('button') as HTMLButtonElement).click();
		await settleFilter(fixture);
		await sleep(50);
		await settleFilter(fixture);

		expect(filterLastUrl).not.toContain('filter%5Bemail%5D');
	});

	it('clears every filter and the search with one action', async () => {
		const { fixture, el } = await setupFilter();

		const emailFilter = el.querySelector('[data-slot="data-grid-filter"][data-column="email"]') as HTMLElement;
		(emailFilter.querySelector('input') as HTMLInputElement).value = 'ada';
		(emailFilter.querySelector('input') as HTMLInputElement).dispatchEvent(new Event('input', { bubbles: true }));
		const search = el.querySelector('[data-slot="data-grid-search"] input') as HTMLInputElement;
		search.value = 'ada';
		search.dispatchEvent(new Event('input', { bubbles: true }));
		fixture.detectChanges();
		await sleep(50);
		await settleFilter(fixture);
		expect(el.querySelector('[data-slot="data-grid-clear"]')).not.toBeNull();

		(el.querySelector('[data-slot="data-grid-clear"]') as HTMLButtonElement).click();
		await settleFilter(fixture);
		await sleep(50);
		await settleFilter(fixture);

		expect(filterLastUrl).not.toContain('filter%5Bemail%5D');
		expect(filterLastUrl).not.toContain('q=ada');
	});

	it('gives each grid search input a unique id for its label', async () => {
		const first = await setupFilter();
		const firstInput = first.el.querySelector('[data-slot="data-grid-search"] input') as HTMLInputElement;
		TestBed.resetTestingModule();
		const second = await setupFilter();
		const secondInput = second.el.querySelector('[data-slot="data-grid-search"] input') as HTMLInputElement;
		TestBed.resetTestingModule();

		expect(firstInput.id).not.toBe('');
		expect(secondInput.id).not.toBe('');
		expect(firstInput.id).not.toBe(secondInput.id);
		expect(first.el.querySelector('[data-slot="data-grid-toolbar"] label')?.getAttribute('for')).toBe(firstInput.id);
	});
});

describe('hlm-data-grid pagination', () => {
	beforeEach(() => {
		fetchCount = 0;
		lastUrl = '';
		fetchImpl = async () => ({ rows: USERS, total: 42 });
	});
	afterEach(() => {
		TestBed.resetTestingModule();
	});

	it('shows the current page out of the page count derived from the total', async () => {
		const { el } = await setup();

		// 42 rows at the default page size of 10.
		expect(el.querySelector('[data-slot="data-grid-page"]')?.textContent).toContain('Page 1 of 5');
	});

	it('changes the page size from the picker and goes back to the first page', async () => {
		const { fixture, el } = await setup();
		(el.querySelector('[data-slot="data-grid-next"]') as HTMLButtonElement).click();
		await settle(fixture);
		expect(lastUrl).toContain('page=2');

		const picker = el.querySelector('[data-slot="data-grid-page-size"] select') as HTMLSelectElement;
		picker.value = '20';
		picker.dispatchEvent(new Event('change', { bubbles: true }));
		await settle(fixture);

		expect(lastUrl).toContain('pageSize=20');
		expect(lastUrl).toContain('page=1');
		expect(el.querySelector('[data-slot="data-grid-page"]')?.textContent).toContain('Page 1 of 3');
	});

	it('jumps to the last and first page', async () => {
		const { fixture, el } = await setup();
		(el.querySelector('[data-slot="data-grid-last"]') as HTMLButtonElement).click();
		await settle(fixture);
		expect(lastUrl).toContain('page=5');

		(el.querySelector('[data-slot="data-grid-first"]') as HTMLButtonElement).click();
		await settle(fixture);
		expect(lastUrl).toContain('page=1');
	});
});

const minimalFeatures = tableFeatures({
	columnVisibilityFeature,
	rowPaginationFeature,
});
const minimalColumnHelper = createColumnHelper<typeof minimalFeatures, GridUser>();
const minimalColumns = [
	minimalColumnHelper.accessor('name', { id: 'name', header: 'Name', cell: (info) => info.getValue<string>() }),
];

@Component({
	selector: 'hlm-data-grid-minimal-host',
	imports: [HlmDataGrid],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<hlm-data-grid [adapter]="adapter" [features]="features" [columns]="columns" [showToolbar]="false" />
	`,
})
class MinimalHost {
	public readonly adapter = adapter;
	public readonly features = minimalFeatures;
	public readonly columns = minimalColumns;
}

describe('hlm-data-grid without optional features', () => {
	afterEach(() => {
		TestBed.resetTestingModule();
	});

	it('renders and pages without rowSelectionFeature', async () => {
		fetchImpl = async () => ({ rows: USERS, total: 42 });
		TestBed.configureTestingModule({ imports: [MinimalHost] });
		const fixture = TestBed.createComponent(MinimalHost);
		await fixture.whenStable();
		fixture.detectChanges();
		const el = fixture.nativeElement as HTMLElement;

		expect(el.textContent).toContain('Ada');
		expect(el.querySelector('[data-slot="data-grid-selection"]')?.textContent?.trim()).toBe('');
		expect(el.querySelector('[data-slot="data-grid-page"]')?.textContent).toContain('Page 1 of 5');
	});

	it('shows the rows even when the backend reports no total', async () => {
		fetchImpl = async () => ({ rows: USERS, total: 0 });
		TestBed.configureTestingModule({ imports: [MinimalHost] });
		const fixture = TestBed.createComponent(MinimalHost);
		await fixture.whenStable();
		fixture.detectChanges();
		const el = fixture.nativeElement as HTMLElement;

		expect(el.textContent).toContain('Ada');
		expect(el.textContent).not.toContain('No results.');
	});
});

describe('hlm-data-grid advanced filters', () => {
	beforeEach(() => {
		filterLastUrl = '';
		filterFetchImpl = async () => ({ rows: FILTER_USERS, total: 2 });
	});
	afterEach(() => {
		TestBed.resetTestingModule();
	});

	const pickOperator = (filter: HTMLElement, operator: string) => {
		const select = filter.querySelector('[data-slot="data-grid-operator"] select') as HTMLSelectElement;
		select.value = operator;
		select.dispatchEvent(new Event('change', { bubbles: true }));
	};

	it('shows one value input for a single-value comparison and keeps the typed value', async () => {
		const { fixture, el } = await setupFilter();
		const ageFilter = el.querySelector('[data-slot="data-grid-filter"][data-column="age"]') as HTMLElement;
		const from = ageFilter.querySelector('[data-slot="data-grid-value-from"]') as HTMLInputElement;
		from.value = '30';
		from.dispatchEvent(new Event('input', { bubbles: true }));
		fixture.detectChanges();

		pickOperator(ageFilter, 'gte');
		fixture.detectChanges();
		await sleep(50);
		await settleFilter(fixture);

		const inputs = ageFilter.querySelectorAll('input');
		expect(inputs.length).toBe(1);
		expect((inputs[0] as HTMLInputElement).value).toBe('30');
		expect(filterLastUrl).toContain('filter%5Bage%5D%5Bgte%5D=30');
	});

	it('picks several options of a select column with the set operator', async () => {
		const { fixture, el } = await setupFilter();
		const statusFilter = el.querySelector('[data-slot="data-grid-filter"][data-column="status"]') as HTMLElement;
		pickOperator(statusFilter, 'in');
		fixture.detectChanges();

		const boxes = () =>
			Array.from(
				statusFilter.querySelectorAll('[data-slot="data-grid-value-set"] button[role="checkbox"]'),
			) as HTMLElement[];
		expect(boxes().length).toBe(2);
		boxes()[0].click();
		fixture.detectChanges();
		boxes()[1].click();
		fixture.detectChanges();
		await sleep(50);
		await settleFilter(fixture);

		expect(decodeURIComponent(filterLastUrl)).toContain('filter[status][in]=open,closed');
		const chip = el.querySelector('[data-slot="data-grid-chip"]') as HTMLElement;
		expect(chip.textContent).toContain('Open, Closed');
	});

	it('labels operators for people rather than with their ids', async () => {
		const { el } = await setupFilter();
		const ageFilter = el.querySelector('[data-slot="data-grid-filter"][data-column="age"]') as HTMLElement;
		const labels = Array.from(ageFilter.querySelectorAll('[data-slot="data-grid-operator"] option')).map((option) =>
			option.textContent?.trim(),
		);
		expect(labels).toContain('between');
		expect(labels).toContain('≥');
		expect(labels).not.toContain('gte');
	});

	it('gives each grid its own filter control ids', async () => {
		const first = await setupFilter();
		const firstId = (
			first.el.querySelector('[data-slot="data-grid-filter"] [data-slot="data-grid-value"]') as HTMLElement
		).id;
		TestBed.resetTestingModule();
		const second = await setupFilter();
		const secondId = (
			second.el.querySelector('[data-slot="data-grid-filter"] [data-slot="data-grid-value"]') as HTMLElement
		).id;
		TestBed.resetTestingModule();

		expect(firstId).not.toBe('');
		expect(firstId).not.toBe(secondId);
	});
});

@Component({
	selector: 'hlm-data-grid-column-filter-host',
	imports: [HlmDataGridColumnFilter],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<hlm-data-grid-column-filter [column]="column" />
	`,
})
class ColumnFilterHost {
	public readonly setFilterValue = vi.fn();
	public readonly column: BrnFilterableColumn = {
		id: 'name',
		columnDef: { meta: { filter: { type: 'string', label: 'Name' } } },
		getFilterValue: () => undefined,
		setFilterValue: (value: unknown) => this.setFilterValue(value),
	};
}

describe('HlmDataGridColumnFilter', () => {
	afterEach(() => {
		document.querySelectorAll('.cdk-overlay-container').forEach((el) => el.remove());
		TestBed.resetTestingModule();
	});

	it('opens a popover and applies once', async () => {
		TestBed.configureTestingModule({ imports: [ColumnFilterHost] });
		const fixture = TestBed.createComponent(ColumnFilterHost);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		const el = fixture.nativeElement as HTMLElement;

		(el.querySelector('[data-slot="data-grid-filter-trigger"]') as HTMLButtonElement).click();
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();

		const panel = document.querySelector('.cdk-overlay-container [data-slot="data-grid-filter-panel"]') as HTMLElement;
		expect(panel).not.toBeNull();

		const operator = panel.querySelector('[data-slot="data-grid-operator"] select') as HTMLSelectElement;
		operator.value = 'contains';
		operator.dispatchEvent(new Event('change', { bubbles: true }));
		const value = panel.querySelector('[data-slot="data-grid-value"]') as HTMLInputElement;
		value.value = 'ada';
		value.dispatchEvent(new Event('input', { bubbles: true }));
		fixture.detectChanges();

		(panel.querySelector('[data-slot="data-grid-filter-apply"]') as HTMLButtonElement).click();
		fixture.detectChanges();

		const host = fixture.componentInstance;
		expect(host.setFilterValue).toHaveBeenCalledTimes(1);
		expect(host.setFilterValue).toHaveBeenCalledWith({ operator: 'contains', value: 'ada' });
	});
});
