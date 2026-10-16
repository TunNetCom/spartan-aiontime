import { Component } from '@angular/core';
import { BrnDataGridImports } from '@spartan-ng/brain/data-grid';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDataGridColumnFilter, HlmDataGridPagination } from '@spartan-ng/helm/data-grid';
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { FlexRender } from '@tanstack/angular-table';
import { createEmployeeAdapter, employeeColumns, employeeFeatures } from './data-grid.shared';

/**
 * The same grid built from its parts: `brnDataGrid` owns the state and fetching, the spartan table
 * directives style the markup, and the helm column filter and pager are dropped in where needed.
 */
@Component({
	selector: 'spartan-data-grid-composed-preview',
	imports: [
		...BrnDataGridImports,
		...HlmTableImports,
		...HlmButtonImports,
		...HlmSkeletonImports,
		HlmDataGridColumnFilter,
		HlmDataGridPagination,
		FlexRender,
	],
	host: { class: 'w-full' },
	template: `
		<div hlmTableContainer>
			<table
				hlmTable
				brnDataGrid
				#grid="brnDataGrid"
				[adapter]="adapter"
				[features]="features"
				[columns]="columns"
				[initial]="{ pageSize: 5 }"
			>
				<thead hlmTHead>
					@for (headerGroup of grid.table.getHeaderGroups(); track headerGroup.id) {
						<tr hlmTr>
							@for (header of headerGroup.headers; track header.id) {
								<th hlmTh [attr.aria-sort]="_ariaSort(header.column.getIsSorted())">
									<div class="flex items-center gap-1">
										<button
											hlmBtn
											variant="ghost"
											size="sm"
											(click)="header.column.toggleSorting(undefined, $event.shiftKey)"
										>
											<ng-container *flexRenderHeader="header; let text">{{ text }}</ng-container>
											{{ _sortIcon(header.column.getIsSorted()) }}
										</button>
										<hlm-data-grid-column-filter [column]="header.column" />
									</div>
								</th>
							}
						</tr>
					}
				</thead>
				<tbody hlmTBody>
					@for (row of grid.table.getRowModel().rows; track row.id) {
						<tr hlmTr>
							@for (cell of row.getVisibleCells(); track cell.id) {
								<td hlmTd>
									<ng-container *flexRenderCell="cell; let text">{{ text }}</ng-container>
								</td>
							}
						</tr>
					} @empty {
						<tr hlmTr>
							<td hlmTd [attr.colspan]="grid.table.getAllLeafColumns().length" class="h-24 text-center">
								@if (grid.loading()) {
									<hlm-skeleton class="h-8" />
								} @else {
									No results.
								}
							</td>
						</tr>
					}
				</tbody>
			</table>
		</div>
		<hlm-data-grid-pagination [table]="grid.table" [pageSizeOptions]="[5, 10]" />
	`,
})
export class DataGridComposedPreview {
	public readonly adapter = createEmployeeAdapter();
	public readonly features = employeeFeatures;
	public readonly columns = employeeColumns;

	protected _ariaSort(sorted: false | 'asc' | 'desc'): 'none' | 'ascending' | 'descending' {
		return sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none';
	}

	protected _sortIcon(sorted: false | 'asc' | 'desc'): string {
		return sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '';
	}
}
