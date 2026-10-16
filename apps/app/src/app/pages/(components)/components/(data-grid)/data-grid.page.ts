import type { RouteMeta } from '@analogjs/router';
import { Component, computed, inject } from '@angular/core';
import { injectComponentDocs } from '@spartan-ng/app/app/core/services/component-docs';
import { PrimitiveSnippetsService } from '@spartan-ng/app/app/core/services/primitive-snippets.service';
import { UIApiDocs } from '@spartan-ng/app/app/shared/layout/ui-docs-section/ui-docs-section';
import { hlmCode, hlmP } from '@spartan-ng/helm/typography';
import { Code } from '../../../../shared/code/code';
import { CodePreview } from '../../../../shared/code/code-preview';
import { MainSection } from '../../../../shared/layout/main-section';
import { PageBottomNav } from '../../../../shared/layout/page-bottom-nav/page-bottom-nav';
import { PageBottomNavLink } from '../../../../shared/layout/page-bottom-nav/page-bottom-nav-link';
import { PageNav } from '../../../../shared/layout/page-nav/page-nav';
import { SectionIntro } from '../../../../shared/layout/section-intro';
import { SectionSubHeading } from '../../../../shared/layout/section-sub-heading';
import { Tabs } from '../../../../shared/layout/tabs';
import { TabsCli } from '../../../../shared/layout/tabs-cli';
import { metaWith } from '../../../../shared/meta/meta.util';
import { DataGridComposedPreview } from './data-grid--composed.preview';
import { DataGridFiltersPreview } from './data-grid--filters.preview';
import { DataGridProgrammaticPreview } from './data-grid--programmatic.preview';
import { DataGridGraphQLPreview } from './data-grid-graphql.preview';
import { DataGridODataPreview } from './data-grid-odata.preview';
import { DataGridServerPreview } from './data-grid-server.preview';
import { DataGridPreview, defaultImports, defaultSkeleton } from './data-grid.preview';

const columnMetaCode = `
import type { BrnDataGridColumnMeta } from '@spartan-ng/brain/data-grid';

const features = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  columnMeta: {} as BrnDataGridColumnMeta, // types meta.filter on every column
});

const columnHelper = createColumnHelper<typeof features, Employee>();

const columns = [
  // string: contains, equals, startsWith, endsWith, isEmpty, notEmpty, notContains, notEquals, isNull, notNull
  columnHelper.accessor('name', { header: 'Name', meta: { filter: { type: 'string', label: 'Name' } } }),
  // number / date: equals, gt, gte, lt, lte, between, notEquals, isNull, notNull
  columnHelper.accessor('age', { header: 'Age', meta: { filter: { type: 'number' } } }),
  columnHelper.accessor('joined', { header: 'Joined', meta: { filter: { type: 'date' } } }),
  // boolean: equals, notEquals, isNull, notNull
  columnHelper.accessor('active', { header: 'Active', meta: { filter: { type: 'boolean' } } }),
  // select: in, equals, isEmpty, notEmpty, notEquals, isNull, notNull
  columnHelper.accessor('role', {
    header: 'Role',
    meta: {
      filter: {
        type: 'select',
        options: [
          { label: 'Engineer', value: 'engineer' },
          { label: 'Designer', value: 'designer' },
        ],
        operators: ['in', 'equals'], // optional: restrict the operators offered
      },
    },
  }),
];
`;

export const routeMeta: RouteMeta = {
	data: { breadcrumb: 'Data Grid', api: 'data-grid' },
	meta: metaWith(
		'spartan/ui - Data Grid',
		'Server-driven datagrid with REST, OData, and GraphQL adapters built on TanStack Table.',
	),
	title: 'spartan/ui - Data Grid',
};

