import { JsonPipe } from '@angular/common';
import { Component, viewChild } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDataGrid, HlmDataGridImports } from '@spartan-ng/helm/data-grid';
import { createEmployeeAdapter, employeeColumns, employeeFeatures } from './data-grid.shared';

@Component({
	selector: 'spartan-data-grid-programmatic-preview',
	imports: [...HlmDataGridImports, ...HlmButtonImports, JsonPipe],
	host: { class: 'w-full' },
	template: `
		<div class="flex flex-wrap gap-2 pb-2">
			<button hlmBtn size="sm" variant="outline" data-testid="active-engineers" (click)="_activeEngineers()">
				Active engineers
			</button>
			<button hlmBtn size="sm" variant="outline" data-testid="over-fifty" (click)="_overFifty()">Age over 50</button>
			<button hlmBtn size="sm" variant="outline" data-testid="oldest-first" (click)="_oldestFirst()">
				Oldest first
			</button>
			<button hlmBtn size="sm" variant="ghost" data-testid="reset" (click)="_reset()">Reset</button>
		</div>
		<hlm-data-grid
			[adapter]="adapter"
			[features]="features"
			[columns]="columns"
			[initial]="{ pageSize: 5 }"
			[pageSizeOptions]="[5, 10]"
			[showToolbar]="false"
		/>
		<pre class="bg-muted mt-2 overflow-x-auto rounded-md p-3 text-xs" data-testid="grid-state">{{
			_grid().state() | json
		}}</pre>
	`,
})
export class DataGridProgrammaticPreview {
	public readonly adapter = createEmployeeAdapter();
	public readonly features = employeeFeatures;
	public readonly columns = employeeColumns;

	protected readonly _grid = viewChild.required(HlmDataGrid);

	/** Writes two column filters, as the filter popover would after Apply. */
	protected _activeEngineers(): void {
		const table = this._grid().table;
		table.getColumn('active')?.setFilterValue({ operator: 'equals', value: true });
		table.getColumn('role')?.setFilterValue({ operator: 'equals', value: 'engineer' });
	}

	protected _overFifty(): void {
		this._grid().table.getColumn('age')?.setFilterValue({ operator: 'gt', value: 50 });
	}

	protected _oldestFirst(): void {
		this._grid().table.setSorting([{ id: 'age', desc: true }]);
	}

	protected _reset(): void {
		const table = this._grid().table;
		table.resetColumnFilters(true);
		table.resetSorting(true);
		table.setPageIndex(0);
	}
}
