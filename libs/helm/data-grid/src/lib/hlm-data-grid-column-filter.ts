import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFilter } from '@ng-icons/lucide';
import {
	BrnColumnFilter,
	type BrnFilterableColumn,
	type BrnFilterDraft,
	type BrnFilterOperator,
	type BrnFilterType,
} from '@spartan-ng/brain/data-grid';
import type { BrnOverlayState } from '@spartan-ng/brain/overlay';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmNativeSelectImports } from '@spartan-ng/helm/native-select';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';
import { hlm } from '@spartan-ng/helm/utils';
import { HLM_DATA_GRID_OPERATOR_LABELS, type HlmDataGridFilterLabels } from './hlm-data-grid-filter-labels';

let hlmDataGridColumnFilterNextId = 0;

const HLM_DATA_GRID_FILTER_LABEL_DEFAULTS: Required<HlmDataGridFilterLabels> = {
	filter: 'Filter',
	operator: 'Operator',
	value: 'Value',
	from: 'From',
	to: 'To',
	clear: 'Clear',
	apply: 'Apply',
	simple: 'Simple',
	advanced: 'Advanced',
	and: 'And',
	or: 'Or',
	caseSensitive: 'Case sensitive',
	mode: 'Filter mode',
	logic: 'Combine filters',
	all: 'All',
	true: 'True',
	false: 'False',
	operatorLabels: HLM_DATA_GRID_OPERATOR_LABELS,
};

/**
 * Popover filter for one grid column. It hosts the headless `BrnColumnFilter` (draft editing, one
 * atomic write on Apply) and renders the trigger plus panel: a ghost icon button with an active
 * dot, then an operator picker and type-aware value controls copied from the inline `HlmDataGrid`
 * filters (text input, number/date single plus `between` from/to, boolean choice, select single
 * plus `in` checkbox list).
 *
 * Simple mode edits the first condition; Advanced reveals the second row with the And/Or toggle.
 * The case checkbox only shows for text columns. NOTE: a single-condition apply drops the flag
 * (`BrnFilterSpec` has no `caseSensitive` slot, see the Task 4 TODO) - the checkbox still applies
 * to two-condition groups. Enter applies unless a button has focus; closing without applying
 * resets the draft.
 */