@Component({
	selector: 'spartan-data-grid',
	imports: [
		MainSection,
		Code,
		SectionIntro,
		SectionSubHeading,
		Tabs,
		TabsCli,
		DataGridPreview,
		DataGridServerPreview,
		DataGridODataPreview,
		DataGridGraphQLPreview,
		DataGridFiltersPreview,
		DataGridProgrammaticPreview,
		DataGridComposedPreview,
		CodePreview,
		PageNav,
		PageBottomNav,
		PageBottomNavLink,
		UIApiDocs,
	],
	template: `
		<section spartanMainSection>
			<spartan-section-intro
				name="Data Grid"
				lead="Server-driven datagrid with REST, OData, and GraphQL adapters built on TanStack Table."
			/>

			<spartan-tabs firstTab="Preview" secondTab="Code">
				<div spartanCodePreview firstTab>
					<spartan-data-grid-preview />
				</div>
				<spartan-code secondTab [code]="_defaultCode()" />
			</spartan-tabs>

			<spartan-section-sub-heading id="installation">Installation</spartan-section-sub-heading>
			<spartan-cli-tabs
				class="mt-4"
				nxCode="npx nx g @spartan-ng/cli:ui data-grid"
				ngCode="ng g @spartan-ng/cli:ui data-grid"
			/>
			<p class="${hlmP}">
				The generator copies the
				<code class="${hlmCode}">hlm-data-grid</code>
				component into your project and installs
				<code class="${hlmCode}">&#64;spartan-ng/brain/data-grid</code>
				and
				<code class="${hlmCode}">&#64;tanstack/angular-table</code>
				alongside it. The component already composes the headless grid, so all it needs from you is an adapter and your
				column definitions.
			</p>

			<spartan-section-sub-heading id="usage">Usage</spartan-section-sub-heading>
			<div class="space-y-4">
				<spartan-code [code]="_imports" />
				<spartan-code [code]="_codeSkeleton" />
			</div>

			<spartan-section-sub-heading id="sorting-filtering">Sorting & filtering</spartan-section-sub-heading>
			<p class="${hlmP}">
				Every sortable header renders a sort button with
				<code class="${hlmCode}">aria-sort</code>
				(shift-click adds a multi-column sort), and every filterable header gets a filter button that opens a popover.
				The popover edits a draft and only writes to the grid on
				<em>Apply</em>
				, so typing never refetches;
				<em>Advanced</em>
				combines two conditions with
				<em>And</em>
				/
				<em>Or</em>
				, and a dot on the button marks an active filter. The toolbar holds the global search, one chip per active
				filter, and the clear-all action. Sorting needs
				<code class="${hlmCode}">rowSortingFeature</code>
				, filtering
				<code class="${hlmCode}">columnFilteringFeature</code>
				and the search
				<code class="${hlmCode}">globalFilteringFeature</code>
				.
			</p>
			<spartan-tabs firstTab="Preview" secondTab="Code">
				<div spartanCodePreview firstTab>
					<spartan-data-grid-filters-preview />
				</div>
				<spartan-code secondTab [code]="_filtersCode()" />
			</spartan-tabs>

			<spartan-section-sub-heading id="column-filters">Column filters</spartan-section-sub-heading>
			<p class="${hlmP}">
				A column is filterable when its definition declares
				<code class="${hlmCode}">meta.filter</code>
				(
				<code class="${hlmCode}">BrnDataGridColumnMeta</code>
				). Its
				<code class="${hlmCode}">type</code>
				picks the operators and the control: text operators for
				<code class="${hlmCode}">string</code>
				, a single value or a from/to pair (with
				<code class="${hlmCode}">between</code>
				) for
				<code class="${hlmCode}">number</code>
				and
				<code class="${hlmCode}">date</code>
				, a choice for
				<code class="${hlmCode}">boolean</code>
				, and a single option or a checkbox list (with
				<code class="${hlmCode}">in</code>
				) for
				<code class="${hlmCode}">select</code>
				. Each filter is resolved to its operator and its value coerced to the declared type (
				<code class="${hlmCode}">'30'</code>
				becomes
				<code class="${hlmCode}">30</code>
				) before the adapter maps it, and date-only bounds cover the whole day. Register
				<code class="${hlmCode}">columnMeta</code>
				once on the features to type
				<code class="${hlmCode}">meta</code>
				without a cast, and rename the operators with
				<code class="${hlmCode}">operatorLabels</code>
				.
			</p>
			<spartan-code [code]="_columnMetaCode" />

			<spartan-section-sub-heading id="programmatic">Driving the grid from code</spartan-section-sub-heading>
			<p class="${hlmP}">
				Query the grid with
				<code class="${hlmCode}">viewChild(HlmDataGrid)</code>
				and drive its TanStack
				<code class="${hlmCode}">table</code>
				: write a filter with
				<code class="${hlmCode}">column.setFilterValue({{ '{' }} operator, value {{ '}' }})</code>
				, sort with
				<code class="${hlmCode}">table.setSorting</code>
				, or page with
				<code class="${hlmCode}">table.setPageIndex</code>
				. Read the resolved page, sort and filters from
				<code class="${hlmCode}">state()</code>
				, and refetch with
				<code class="${hlmCode}">reload()</code>
				.
			</p>
			<spartan-tabs firstTab="Preview" secondTab="Code">
				<div spartanCodePreview firstTab>
					<spartan-data-grid-programmatic-preview />
				</div>
				<spartan-code secondTab [code]="_programmaticCode()" />
			</spartan-tabs>

			<spartan-section-sub-heading id="server-pagination">Server pagination (REST)</spartan-section-sub-heading>
			<p class="${hlmP}">
				Point
				<code class="${hlmCode}">createRestAdapter</code>
				at your endpoint and pass it to
				<code class="${hlmCode}">hlm-data-grid</code>
				. The composed
				<code class="${hlmCode}">BrnDataGrid</code>
				maps page, page size, sorting, and filters to query params (
				<code class="${hlmCode}">page</code>
				,
				<code class="${hlmCode}">pageSize</code>
				,
				<code class="${hlmCode}">sortBy/sortDir</code>
				,
				<code class="${hlmCode}">filter[id]</code>
				,
				<code class="${hlmCode}">q</code>
				). Override the mapping with
				<code class="${hlmCode}">mapSort/mapFilter</code>
				, or bring your own transport with
				<code class="${hlmCode}">fetchFn</code>
				. Fetches run through Angular
				<code class="${hlmCode}">resource</code>
				(including SSR); filter keystrokes are debounced by
				<code class="${hlmCode}">debounceMs</code>
				(default 300ms): typing never reaches the backend until it pauses, while page and sort apply immediately. The
				pager offers
				<code class="${hlmCode}">pageSizeOptions</code>
				(default 10, 20, 50, 100), a page indicator computed from the adapter's
				<code class="${hlmCode}">total</code>
				, and first/previous/next/last buttons. The grid needs
				<code class="${hlmCode}">columnVisibilityFeature</code>
				and
				<code class="${hlmCode}">rowPaginationFeature</code>
				; sorting, filtering, search and
				<code class="${hlmCode}">rowSelectionFeature</code>
				(selected-row count) are opt-in. A multi-column sort adds a
				<code class="${hlmCode}">sort</code>
				list (
				<code class="${hlmCode}">name:asc,email:desc</code>
				) alongside
				<code class="${hlmCode}">sortBy/sortDir</code>
				, which only describe one column.
			</p>
			<spartan-tabs firstTab="Preview" secondTab="Code">
				<div spartanCodePreview firstTab>
					<spartan-data-grid-server-preview />
				</div>
				<spartan-code secondTab [code]="_serverCode()" />
			</spartan-tabs>

			<spartan-section-sub-heading id="odata">OData</spartan-section-sub-heading>
			<p class="${hlmP}">
				<code class="${hlmCode}">createODataAdapter</code>
				translates the same grid state to
				<code class="${hlmCode}">$top/$skip</code>
				pagination with
				<code class="${hlmCode}">$orderby</code>
				,
				<code class="${hlmCode}">$filter</code>
				, and
				<code class="${hlmCode}">$count=true</code>
				, reading rows from
				<code class="${hlmCode}">value</code>
				and the total from
				<code class="${hlmCode}">&#64;odata.count</code>
				. Filter values escape
				<code class="${hlmCode}">'</code>
				as
				<code class="${hlmCode}">''</code>
				so names like O'Brien keep returning rows instead of a 400. The global filter searches only the fields you name
				in
				<code class="${hlmCode}">globalFilterFields</code>
				and is ignored without them, rather than guessed at a field your entity may not have.
			</p>
			<spartan-tabs firstTab="Preview" secondTab="Code">
				<div spartanCodePreview firstTab>
					<spartan-data-grid-odata-preview />
				</div>
				<spartan-code secondTab [code]="_odataCode()" />
			</spartan-tabs>

			<spartan-section-sub-heading id="graphql">GraphQL</spartan-section-sub-heading>
			<p class="${hlmP}">
				<code class="${hlmCode}">createGraphQLAdapter</code>
				builds query variables (
				<code class="${hlmCode}">offset/limit</code>
				,
				<code class="${hlmCode}">orderBy</code>
				,
				<code class="${hlmCode}">where</code>
				,
				<code class="${hlmCode}">search</code>
				— or
				<code class="${hlmCode}">first/after</code>
				with
				<code class="${hlmCode}">mode: 'cursor'</code>
				, where you resolve the opaque per-page token through
				<code class="${hlmCode}">getCursor</code>
				) and hands them to your
				<code class="${hlmCode}">fetchFn</code>
				, so any client or codegen'd query works without a normalized cache.
			</p>
			<spartan-tabs firstTab="Preview" secondTab="Code">
				<div spartanCodePreview firstTab>
					<spartan-data-grid-graphql-preview />
				</div>
				<spartan-code secondTab [code]="_graphqlCode()" />
			</spartan-tabs>

			<spartan-section-sub-heading id="composition">Composition</spartan-section-sub-heading>
			<p class="${hlmP}">
				<code class="${hlmCode}">hlm-data-grid</code>
				is built from parts you can use on their own. Put
				<code class="${hlmCode}">brnDataGrid</code>
				on a spartan
				<code class="${hlmCode}">hlmTable</code>
				to own the state and fetching, render the rows from its
				<code class="${hlmCode}">table</code>
				, and drop in
				<code class="${hlmCode}">hlm-data-grid-column-filter</code>
				and
				<code class="${hlmCode}">hlm-data-grid-pagination</code>
				where you need them. The headless
				<code class="${hlmCode}">brnColumnFilter</code>
				powers the filter popover if you want to build your own control.
			</p>
			<spartan-tabs firstTab="Preview" secondTab="Code">
				<div spartanCodePreview firstTab>
					<spartan-data-grid-composed-preview />
				</div>
				<spartan-code secondTab [code]="_composedCode()" />
			</spartan-tabs>

			<spartan-section-sub-heading id="brn-api">Brain API</spartan-section-sub-heading>
			<spartan-ui-api-docs docType="brain" />

			<spartan-section-sub-heading id="hlm-api">Helm API</spartan-section-sub-heading>
			<spartan-ui-api-docs docType="helm" />

			<spartan-page-bottom-nav>
				<spartan-page-bottom-nav-link direction="previous" href="context-menu" label="Context Menu" />
				<spartan-page-bottom-nav-link href="data-table" label="Data Table" />
			</spartan-page-bottom-nav>
		</section>
		<spartan-page-nav />
	`,
})
export default class DataGridPage {
	constructor() {
		injectComponentDocs();
	}

	private readonly _snippets = inject(PrimitiveSnippetsService).getSnippets('data-grid');
	protected readonly _defaultCode = computed(() => this._snippets()['default']);
	protected readonly _serverCode = computed(() => this._snippets()['server']);
	protected readonly _odataCode = computed(() => this._snippets()['odata']);
	protected readonly _graphqlCode = computed(() => this._snippets()['graphql']);
	protected readonly _filtersCode = computed(() => this._snippets()['filters']);
	protected readonly _programmaticCode = computed(() => this._snippets()['programmatic']);
	protected readonly _composedCode = computed(() => this._snippets()['composed']);
	protected readonly _columnMetaCode = columnMetaCode;
	protected readonly _imports = defaultImports;
	protected readonly _codeSkeleton = defaultSkeleton;
}
