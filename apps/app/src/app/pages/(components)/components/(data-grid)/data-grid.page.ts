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
import { DataGridGraphQLPreview } from './data-grid-graphql.preview';
import { DataGridODataPreview } from './data-grid-odata.preview';
import { DataGridServerPreview } from './data-grid-server.preview';
import { DataGridPreview, defaultImports, defaultSkeleton } from './data-grid.preview';

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
				The grid ships its sorting and filtering UI: every sortable header renders a sort button with
				<code class="${hlmCode}">aria-sort</code>
				(shift-click adds a multi-column sort), and the toolbar holds the global search, the active-filter chips, and
				the clear-all action. Per-column filter controls come from the column definition's
				<code class="${hlmCode}">meta.filter</code>
				(
				<code class="${hlmCode}">BrnDataGridColumnMeta</code>
				): declare the column
				<code class="${hlmCode}">type</code>
				(
				<code class="${hlmCode}">string | number | date | boolean | select</code>
				) and the grid renders the matching control: text operators, a single value or a from/to pair (with
				<code class="${hlmCode}">between</code>
				) for numbers and dates, a boolean choice, and a single option or a checkbox list (with
				<code class="${hlmCode}">in</code>
				) for selects. Each filter is resolved to its operator and its value coerced to the declared type (
				<code class="${hlmCode}">'30'</code>
				becomes
				<code class="${hlmCode}">30</code>
				) before the adapter maps it, and date-only bounds cover the whole day, so
				<code class="${hlmCode}">2024-01-31</code>
				as an upper bound also matches that day's timestamps. Rename the operators with
				<code class="${hlmCode}">operatorLabels</code>
				. Filtering needs
				<code class="${hlmCode}">columnFilteringFeature</code>
				in your features, the toolbar search needs
				<code class="${hlmCode}">globalFilteringFeature</code>
				. For fully custom controls, drive the exposed
				<code class="${hlmCode}">table</code>
				(
				<code class="${hlmCode}">column.setFilterValue({{ '{' }} operator, value {{ '}' }})</code>
				,
				<code class="${hlmCode}">column.toggleSorting</code>
				,
				<code class="${hlmCode}">table.setGlobalFilter</code>
				) instead.
			</p>

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
	protected readonly _imports = defaultImports;
	protected readonly _codeSkeleton = defaultSkeleton;
}