@Component({
	selector: 'hlm-data-grid-column-filter',
	imports: [
		NgTemplateOutlet,
		NgIcon,
		...HlmButtonImports,
		...HlmCheckboxImports,
		...HlmInputImports,
		...HlmNativeSelectImports,
		...HlmPopoverImports,
	],
	providers: [provideIcons({ lucideFilter })],
	changeDetection: ChangeDetectionStrategy.OnPush,
	hostDirectives: [{ directive: BrnColumnFilter, inputs: ['brnColumnFilter: column'] }],
	host: {
		'data-slot': 'data-grid-filter',
		'[class]': '_cls()',
		'[attr.data-column]': 'column().id',
	},
	template: `
		<hlm-popover (closed)="_filter.reset()" (stateChanged)="_onState($event)">
			<span class="relative inline-flex">
				<button
					hlmBtn
					variant="ghost"
					size="icon-xs"
					type="button"
					hlmPopoverTrigger
					data-slot="data-grid-filter-trigger"
					[attr.aria-label]="_labels().filter"
					[attr.data-active]="_filter.isActive()"
				>
					<ng-icon name="lucideFilter" aria-hidden="true" />
				</button>
				@if (_filter.isActive()) {
					<span data-slot="data-grid-filter-dot" [class]="_dotCls()" aria-hidden="true"></span>
				}
			</span>
			<hlm-popover-content
				*hlmPopoverPortal
				data-slot="data-grid-filter-panel"
				class="w-72 p-3"
				(keydown.enter)="_applyOnEnter($event)"
			>
				<div class="flex flex-col gap-2">
					<div data-slot="data-grid-filter-mode" role="group" [attr.aria-label]="_labels().mode" class="flex gap-1">
						<button
							hlmBtn
							variant="ghost"
							size="sm"
							type="button"
							[attr.aria-pressed]="_mode() === 'simple'"
							(click)="_mode.set('simple')"
						>
							{{ _labels().simple }}
						</button>
						<button
							hlmBtn
							variant="ghost"
							size="sm"
							type="button"
							[attr.aria-pressed]="_mode() === 'advanced'"
							(click)="_mode.set('advanced')"
						>
							{{ _labels().advanced }}
						</button>
					</div>

					<ng-container *ngTemplateOutlet="conditionRow; context: { $implicit: 0 }" />

					@if (_mode() === 'advanced') {
						<div data-slot="data-grid-filter-logic" role="group" [attr.aria-label]="_labels().logic" class="flex gap-1">
							<button
								hlmBtn
								variant="ghost"
								size="sm"
								type="button"
								[attr.aria-pressed]="_filter.draft().logic === 'and'"
								(click)="_filter.setLogic('and')"
							>
								{{ _labels().and }}
							</button>
							<button
								hlmBtn
								variant="ghost"
								size="sm"
								type="button"
								[attr.aria-pressed]="_filter.draft().logic === 'or'"
								(click)="_filter.setLogic('or')"
							>
								{{ _labels().or }}
							</button>
						</div>
						<ng-container *ngTemplateOutlet="conditionRow; context: { $implicit: 1 }" />
					}

					@if (_metaType() === 'string') {
						<div class="flex items-center gap-2">
							<hlm-checkbox
								data-slot="data-grid-filter-case"
								[inputId]="_caseId"
								[checked]="_filter.draft().caseSensitive"
								(checkedChange)="_filter.setCaseSensitive($event)"
							/>
							<label class="text-sm font-normal" [for]="_caseId">
								{{ _labels().caseSensitive }}
							</label>
						</div>
					}

					<div data-slot="data-grid-filter-footer" class="flex justify-end gap-1">
						<button
							hlmBtn
							variant="ghost"
							size="sm"
							type="button"
							data-slot="data-grid-filter-clear"
							(click)="_filter.clear()"
						>
							{{ _labels().clear }}
						</button>
						<button
							hlmBtn
							variant="default"
							size="sm"
							type="button"
							data-slot="data-grid-filter-apply"
							[disabled]="!_filter.canApply()"
							(click)="_filter.apply()"
						>
							{{ _labels().apply }}
						</button>
					</div>
				</div>
			</hlm-popover-content>
		</hlm-popover>

		<ng-template #conditionRow let-i>
			<div class="flex flex-col gap-1">
				<label class="sr-only" [for]="_operatorId(i)">{{ _labels().operator }}</label>
				<hlm-native-select
					data-slot="data-grid-operator"
					[selectId]="_operatorId(i)"
					size="sm"
					[value]="_operatorAt(i)"
					(change)="_setOperator(i, $event)"
				>
					@for (op of _filter.operators(); track op) {
						<option hlmNativeSelectOption [value]="op">{{ _operatorLabel(op) }}</option>
					}
				</hlm-native-select>
				@if (_isEmptiness(_operatorAt(i))) {
					<!-- Emptiness checks carry no value. -->
				} @else if (_metaType() === 'number' || _metaType() === 'date') {
					@if (_operatorAt(i) === 'between') {
						<div class="flex items-center gap-1">
							<label class="sr-only" [for]="_valueId(i, 'from')">{{ _labels().from }}</label>
							<input
								hlmInput
								data-slot="data-grid-value-from"
								[id]="_valueId(i, 'from')"
								[attr.type]="_metaType()"
								class="w-full"
								[value]="_rangeAt(i)[0]"
								[placeholder]="_labels().from"
								(input)="_setRange(i, 'from', $event)"
							/>
							<label class="sr-only" [for]="_valueId(i, 'to')">{{ _labels().to }}</label>
							<input
								hlmInput
								data-slot="data-grid-value-to"
								[id]="_valueId(i, 'to')"
								[attr.type]="_metaType()"
								class="w-full"
								[value]="_rangeAt(i)[1]"
								[placeholder]="_labels().to"
								(input)="_setRange(i, 'to', $event)"
							/>
						</div>
					} @else {
						<label class="sr-only" [for]="_valueId(i)">{{ _labels().value }}</label>
						<input
							hlmInput
							data-slot="data-grid-value"
							[id]="_valueId(i)"
							[attr.type]="_metaType()"
							class="w-full"
							[value]="_textAt(i)"
							(input)="_setText(i, $event)"
						/>
					}
				} @else if (_metaType() === 'boolean') {
					<label class="sr-only" [for]="_valueId(i)">{{ _labels().value }}</label>
					<hlm-native-select
						data-slot="data-grid-value"
						[selectId]="_valueId(i)"
						size="sm"
						[value]="_booleanAt(i)"
						(change)="_setChoice(i, $event)"
					>
						<option hlmNativeSelectOption value="">{{ _labels().all }}</option>
						<option hlmNativeSelectOption value="true">{{ _labels().true }}</option>
						<option hlmNativeSelectOption value="false">{{ _labels().false }}</option>
					</hlm-native-select>
				} @else if (_metaType() === 'select' && _operatorAt(i) === 'in') {
					<div
						data-slot="data-grid-value-set"
						role="group"
						class="flex flex-col gap-1"
						[attr.aria-label]="_labels().value"
					>
						@for (option of _options(); track $index) {
							<div class="flex items-center gap-2">
								<hlm-checkbox
									[inputId]="_valueId(i, 'option-' + $index)"
									[checked]="_hasOption(i, option.value)"
									(checkedChange)="_toggleOption(i, option.value, $event)"
								/>
								<label class="text-sm font-normal" [for]="_valueId(i, 'option-' + $index)">
									{{ option.label }}
								</label>
							</div>
						}
					</div>
				} @else if (_metaType() === 'select') {
					<label class="sr-only" [for]="_valueId(i)">{{ _labels().value }}</label>
					<hlm-native-select
						data-slot="data-grid-value"
						[selectId]="_valueId(i)"
						size="sm"
						[value]="_textAt(i)"
						(change)="_setChoice(i, $event)"
					>
						<option hlmNativeSelectOption value="">{{ _labels().all }}</option>
						@for (option of _options(); track $index) {
							<option hlmNativeSelectOption [value]="_optionKey(option.value)">
								{{ option.label }}
							</option>
						}
					</hlm-native-select>
				} @else {
					<label class="sr-only" [for]="_valueId(i)">{{ _labels().value }}</label>
					<input
						hlmInput
						data-slot="data-grid-value"
						[id]="_valueId(i)"
						type="text"
						class="w-full"
						[value]="_textAt(i)"
						(input)="_setText(i, $event)"
					/>
				}
			</div>
		</ng-template>
	`,
})
export class HlmDataGridColumnFilter {
	/**
	 * The TanStack column to filter, e.g. `header.column`.
	 */
	public readonly column = input.required<BrnFilterableColumn>({ alias: 'column' });

