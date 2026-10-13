# Data-Grid Column Filter Popover (Simple + Advanced) — Design

Date: 2026-10-13
Branch: `feat-datagrid`
Baseline: `C:\Users\admin\Downloads\brn-column-filter.patch` (steps 1–2, brain only, applies cleanly, not yet applied)
Scope: Step 3 only — helm popover + repo ripple, with full Radzen parity (advanced mode in scope).

## 1. Intent and success criteria

- Intended outcome: replace `HlmDataGrid`'s always-visible per-column filter blocks (operator select + value inputs in every header, ~826-line component, ~400 lines of filter logic in helm) with a Radzen "simple with menu" pattern extended to Radzen advanced: funnel button next to sort, popover with operator dropdown + type-aware value control + Clear/Apply, draft-local editing, single write + immediate fetch on Apply, active-dot on trigger. Advanced adds a second condition joined by And/Or plus negated operators and case sensitivity.
- Who it is for: consumers of `hlm-data-grid` (server-driven REST/OData/GraphQL grids) and CLI scaffold users.
- Constraints (from repo + prior spec): stay inside existing `brain/data-grid` and `helm/data-grid` entrypoints (no new entrypoint, no `tsconfig.base.json` / `ng-package.json` change); brain imports nothing from helm; keep `HlmDataGrid` public inputs (`operatorLabels`, `fromText`, `showColumnFilters`, …) compatible; keep `data-slot` names (`data-grid-operator`, `data-grid-value-from`, …); commitlint `type(data-grid)` with scope `data-grid`; run `lint`, `format:write`, `test`, `build` before push.
- Success: headers short and quiet; filter transitions in brain and unit-tested without a component; typing never refetches; Apply writes once and fetches immediately (no 300 ms wait); toolbar search keeps debounce; singles produce byte-identical backend queries; specs/stories/e2e/docs updated.

## 2. Current state (verified on `feat-datagrid`)

- Brain `brn-data-source.ts` holds the filter domain: `BrnFilterOperator`, `BRN_FILTER_OPERATORS` per type, `meta.filter` (`BrnColumnFilterMeta`), `BrnFilterSpec`, `toBrnFilter` with coercion, `toBrnComparisons` with date-day windows, adapters map exactly one operator per column.
- Helm `hlm-data-grid.ts` renders per filterable column an always-visible block: operator `hlm-native-select` + value control by `meta.type` (`string` text, `number`/`date` single or `between` from/to, `boolean` choice, `select` single or `in` checkbox list). Handlers read sibling DOM values to avoid stale TanStack snapshots; every keystroke writes table state → chips update + debounced fetch.
- Popover primitive exists (`libs/helm/popover`) and date-picker pattern is `<hlm-popover-content *hlmPopoverPortal>` + `hlmPopoverTrigger` / `hlmPopoverTriggerFor` — the filter popover follows it.
- Patch `brn-column-filter.patch` adds `brn-column-filter-draft.ts` (pure `BrnFilterDraft` fns reusing `toBrnFilter`), `BrnColumnFilter` directive (draft/canApply/isActive/open/reset/set*/apply/clear), `flushFilters()` on `injectBrnDataGrid`/`BrnDataGrid`, index exports. It is the steps 1–2 baseline for this spec.

## 3. Approach selected: composite filter value per column

Alternatives considered: (B) two entries sharing one id (keeps `BrnFilter` but breaks TanStack single-slot + chips/state grouping); (C) ship simple now, advanced follow-up (defers the explicit full-parity request). Selected (A) because one TanStack entry per column, adapters stay pure, and old singles keep working.

## 4. Data model (§1 approved)

- TanStack `columnFilters` slot per column holds one value: old single `BrnFilterSpec` `{operator, value}` (backward compat) or new `BrnCompositeSpec` `{logic: 'and' | 'or', conditions: [c1, c2?], caseSensitive?: boolean}` where each condition is `{operator, value}`.
- Grid state: `(BrnFilter | BrnFilterGroup)[]`; `BrnFilterGroup = {id, logic, filters: [BrnFilter, BrnFilter?], type?, caseSensitive?}`. Singles unchanged.
- Operators add `notContains`, `notEquals`, `isNull`, `notNull`. `isEmpty`/`notEmpty` keep blank-string semantics; `isNull`/`notNull` check null. `BRN_FILTER_OPERATORS.string` gains `notContains`/`notEquals`/`isNull`/`notNull`; `number`/`date`/`select`/`boolean` gain `notEquals`/`isNull`/`notNull` where sensible (exact list locked in implementation plan).
- `caseSensitive?: boolean` affects text ops only; default insensitive (current behavior).

## 5. Brain (§2 approved)

