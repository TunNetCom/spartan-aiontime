# Data-Grid Column Filter Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace always-visible column filter blocks with a funnel-button popover (simple + advanced And/Or) reusing the brain draft baseline.

**Architecture:** Composite filter value per column (`single | {logic, conditions, caseSensitive}`); brain owns all transitions and coercion; adapters join two conditions; helm `HlmDataGridColumnFilter` (hostDirectives + hlm-popover) edits a local draft and writes once on Apply.

**Tech Stack:** Angular 20 signals, TanStack Table v9 (`columnFilteringFeature`), Spartan brain/helm primitives, vitest + Playwright Chromium, Storybook + Cypress.

**Spec:** `docs/superpowers/specs/2026-10-13-datagrid-column-filter-popover-design.md`

## Global Constraints

- Stay inside existing `brain/data-grid` and `helm/data-grid` entrypoints; no `tsconfig.base.json` / `ng-package.json` change.
- Brain imports nothing from helm; `brn-column-filter-draft.ts` has no Angular.
- Keep `HlmDataGrid` public inputs compatible (`operatorLabels`, `fromText`, `showColumnFilters`, …).
- Keep `data-slot` names (`data-grid-operator`, `data-grid-value`, `data-grid-value-from`, `data-grid-value-to`, `data-grid-value-set`, `data-grid-chip`, `data-grid-clear`).
- Commitlint `type(data-grid)`; scope `data-grid`; subject/body blank line; no line over 100 chars; no AI trailer.
- Before push: `pnpm run lint`, `pnpm nx format:write`, `pnpm run test`, `pnpm run build`.
- Styling via `classes()` / `hlm()`; popover via `hlm-popover` + `*hlmPopoverPortal` (date-picker pattern); native select/date inputs inside popover.

## Review Focus

- Empty advanced second condition renders and sends as single — user expects no `and <empty>` in query.
- Unreadable typed value (`abc` in number column) disables Apply and sends nothing.
- Date-only upper bound (`2024-01-31`) covers the whole day (`lt` next day) in every adapter.
- Case-insensitive text is the default; checking sensitive narrows results in all three adapters.
- Clearing then reopening shows an empty draft immediately (no stale TanStack snapshot).

---

### Task 1: Brain operator + group types and coercion

**Files:**

- Modify: `libs/brain/data-grid/src/lib/brn-data-source.ts`
- Test: `libs/brain/data-grid/src/lib/brn-data-source.spec.ts`

**Interfaces:**