	/**
	 * Text overrides of the popover; every key falls back to English.
	 */
	public readonly labels = input<HlmDataGridFilterLabels>({});

	/**
	 * Display names of the filter operators, merged over `HLM_DATA_GRID_OPERATOR_LABELS`. The grid
	 * passes its `operatorLabels` through the `labels` input; override this to localize a standalone
	 * popover. A key set here wins over one carried on `labels`.
	 */
	public readonly operatorLabels = input<Partial<Record<BrnFilterOperator, string>>>({});

	/**
	 * Extra classes applied to the host.
	 */
	public readonly class = input('');

	protected readonly _filter = inject(BrnColumnFilter);

	protected readonly _labels = computed<Required<HlmDataGridFilterLabels>>(() => ({
		...HLM_DATA_GRID_FILTER_LABEL_DEFAULTS,
		...this.labels(),
	}));

	protected readonly _cls = computed(() => hlm('inline-flex', this.class()));

	protected readonly _dotCls = computed(() =>
		hlm('bg-primary pointer-events-none absolute top-0.5 right-0.5 size-2 rounded-full'),
	);

	/**
	 * Which condition rows the panel shows. It starts from the draft on open (a group reopens in
	 * Advanced) and only switches visibility: turning back to Simple keeps the second condition in
	 * the draft, since the directive offers no way to remove it.
	 */
	protected readonly _mode = signal<'simple' | 'advanced'>('simple');

	/** Per-instance id prefix: two column filters on one page must not share control `id`s. */
	private readonly _idPrefix = `hlm-data-grid-filter-${hlmDataGridColumnFilterNextId++}`;