- `brn-column-filter-draft.ts`: add composite wrapper reusing per-condition fns: `BrnCompositeDraft = {logic, first: BrnFilterDraft, second?: BrnFilterDraft, caseSensitive}` + `brnCompositeFromRaw / SetLogic / SetCondition / ToGroup`. Empty second condition drops to single; empty composite yields `undefined`.
- `BrnColumnFilter` directive: `draft()` becomes composite; `setOperator/setValue/setRange/toggleOption` gain `index = 0 | 1`; add `setLogic()` + `setCaseSensitive()`; `canApply = brnCompositeToGroup() !== undefined`; `isActive` matches `id` in singles or groups; `apply()` one `setFilterValue(single | composite)` + `flushFilters()`; `clear()` empties + flushes; `open()`/`reset()` reseed from column value.
- `brn-data-source.ts`: keep `toBrnFilter`; add `toBrnFilterGroup(id, raw, type)`; extend `toBrnComparisons` for `notEquals` (`ne`); text negation handled in adapters.

## 6. Adapters (§3 approved)

- Shared: per-single expression helper, then group join with `and`/`or`. Singles byte-identical.
- REST `toRestFilterParams`: `notContains` → `filter[id][notContains]`, `notEquals` → `filter[id][notEquals]`, `isNull`/`notNull` → `filter[id][isNull|notNull]=true`, case flag → `filter[id][case]=sensitive` only when true; group → `filter[id][logic]=and|or` + indexed conditions `filter[id][0][op]`.
- OData `toODataFilterExpression`: negations via `not (...)`, null checks `field eq null` / `ne null`, insensitive text via `tolower(field) op tolower(val)`, group → `(expr1 and|or expr2)`.
- GraphQL `toGraphQLFilterValue`: `{notContains, notEquals, isNull, notNull, mode: insensitive}` passthrough, group → `{and: [...]} | {or: [...]}`.

## 7. Helm popover (§4 approved)

- New `libs/helm/data-grid/src/lib/hlm-data-grid-column-filter.ts`: `hostDirectives: [{directive: BrnColumnFilter, inputs: ['brnColumnFilter: column']}]`; trigger `hlmBtn ghost icon` + Lucide `filter` icon + active dot (`data-active`, `aria-label="{label} filter"`); panel `<hlm-popover-content *hlmPopoverPortal>` (date-picker pattern).
- Panel: Simple/Advanced segmented switch; row = operator `hlm-native-select` + type-aware value control moved from `HlmDataGrid` (native select/date inputs, no nested overlays); advanced shows row 2 + And/Or toggle + case-sensitive checkbox (text types only); footer Clear + Apply (`[disabled]="!canApply()"`, Enter applies, `(closed)`/`stateChanged` → `open()`/`reset()`); focus/Escape from brain popover.
- Styling via `classes()`/`hlm()`; `labels` input built by `HlmDataGrid` from existing `operatorLabels`/`fromText`/… inputs.

## 8. Integration and repo ripple (§5 approved)

- `HlmDataGrid` header → sort button + `<hlm-data-grid-column-filter [column] [labels]>`; delete `_spec`, `_onOperator`, `_onText`, `_onRange`, `_onChoice`, `_onToggleOption`, `_filterRoot`, `_rootOperator`, `_rootValues`, `_textValue`, `_range`, `_booleanValue`, `_chosen`, `_isChosen` (~350 lines); extend chips to render groups (`A or B`); keep `data-slot` names.
- Re-export `HLM_DATA_GRID_OPERATOR_LABELS` from `hlm-data-grid.ts`; add `HlmDataGridColumnFilter` to `HlmDataGridImports`, `BrnColumnFilter` to `BrnDataGridImports`.
- CLI: add `popover` to data-grid deps in `primitive-deps.ts`, two `.template` files + `index.ts.template` mirroring helm, check `supported-ui-libraries.json` for `@angular/cdk`.
- Specs/stories/e2e/docs: helm spec (793 lines) opens popover first; story + `data-grid.cy.ts` same; docs page + `executor.spec.ts.snap` updated.

## 9. Testing, edge cases, PRs (§6 approved)

- Tests: pure draft specs (single + composite), directive TestBed (isolation, one-write Apply + `flushFilters`, empty-Apply removes, page reset to 0), adapter specs per operator + group join + case + date-day windows, helm specs via popover open → set → Apply.
- Edges: blank second condition → single; unreadable typed value → `canApply=false`; `between` open bounds allowed; emptiness/null ops carry no value; no-grid use → `isActive=false`, `apply` skips flush.
- PRs (`data-grid` scope; `lint`, `format:write`, `test`, `build` per `CLAUDE.md`): (1) operators + `toBrnFilterGroup` + adapters; (2) composite draft + directive + `flushFilters` (patch rebased); (3) helm popover + CLI/docs/specs ripple.
