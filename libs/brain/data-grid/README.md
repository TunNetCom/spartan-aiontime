# @spartan-ng/brain/data-grid

Headless, server-driven data grid (Brain). It owns the page, sort and filter state, turns it into a
backend query through an adapter (REST, OData or GraphQL), fetches the page with Angular `resource`
(stale requests are aborted, filter typing is debounced) and exposes a
[TanStack Table](https://tanstack.com/table) instance to render from. It ships no styles: use the
styled `@spartan-ng/helm/data-grid`, or render your own markup from the parts below.

```ts
import { BrnDataGridImports } from '@spartan-ng/brain/data-grid';
```

## Parts

| Directive / function     | Role                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brnDataGrid`            | Root directive (`exportAs: 'brnDataGrid'`). Inputs: `adapter`, `features`, `columns`, `initial`, `debounceMs`. Exposes `table`, `rows`, `total`, `loading`, `error`, `state`, `reload()`, `flushFilters()`; mirrors `aria-busy` on its host |
| `brnColumnFilter`        | Headless filter control for one column (`exportAs: 'brnColumnFilter'`). Edits a local draft of up to two conditions joined by `and`/`or` and writes to the grid only on `apply()` / `clear()`                                               |
| `injectBrnDataGrid()`    | The function behind `brnDataGrid`, for building a grid inside your own component or service (call it in an injection context)                                                                                                               |
| `createRestAdapter()`    | Maps the state to query params: `page`, `pageSize`, `sortBy`/`sortDir` (+ `sort` list for multi-sort), `filter[id][operator]`, `q`                                                                                                          |
| `createODataAdapter()`   | Maps the state to `$top`, `$skip`, `$orderby`, `$filter`, `$count=true`                                                                                                                                                                     |
| `createGraphQLAdapter()` | Maps the state to variables: `offset`/`limit` (or `first`/`after` in cursor mode), `orderBy`, `where`, `search`                                                                                                                             |

## TanStack features

Pass a registry built with `tableFeatures(...)` as `features`:

| Feature                   | Needed for                                           |
| ------------------------- | ---------------------------------------------------- |
| `columnVisibilityFeature` | Always (rows render through `row.getVisibleCells()`) |
| `rowPaginationFeature`    | Always (server pagination)                           |
| `rowSortingFeature`       | Sorting                                              |
| `columnFilteringFeature`  | Column filters                                       |
| `globalFilteringFeature`  | Global search                                        |
| `rowSelectionFeature`     | Optional, row selection                              |

## Columns and filters

Filter controls are driven by the column definition's `meta.filter` (`BrnDataGridColumnMeta`).
Columns without it are not filterable. Register the type once on the features to type `meta`
without a cast: `tableFeatures({ ..., columnMeta: {} as BrnDataGridColumnMeta })`.

```ts
import type { BrnDataGridColumnMeta } from '@spartan-ng/brain/data-grid';

columnHelper.accessor('age', {
	header: 'Age',
	meta: { filter: { type: 'number', label: 'Age' } } as BrnDataGridColumnMeta,
});
```

| `meta.filter` key | Meaning                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `type`            | `string` \| `number` \| `date` \| `boolean` \| `select` — picks the operators, the control and how values are quoted |
| `options`         | `{ label, value }[]` offered by a `select` column                                                                    |
| `operators`       | Restricts the operators offered (defaults to `BRN_FILTER_OPERATORS[type]`)                                           |
| `label`           | Name shown in the filter UI and the active-filter chips                                                              |

Operators per type (`BRN_FILTER_OPERATORS`):

| Type             | Operators                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `string`         | `contains`, `equals`, `startsWith`, `endsWith`, `isEmpty`, `notEmpty`, `notContains`, `notEquals`, `isNull`, `notNull` |
| `number`, `date` | `equals`, `gt`, `gte`, `lt`, `lte`, `between`, `notEquals`, `isNull`, `notNull`                                        |
| `boolean`        | `equals`, `notEquals`, `isNull`, `notNull`                                                                             |
| `select`         | `in`, `equals`, `isEmpty`, `notEmpty`, `notEquals`, `isNull`, `notNull`                                                |

`isEmpty`/`notEmpty` match blank values, `isNull`/`notNull` match missing ones. A column filter can
also combine two conditions with `and`/`or` (the helm popover's Advanced mode); the adapters receive
it as a `BrnFilterGroup`.

Before a filter reaches the adapter it is resolved to an operator and its value is coerced to the
declared type (`'30'` becomes `30`; unreadable values are dropped). Date-only bounds
(`YYYY-MM-DD`) cover the whole day, so `lte 2024-01-31` is sent as `lt 2024-02-01`.

## Adapters

Each adapter implements `BrnDataAdapter<TData, TQuery>`: `buildQuery(state)` and
`fetch(query, signal)` resolving `{ rows, total }`. Pass `fetchFn` to use your own transport
(an `HttpClient` call, auth headers, a mock).

```ts
// REST: GET /api/users?page=1&pageSize=10&sortBy=name&sortDir=asc&filter[age][gte]=18&q=ada
const rest = createRestAdapter<User>({ baseUrl: '/api/users' });

// OData: GET /odata/Users?$top=10&$skip=0&$orderby=name asc&$filter=age ge 18&$count=true
const odata = createODataAdapter<User>({ baseUrl: '/odata/Users', globalFilterFields: ['name', 'email'] });

// GraphQL: you run the request, the adapter builds the variables
const graphql = createGraphQLAdapter<User>({
	endpoint: '/graphql',
	query: USERS_QUERY,
	fetchFn: async (variables, signal) => {
		const { data } = await client.query(USERS_QUERY, variables, { signal });
		return { rows: data.users.items, total: data.users.totalCount };
	},
});
```

Override the default mapping with `mapSort` / `mapFilter`, or reuse it in your own adapter through
`toRestFilterParams`, `toODataFilterExpression`, `toGraphQLFilterValue` and `buildODataQueryString`.

## Rendering your own grid

```html
<table brnDataGrid #grid="brnDataGrid" [adapter]="adapter" [features]="features" [columns]="columns">
	<thead>
		@for (headerGroup of grid.table.getHeaderGroups(); track headerGroup.id) {
		<tr>
			@for (header of headerGroup.headers; track header.id) {
			<th (click)="header.column.toggleSorting()">
				<ng-container *flexRenderHeader="header; let text">{{ text }}</ng-container>
			</th>
			}
		</tr>
		}
	</thead>
	<tbody>
		@for (row of grid.table.getRowModel().rows; track row.id) {
		<tr>
			@for (cell of row.getVisibleCells(); track cell.id) {
			<td><ng-container *flexRenderCell="cell; let text">{{ text }}</ng-container></td>
			}
		</tr>
		}
	</tbody>
</table>
<button [disabled]="!grid.table.getCanNextPage()" (click)="grid.table.nextPage()">Next</button>
```

Drive the grid through the TanStack table (`column.setFilterValue({ operator, value })`,
`column.toggleSorting()`, `table.setGlobalFilter()`, `table.setPageIndex()`), and read the resolved
state from `grid.state()`. Page and sort changes fetch immediately; filter changes wait for
`debounceMs` (default `300`) unless `flushFilters()` is called.