	protected readonly _caseId = `${this._idPrefix}-case`;

	protected _onState(state: BrnOverlayState): void {
		if (state !== 'open') return;
		this._filter.open();
		this._mode.set(this._filter.draft().second ? 'advanced' : 'simple');
	}

	protected _applyOnEnter(event: Event): void {
		if ((event.target as HTMLElement | null)?.closest?.('button')) return;
		this._filter.apply();
	}

	protected _operatorLabel(operator: BrnFilterOperator): string {
		const labels = {
			...HLM_DATA_GRID_OPERATOR_LABELS,
			...this._labels().operatorLabels,
			...this.operatorLabels(),
		};
		return labels[operator] ?? operator;
	}

	protected _metaType(): BrnFilterType | undefined {
		return this._filter.meta()?.type;
	}

	protected _options(): readonly { label: string; value: unknown }[] {
		return this._filter.meta()?.options ?? [];
	}

	protected _isEmptiness(operator: BrnFilterOperator): boolean {
		return operator === 'isEmpty' || operator === 'notEmpty';
	}

	protected _operatorId(index: number): string {
		return `${this._idPrefix}-${index}-operator`;
	}

	protected _valueId(index: number, suffix?: string): string {
		const base = `${this._idPrefix}-${index}-value`;
		return suffix ? `${base}-${suffix}` : base;
	}

	/** One condition of the draft; the second falls back to a fresh row on the first's operator. */
	protected _conditionAt(index: number): BrnFilterDraft {
		const draft = this._filter.draft();
		if (index === 1) return draft.second ?? { operator: draft.first.operator, value: undefined };
		return draft.first;
	}

	protected _operatorAt(index: number): BrnFilterOperator {
		return this._conditionAt(index).operator;
	}

	protected _textAt(index: number): string {
		const value = this._conditionAt(index).value;
		const scalar = Array.isArray(value) ? value[0] : value;
		return scalar === undefined || scalar === null ? '' : this._optionKey(scalar);
	}

	protected _rangeAt(index: number): [string, string] {
		const value = this._conditionAt(index).value;
		const text = (entry: unknown) => (entry === undefined || entry === null ? '' : String(entry));
		if (Array.isArray(value)) return [text(value[0]), text(value[1])];
		return [text(value), ''];
	}

	protected _booleanAt(index: number): string {
		const value = this._conditionAt(index).value;
		return value === true || value === 'true' ? 'true' : value === false || value === 'false' ? 'false' : '';
	}

	protected _optionKey(value: unknown): string {
		return value instanceof Date ? value.toISOString() : String(value ?? '');
	}

	/** Maps a `<select>` string back to the option's own value, so `1` stays a number. */
	protected _optionFor(choice: string): unknown {
		const option = this._options().find((entry) => this._optionKey(entry.value) === choice);
		return option ? option.value : choice;
	}

	protected _hasOption(index: number, value: unknown): boolean {
		return this._filter.hasOption(value, index === 1 ? 1 : 0);
	}

	protected _setOperator(index: number, event: Event): void {
		this._filter.setOperator((event.target as HTMLSelectElement).value as BrnFilterOperator, index === 1 ? 1 : 0);
	}

	protected _setText(index: number, event: Event): void {
		this._filter.setValue((event.target as HTMLInputElement).value, index === 1 ? 1 : 0);
	}

	protected _setRange(index: number, side: 'from' | 'to', event: Event): void {
		const row = index === 1 ? 1 : 0;
		const [from, to] = this._rangeAt(row);
		const value = (event.target as HTMLInputElement).value;
		this._filter.setRange(side === 'from' ? value : from, side === 'to' ? value : to, row);
	}

	protected _setChoice(index: number, event: Event): void {
		const row = index === 1 ? 1 : 0;
		const choice = (event.target as HTMLSelectElement).value;
		if (choice === '') {
			this._filter.setValue(undefined, row);
			return;
		}
		this._filter.setValue(this._metaType() === 'boolean' ? choice === 'true' : this._optionFor(choice), row);
	}

	protected _toggleOption(index: number, value: unknown, checked: boolean): void {
		this._filter.toggleOption(value, checked, index === 1 ? 1 : 0);
	}
}
