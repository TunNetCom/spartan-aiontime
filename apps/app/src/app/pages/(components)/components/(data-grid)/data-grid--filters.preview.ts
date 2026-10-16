import { Component } from '@angular/core';
import { HlmDataGridImports } from '@spartan-ng/helm/data-grid';
import { createEmployeeAdapter, employeeColumns, employeeFeatures } from './data-grid.shared';

@Component({
	selector: 'spartan-data-grid-filters-preview',
	imports: [...HlmDataGridImports],
	host: { class: 'w-full' },
	template: `
		<hlm-data-grid
			[adapter]="adapter"
			[features]="features"
			[columns]="columns"
			[initial]="{ pageSize: 5 }"
			[pageSizeOptions]="[5, 10]"
		/>
	`,
})
export class DataGridFiltersPreview {
	public readonly adapter = createEmployeeAdapter();
	public readonly features = employeeFeatures;
	public readonly columns = employeeColumns;
}
