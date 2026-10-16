# @spartan-ng/helm/data-grid

Styled, server-driven data grid for spartan/ui. It composes `@spartan-ng/brain/data-grid` with the
spartan table, button, input, popover and checkbox primitives: sortable headers, a filter popover per
column, global search, active-filter chips, server pagination, and loading, empty and error states.

## Installation

```sh
npx nx g @spartan-ng/cli:ui data-grid
# or
ng g @spartan-ng/cli:ui data-grid
```

## Parts

| Component                     | Role                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `hlm-data-grid`               | The full grid. Composes `brnDataGrid` and renders the toolbar, headers, column filters, rows, states and pager                  |
| `hlm-data-grid-column-filter` | Filter popover for one column (`[column]="header.column"`). Hosts `brnColumnFilter`: Simple/Advanced modes, And/Or, Apply/Clear |
| `hlm-data-grid-pagination`    | Pager for a TanStack table (`[table]`): page size, "Page x of y", first/previous/next/last                                      |

```ts
import { HlmDataGridImports } from '@spartan-ng/helm/data-grid';
```

## Usage

```ts
import { createRestAdapter, type BrnDataGridColumnMeta } from '@spartan-ng/brain/data-grid';
import {
	columnFilteringFeature,
	columnVisibilityFeature,
	createColumnHelper,
	globalFilteringFeature,
	rowPaginationFeature,
	rowSortingFeature,
	tableFeatures,
} from '@tanstack/angular-table';

type User = { id: string; name: string; email: string; age: number };

const features = tableFeatures({
	columnVisibilityFeature,
	rowPaginationFeature,
	rowSortingFeature,
	columnFilteringFeature,
	globalFilteringFeature,
	columnMeta: {} as BrnDataGridColumnMeta,
});

const columnHelper = createColumnHelper<typeof features, User>();
const columns = [
	columnHelper.accessor('name', { header: 'Name', meta: { filter: { type: 'string' } } }),
	columnHelper.accessor('email', { header: 'Email', meta: { filter: { type: 'string' } } }),
	columnHelper.accessor('age', { header: 'Age', meta: { filter: { type: 'number' } } }),
];

const adapter = createRestAdapter<User>({ baseUrl: '/api/users' });
```

```html
<hlm-data-grid
	[adapter]="adapter"
	[features]="features"
	[columns]="columns"
	[initial]="{ pageSize: 20, sorting: [{ id: 'name', desc: false }] }"
/>
```

Swap `createRestAdapter` for `createODataAdapter` or `createGraphQLAdapter` to talk to another
backend; the grid itself does not change. See `@spartan-ng/brain/data-grid` for the adapters, the
column `meta.filter` options and the operators.

## Inputs

| Input                                                                                                    | Default             | Description                                                                  |
| -------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| `adapter`                                                                                                | required            | `BrnDataAdapter` that builds the query and fetches a page                    |
| `features`                                                                                               | required            | TanStack features built with `tableFeatures(...)`                            |
| `columns`                                                                                                | required            | Column definitions built with `createColumnHelper(...)`                      |
| `initial`                                                                                                | `{}`                | Initial `page`, `pageSize`, `sorting`, `filters`, `globalFilter` (read once) |
| `debounceMs`                                                                                             | `300`               | Delay before filter and search changes fetch (read once)                     |
| `pageSizeOptions`                                                                                        | `[10, 20, 50, 100]` | Page sizes offered by the pager; `[]` hides the picker                       |
| `showToolbar`                                                                                            | `true`              | Shows the search, the active-filter chips and Clear all                      |
| `showColumnFilters`                                                                                      | `true`              | Shows the filter popover trigger in filterable headers                       |
| `operatorLabels`                                                                                         | `{}`                | Display names of the operators, merged over `HLM_DATA_GRID_OPERATOR_LABELS`  |
| `searchLabel`, `searchPlaceholder`, `clearAllText`, `loadingText`, `emptyText`, `errorText`, `retryText` | English             | State and toolbar texts                                                      |
| `operatorText`, `valueText`, `fromText`, `toText`, `allText`, `trueText`, `falseText`                    | English             | Filter popover texts                                                         |

Output: `retry` fires after the user clicks Retry in the error state.

## Driving the grid from code

```ts
private readonly _grid = viewChild.required(HlmDataGrid);

filterAdults() {
	this._grid().table.getColumn('age')?.setFilterValue({ operator: 'gte', value: 18 });
}
```

`table` is the TanStack table, `state()` the resolved page/sort/filter state, and `reload()`
refetches the current page.

## Localization

Every text is an input. The filter popover takes `HlmDataGridFilterLabels` (`filter`, `operator`,
`value`, `from`, `to`, `clear`, `apply`, `simple`, `advanced`, `and`, `or`, `caseSensitive`, `mode`,
`logic`, `all`, `true`, `false`, `operatorLabels`) when used on its own.