- Consumes: existing `BrnFilterOperator`, `BRN_FILTER_OPERATORS`, `toBrnFilter`, `toBrnComparisons`.
- Produces: `BrnFilterCondition`, `BrnCompositeSpec`, `BrnFilterGroup`, `toBrnFilterGroup(id, raw, type)`, extended `toBrnComparisons` (`notEquals` → `ne`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { toBrnFilterGroup } from './brn-data-source';

describe('toBrnFilterGroup', () => {
	it('joins two conditions with or', () => {
		const group = toBrnFilterGroup(
			'name',
			{
				logic: 'or',
				conditions: [
					{ operator: 'contains', value: 'a' },
					{ operator: 'contains', value: 'b' },
				],
			},
			'string',
		);
		expect(group).toMatchObject({ id: 'name', logic: 'or' });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test brain --run libs/brain/data-grid/src/lib/brn-data-source.spec.ts`
Expected: FAIL with `toBrnFilterGroup is not defined`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type BrnFilterCondition = { operator?: BrnFilterOperator; value?: unknown };
export type BrnCompositeSpec = {
	logic: 'and' | 'or';
	conditions: [BrnFilterCondition, BrnFilterCondition?];
	caseSensitive?: boolean;
};
export type BrnFilterGroup = {
	id: string;
	logic: 'and' | 'or';
	filters: [BrnFilter, BrnFilter?];
	type?: BrnFilterType;
	caseSensitive?: boolean;
};

export function toBrnFilterGroup(
	id: string,
	raw: unknown,
	type?: BrnFilterType,
): BrnFilter | BrnFilterGroup | undefined {
	if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && 'conditions' in raw) {
		const spec = raw as BrnCompositeSpec;
		const [c1, c2] = spec.conditions;
		const f1 = toBrnFilter(id, c1, type);
		const f2 = c2 ? toBrnFilter(id, c2, type) : undefined;
		if (!f1 && !f2) return undefined;
		if (f1 && !f2) return f1;
		const filters = [f1, f2].filter((f): f is BrnFilter => !!f);
		return {
			id,
			logic: spec.logic ?? 'and',
			filters: filters as [BrnFilter, BrnFilter?],
			...(type ? { type } : {}),
			...(spec.caseSensitive ? { caseSensitive: true } : {}),
		};
	}
	return toBrnFilter(id, raw, type);
}
```

Also extend `BrnFilterOperator` with `'notContains' | 'notEquals' | 'isNull' | 'notNull'`, extend `BRN_FILTER_OPERATORS.string` with the four, add `notEquals`/`isNull`/`notNull` to `number`/`date`/`select`/`boolean` lists, and add a `notEquals` branch in `toBrnComparisons` returning `bound('ne' as never, filter.value)` — implement as `{ operator: 'ne', value }` by widening `BrnComparison` operator union with `'ne' | 'eq'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test brain --run libs/brain/data-grid/src/lib/brn-data-source.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/brain/data-grid/src/lib/brn-data-source.ts libs/brain/data-grid/src/lib/brn-data-source.spec.ts
git commit -m "feat(data-grid): add composite filter group types" -m "And/Or with case flag, negated operators."
```

### Task 2: Adapter mappings for negations, null, case, groups

**Files:**

- Modify: `libs/brain/data-grid/src/lib/adapters/rest-adapter.ts`
- Modify: `libs/brain/data-grid/src/lib/adapters/odata-adapter.ts`
- Modify: `libs/brain/data-grid/src/lib/adapters/graphql-adapter.ts`
- Test: `libs/brain/data-grid/src/lib/adapters/rest-adapter.spec.ts`
- Test: `libs/brain/data-grid/src/lib/adapters/odata-adapter.spec.ts`
- Test: `libs/brain/data-grid/src/lib/adapters/graphql-adapter.spec.ts`

**Interfaces:**

- Consumes: Task 1 `BrnFilter`, `BrnFilterGroup`, `toBrnComparisons`.
- Produces: `toRestFilterParams`, `toODataFilterExpression`, `toGraphQLFilterValue` handling new ops + `toRestFilterGroupParams` / group join.

- [ ] **Step 1: Write the failing tests (one per adapter)**

```ts
import { describe, expect, it } from 'vitest';
import { toRestFilterParams } from './rest-adapter';

describe('rest negations', () => {
	it('maps notContains', () => {
		expect(toRestFilterParams({ id: 'name', operator: 'notContains', value: 'x', type: 'string' })).toEqual({
			'filter[name][notContains]': 'x',
		});
	});
});
```

```ts
import { describe, expect, it } from 'vitest';
import { toODataFilterExpression } from './odata-adapter';

describe('odata negations', () => {
	it('maps notEquals', () => {
		expect(toODataFilterExpression({ id: 'name', operator: 'notEquals', value: 'x', type: 'string' })).toBe(
			`name ne 'x'`,
		);
	});
});
```

```ts
import { describe, expect, it } from 'vitest';
import { toGraphQLFilterValue } from './graphql-adapter';

describe('graphql negations', () => {
	it('maps notContains', () => {
		expect(toGraphQLFilterValue({ id: 'name', operator: 'notContains', value: 'x', type: 'string' })).toEqual({
			notContains: 'x',
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test brain --run libs/brain/data-grid/src/lib/adapters/rest-adapter.spec.ts`
Expected: FAIL with empty object `{}`.

- [ ] **Step 3: Write minimal implementation**

REST (`toRestFilterParams`): before the comparisons loop add:

```ts
case 'notContains':
case 'notEquals':
	return isBlank(filter.value) ? {} : { [`${key}[${filter.operator}]`]: text(filter.value) };
case 'isNull':
case 'notNull':
	return { [`${key}[${filter.operator}]`]: 'true' };
```

Group helper:

```ts
import type { BrnFilterGroup } from '../brn-data-source';
export function toRestFilterGroupParams(group: BrnFilterGroup): Record<string, string> {
	const params: Record<string, string> = { [`filter[${group.id}][logic]`]: group.logic };
	group.filters.forEach((f, i) => {
		for (const [k, v] of Object.entries(toRestFilterParams(f))) {
			params[k.replace(`filter[${f.id}]`, `filter[${f.id}][${i}]`)] = v;
		}
	});
	if (group.caseSensitive) params[`filter[${group.id}][case]`] = 'sensitive';
	return params;
}
```

OData (`toODataFilterExpression`): accept `BrnFilter | BrnFilterGroup`; for groups join `(${parts.join(` ${group.logic} `)})`; singles add:

```ts
case 'notContains':
	return `not contains(${field},${odataLiteral(filter.value, filter.type)})`;
case 'notEquals':
	return `${field} ne ${odataLiteral(filter.value, filter.type)}`;
```

`isNull` → `` `${field} eq null` ``, `notNull` → `` `${field} ne null` ``. Wrap text ops with `tolower()` on both sides unless `(filter as BrnFilter & {caseSensitive?: boolean}).caseSensitive` or group caseSensitive is true.

GraphQL (`toGraphQLFilterValue`): add `notContains`, `notEquals`, `isNull` (`{isNull: true}`), `notNull` (`{notNull: true}`) passthrough; group → `{ [group.logic]: group.filters.map((f) => ({ [f.id]: toGraphQLFilterValue(f) })) }` — implement group join in `buildQuery` by merging `where` with `and`/`or` keys.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test brain --run libs/brain/data-grid/src/lib/adapters/rest-adapter.spec.ts libs/brain/data-grid/src/lib/adapters/odata-adapter.spec.ts libs/brain/data-grid/src/lib/adapters/graphql-adapter.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/brain/data-grid/src/lib/adapters/
git commit -m "feat(data-grid): map negated null and case filters" -m "REST OData GraphQL group joins."
```

### Task 3: Composite draft pure functions

**Files:**

- Create: `libs/brain/data-grid/src/lib/brn-column-filter-draft.ts` (apply `C:\Users\admin\Downloads\brn-column-filter.patch` first, then extend)
- Create: `libs/brain/data-grid/src/lib/brn-column-filter-draft.spec.ts`

**Interfaces:**

- Consumes: Task 1 `toBrnFilterGroup`, existing `brnDraft*` single fns from patch.
- Produces: `BrnCompositeDraft`, `brnCompositeFromRaw`, `brnCompositeSetLogic`, `brnCompositeSetCondition`, `brnCompositeToGroup`.

- [ ] **Step 1: Apply baseline patch then write the failing test**

```bash
git apply "C:\\Users\\admin\\Downloads\\brn-column-filter.patch"
```

```ts
import { describe, expect, it } from 'vitest';
import { brnCompositeToGroup } from './brn-column-filter-draft';

describe('brnCompositeToGroup', () => {
	it('drops an empty second condition to single', () => {
		const group = brnCompositeToGroup(
			{
				logic: 'or',
				first: { operator: 'contains', value: 'a' },
				second: { operator: 'contains', value: '' },
				caseSensitive: false,
			},
			'string',
		);
		expect(group).toMatchObject({ operator: 'contains', value: 'a' });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test brain --run libs/brain/data-grid/src/lib/brn-column-filter-draft.spec.ts`
Expected: FAIL with `brnCompositeToGroup is not defined`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { toBrnFilterGroup } from './brn-data-source';
export type BrnCompositeDraft = {
	logic: 'and' | 'or';
	first: BrnFilterDraft;
	second?: BrnFilterDraft;
	caseSensitive: boolean;
};

export function brnCompositeFromRaw(raw: unknown, meta: BrnColumnFilterMeta): BrnCompositeDraft {
	if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && 'conditions' in raw) {
		const spec = raw as { logic?: 'and' | 'or'; conditions: [unknown, unknown?]; caseSensitive?: boolean };
		return {
			logic: spec.logic ?? 'and',
			first: brnDraftFromRaw(spec.conditions[0], meta),
			second: spec.conditions[1] ? brnDraftFromRaw(spec.conditions[1], meta) : undefined,
			caseSensitive: spec.caseSensitive ?? false,
		};
	}
	return { logic: 'and', first: brnDraftFromRaw(raw, meta), second: undefined, caseSensitive: false };
}

export function brnCompositeSetLogic(draft: BrnCompositeDraft, logic: 'and' | 'or'): BrnCompositeDraft {
	return { ...draft, logic };
}

export function brnCompositeSetCondition(
	draft: BrnCompositeDraft,
	index: 0 | 1,
	next: BrnFilterDraft,
): BrnCompositeDraft {
	return index === 0 ? { ...draft, first: next } : { ...draft, second: next };
}

export function brnCompositeToGroup(
	draft: BrnCompositeDraft,
	type?: BrnFilterType,
): BrnFilter | BrnFilterGroup | undefined {
	const second = draft.second && brnDraftToSpec(draft.second, type) ? draft.second : undefined;
	if (!second) {
		const single = brnDraftToSpec(draft.first, type);
		if (!single) return undefined;
		return draft.caseSensitive
			? ({ id: 'draft', operator: single.operator, value: single.value, type, caseSensitive: true } as BrnFilter)
			: ({ id: 'draft', ...single, type } as BrnFilter);
	}
	return toBrnFilterGroup(
		'draft',
		{
			logic: draft.logic,
			conditions: [
				{ operator: draft.first.operator, value: draft.first.value },
				{ operator: second.operator, value: second.value },
			],
			caseSensitive: draft.caseSensitive || undefined,
		},
		type,
	) as BrnFilter | BrnFilterGroup | undefined;
}
```

Keep all existing single `brnDraft*` fns from the patch untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test brain --run libs/brain/data-grid/src/lib/brn-column-filter-draft.spec.ts`
Expected: PASS (plus existing 27 pure tests).

- [ ] **Step 5: Commit**

```bash
git add libs/brain/data-grid/src/lib/brn-column-filter-draft.ts libs/brain/data-grid/src/lib/brn-column-filter-draft.spec.ts
git commit -m "feat(data-grid): add composite filter draft" -m "And/Or wrapper reusing single draft fns."
```

### Task 4: BrnColumnFilter directive + flushFilters

**Files:**

- Create: `libs/brain/data-grid/src/lib/brn-column-filter.ts` (from patch, then extend with `index` + logic + case)
- Modify: `libs/brain/data-grid/src/lib/brn-data-grid-state.ts` (`flushFilters`)
- Modify: `libs/brain/data-grid/src/lib/brn-data-grid.ts` (`flushFilters`)
- Modify: `libs/brain/data-grid/src/index.ts` (exports)
- Test: `libs/brain/data-grid/src/lib/brn-column-filter.spec.ts`

**Interfaces:**

- Consumes: Task 3 composite draft API, Task 1 `toBrnFilterGroup`.
- Produces: `BrnColumnFilter` (`draft`, `canApply`, `isActive`, `open/reset/setOperator/setValue/setRange/toggleOption(index)/setLogic/setCaseSensitive/apply/clear`), `BrnDataGrid.flushFilters()`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

describe('BrnColumnFilter advanced', () => {
	it('applies two conditions as one group and fetches immediately', async () => {
		// TestBed host with BrnDataGrid + [brnColumnFilter]; open(); setValue('a'); setSecondValue('b'); setLogic('or'); apply();
		expect(true).toBe(true);
	});
});
```

Concretely extend the patch spec: after `name.open(); name.setValue('ada');` add `name.setValue('b', 1); name.setLogic('or'); name.apply();` then assert `grid.state().filters` contains `{id: 'name', logic: 'or'}` and `fetchFn` grew without advancing timers.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test brain --run libs/brain/data-grid/src/lib/brn-column-filter.spec.ts`
Expected: FAIL (`setLogic` missing).

- [ ] **Step 3: Write minimal implementation**

Extend the patch directive: `_draft` becomes `signal<BrnCompositeDraft>`; `draft` computed returns composite; single helpers delegate with `index`:

```ts
public setOperator(op: BrnFilterOperator, index: 0 | 1 = 0): void { this._update((d) => brnCompositeSetCondition(d, index, brnDraftSetOperator(index === 0 ? d.first : (d.second ?? { operator: op, value: undefined }), op))); }
public setValue(v: unknown, index: 0 | 1 = 0): void { /* same via brnDraftSetValue */ }
public setRange(from: unknown, to: unknown, index: 0 | 1 = 0): void { /* via brnDraftSetRange, operator between */ }
public toggleOption(v: unknown, checked: boolean, index: 0 | 1 = 0): void { /* via brnDraftToggleOption */ }
public hasOption(v: unknown, index: 0 | 1 = 0): boolean { /* via brnDraftHasOption */ }
public setLogic(logic: 'and' | 'or'): void { this._update((d) => brnCompositeSetLogic(d, logic)); }
public setCaseSensitive(sensitive: boolean): void { this._update((d) => ({ ...d, caseSensitive: sensitive })); }
public apply(): void {
	const group = brnCompositeToGroup(this.draft(), this.meta()?.type);
	this.column().setFilterValue(group === undefined ? undefined : group instanceof Object && 'logic' in (group as object) ? { logic: (group as BrnFilterGroup).logic, conditions: (group as BrnFilterGroup).filters.map((f) => ({ operator: f.operator, value: f.value })), caseSensitive: (group as BrnFilterGroup).caseSensitive } : { operator: (group as BrnFilter).operator, value: (group as BrnFilter).value });
	this._grid?.flushFilters();
}
```

`isActive` checks `state().filters.some((f) => f.id === id)` (groups carry same `id`). `clear()` sets `undefined` + flush + resets composite draft. Keep `flushFilters` from patch (`flushAppliedFilters(true)` + page reset).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test brain --run libs/brain/data-grid/src/lib/brn-column-filter.spec.ts`
Expected: PASS (14 directive tests + new advanced cases).

- [ ] **Step 5: Commit**

```bash
git add libs/brain/data-grid/src/
git commit -m "feat(data-grid): add BrnColumnFilter apply flow" -m "Composite draft, one write plus flush."
```

### Task 5: Helm HlmDataGridColumnFilter popover

**Files:**

- Create: `libs/helm/data-grid/src/lib/hlm-data-grid-column-filter.ts`
- Create: `libs/helm/data-grid/src/lib/hlm-data-grid-filter-labels.ts`

**Interfaces:**

- Consumes: Task 4 `BrnColumnFilter`; `hlm-popover`, `hlmBtn`, `hlm-native-select`, `hlmInput`, `hlm-checkbox`.
- Produces: `HlmDataGridColumnFilter` (`[column]`, `[labels]`), `HLM_DATA_GRID_OPERATOR_LABELS`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';

describe('HlmDataGridColumnFilter', () => {
	it('opens a popover and applies once', async () => {
		// render header column + <hlm-data-grid-column-filter>; click trigger; set operator/value; click Apply;
		// assert column.setFilterValue called once with {operator:'contains', value:'ada'}
		expect(true).toBe(true);
	});
});
```

Place in `libs/helm/data-grid/src/lib/hlm-data-grid.spec.ts` (extend, not new file).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test helm --run libs/helm/data-grid/src/lib/hlm-data-grid.spec.ts`
Expected: FAIL (component missing).

- [ ] **Step 3: Write minimal implementation**

```ts
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BrnColumnFilter } from '@spartan-ng/brain/data-grid';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';
import { hlm } from '@spartan-ng/helm/utils';

export type HlmDataGridFilterLabels = {
	operator?: string;
	value?: string;
	from?: string;
	to?: string;
	clear?: string;
	apply?: string;
	simple?: string;
	advanced?: string;
	and?: string;
	or?: string;
	caseSensitive?: string;
};

@Component({
	selector: 'hlm-data-grid-column-filter',
	hostDirectives: [{ directive: BrnColumnFilter, inputs: ['brnColumnFilter: column'] }],
	imports: [
		...HlmButtonImports,
		...HlmCheckboxImports,
		...HlmInputImports,
		...HlmNativeSelectImports,
		...HlmPopoverImports,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<button
			hlmBtn
			variant="ghost"
			size="icon-xs"
			data-slot="data-grid-filter-trigger"
			[hlmPopoverTriggerFor]="panel"
			[attr.aria-label]="labels().filter ?? 'Filter'"
			[attr.data-active]="filter.isActive()"
		>
			<ng-icon name="lucideFilter" />
			@if (filter.isActive()) {
				<span data-slot="data-grid-filter-dot" aria-hidden="true"></span>
			}
		</button>
		<hlm-popover-content #panel="hlmPopoverContent" *hlmPopoverPortal class="w-72 p-3" (closed)="filter.reset()">
			<!-- operator select + value control moved from HlmDataGrid, bound to filter.draft()/filter.set*(value, index); Simple/Advanced switch; And/Or toggle; Clear/Apply -->
		</hlm-popover-content>
	`,
})
export class HlmDataGridColumnFilter {
	public readonly column = input.required<unknown>({ alias: 'column' });
	public readonly labels = input<HlmDataGridFilterLabels>({});
	protected readonly filter = null as unknown as BrnColumnFilter;
}
```

Wire `filter` via `inject(BrnColumnFilter)`; `labels` merged by `HlmDataGrid` from `operatorLabels/fromText/…`. Value controls per `meta.type` copied from current `HlmDataGrid` template (text input, number/date single + between from/to, boolean select, select single + `in` checkbox list), each row parameterized by `index` (0/1). Footer: Clear → `filter.clear()`, Apply → `filter.apply()` with `[disabled]="!filter.canApply()"`; Enter applies.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test helm --run libs/helm/data-grid/src/lib/hlm-data-grid.spec.ts`
Expected: PASS for the new popover case.

- [ ] **Step 5: Commit**

```bash
git add libs/helm/data-grid/src/lib/hlm-data-grid-column-filter.ts libs/helm/data-grid/src/lib/hlm-data-grid-filter-labels.ts
git commit -m "feat(data-grid): add column filter popover" -m "Trigger plus panel with simple advanced."
```

### Task 6: HlmDataGrid header swap and chip groups

**Files:**

- Modify: `libs/helm/data-grid/src/lib/hlm-data-grid.ts`
- Test: `libs/helm/data-grid/src/lib/hlm-data-grid.spec.ts`

**Interfaces:**

- Consumes: Task 5 component + labels.
- Produces: slim header (`sort + filter button`), group chips.

- [ ] **Step 1: Write the failing test**

```ts
describe('HlmDataGrid header', () => {
	it('shows one filter button per filterable column', async () => {
		// render grid; assert [data-slot="data-grid-filter-trigger"] count equals filterable columns;
		// assert no [data-slot="data-grid-filter"] tall blocks remain.
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test helm --run libs/helm/data-grid/src/lib/hlm-data-grid.spec.ts`
Expected: FAIL (old blocks still present).

- [ ] **Step 3: Write minimal implementation**

Replace the `@if (showColumnFilters() && _filterMeta(header); as meta)` tall `<div data-slot="data-grid-filter">…</div>` with:

```html
@if (showColumnFilters() && _filterMeta(header)) {
<hlm-data-grid-column-filter [column]="header.column" [labels]="_filterLabels()" />
}
```

Delete `_spec`, `_onOperator`, `_onText`, `_onRange`, `_onChoice`, `_onToggleOption`, `_filterRoot`, `_rootOperator`, `_rootValues`, `_textValue`, `_range`, `_booleanValue`, `_chosen`, `_isChosen`. Keep `_filterMeta`, `_metaLabel`, chip helpers; extend `_chipValue` to render groups as `v1 or v2`. Add `_filterLabels()` merging `operatorLabels()/fromText()/toText()/…` into `HlmDataGridFilterLabels`. Add `HlmDataGridColumnFilter` to `HlmDataGridImports`; re-export `HLM_DATA_GRID_OPERATOR_LABELS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test helm --run libs/helm/data-grid/src/lib/hlm-data-grid.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/helm/data-grid/src/lib/hlm-data-grid.ts libs/helm/data-grid/src/lib/hlm-data-grid.spec.ts
git commit -m "refactor(data-grid): swap header filters for popover" -m "Delete inline controls, keep chips."
```

### Task 7: CLI templates, deps, docs snapshot

**Files:**

- Modify: `libs/cli/src/generators/ui/primitive-deps.ts` (add `'popover'` to `data-grid` list)
- Create: `libs/cli/src/generators/ui/libs/data-grid/files/lib/hlm-data-grid-column-filter.ts.template`
- Create: `libs/cli/src/generators/ui/libs/data-grid/files/lib/hlm-data-grid-filter-labels.ts.template`
- Modify: `libs/cli/src/generators/ui/libs/data-grid/files/lib/hlm-data-grid.ts.template`, `index.ts.template`
- Test: `libs/cli/src/generators/ui/primitive-deps.spec.ts`, `libs/tools/src/executors/docs/generate-ui-docs/executor.spec.ts`

**Interfaces:**

- Consumes: Tasks 5–6 helm sources.
- Produces: scaffold parity + updated snapshot.

- [ ] **Step 1: Write the failing test**

Run existing: `pnpm nx test cli --run libs/cli/src/generators/ui/primitive-deps.spec.ts` after adding an assertion:

```ts
expect(primitiveDependencies['data-grid']).toContain('popover');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test cli --run libs/cli/src/generators/ui/primitive-deps.spec.ts`
Expected: FAIL (missing `popover`).

- [ ] **Step 3: Write minimal implementation**

Add `'popover'` to the `data-grid` array (keep alphabetical-ish order with existing entries). Copy the two new helm files verbatim into `.template` files; update `hlm-data-grid.ts.template` header swap and `index.ts.template` exports. Check `supported-ui-libraries.json` lists `@angular/cdk` for data-grid (as date-picker does); add if missing. Regenerate docs snapshot: `pnpm nx test tools --run libs/tools/src/executors/docs/generate-ui-docs/executor.spec.ts -u`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test cli --run libs/cli/src/generators/ui/primitive-deps.spec.ts; pnpm nx test tools --run libs/tools/src/executors/docs/generate-ui-docs/executor.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/cli/ libs/tools/
git commit -m "feat(data-grid): scaffold filter popover in CLI" -m "Popover dep plus templates snapshot."
```

### Task 8: Storybook stories + Cypress e2e + helm spec rewrite

**Files:**

- Modify: `apps/ui-storybook/stories/data-grid.stories.ts`
- Modify: `apps/ui-storybook-e2e/src/integration/data-grid/data-grid.cy.ts`
- Modify: `libs/helm/data-grid/src/lib/hlm-data-grid.spec.ts`

**Interfaces:**

- Consumes: Tasks 5–6 component.
- Produces: simple + advanced coverage per type.

- [ ] **Step 1: Write the failing test (helm spec excerpt)**

```ts
it('applies a number range through the popover', async () => {
	// open [data-slot="data-grid-filter-trigger"][data-column="age"]; set from/to; click Apply;
	// assert query contains filter[age][gte] and [lte].
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test helm --run libs/helm/data-grid/src/lib/hlm-data-grid.spec.ts`
Expected: FAIL (old selectors write directly without popover).

- [ ] **Step 3: Write minimal implementation**

Rewrite filter tests to open the popover first; add advanced `or` + case cases; stories add `SimpleFilter`, `AdvancedFilter`, per-type controls, active-dot and chip-removal states; `data-grid.cy.ts` mirrors: `cy.get('[data-slot="data-grid-filter-trigger"]').first().click(); cy.get('[data-slot="data-grid-operator"]').select('contains'); … cy.contains('Apply').click();`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test helm --run libs/helm/data-grid/src/lib/hlm-data-grid.spec.ts`
Expected: PASS. Then: `pnpm nx e2e ui-storybook-e2e --spec=data-grid` (or repo-prescribed e2e command).

- [ ] **Step 5: Commit**

```bash
git add apps/ui-storybook/stories/data-grid.stories.ts apps/ui-storybook-e2e/src/integration/data-grid/data-grid.cy.ts libs/helm/data-grid/src/lib/hlm-data-grid.spec.ts
git commit -m "test(data-grid): cover popover filters in specs" -m "Stories e2e per type and advanced."
```

### Task 9: Final verification

- [ ] **Step 1: Format**

Run: `pnpm nx format:write`
Expected: clean; re-check `pnpm nx format:check --base=origin/main`.

- [ ] **Step 2: Lint**

Run: `pnpm run lint`
Expected: 0 errors in touched files.

- [ ] **Step 3: Test**

Run: `pnpm run test`
Expected: all suites pass (brain Chromium, helm, cli, tools).

- [ ] **Step 4: Build**

Run: `pnpm run build`
Expected: success with no new entrypoints.
