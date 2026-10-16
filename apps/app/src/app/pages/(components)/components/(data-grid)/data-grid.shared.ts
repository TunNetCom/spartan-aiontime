import { createRestAdapter, type BrnDataGridColumnMeta } from '@spartan-ng/brain/data-grid';
import {
	columnFilteringFeature,
	columnVisibilityFeature,
	createColumnHelper,
	filterFn_includesString,
	filterFn_weakEquals,
	globalFilteringFeature,
	rowPaginationFeature,
	rowSortingFeature,
	tableFeatures,
} from '@tanstack/angular-table';

export type Employee = {
	id: string;
	name: string;
	email: string;
	age: number;
	joined: string;
	active: boolean;
	role: 'engineer' | 'designer' | 'manager';
};

export const EMPLOYEES: Employee[] = [
	{
		id: '1',
		name: 'Ada Lovelace',
		email: 'ada@example.com',
		age: 36,
		joined: '2021-03-14',
		active: true,
		role: 'engineer',
	},
	{
		id: '2',
		name: 'Grace Hopper',
		email: 'grace@example.com',
		age: 85,
		joined: '2019-11-02',
		active: false,
		role: 'manager',
	},
	{
		id: '3',
		name: 'Alan Turing',
		email: 'alan@example.com',
		age: 41,
		joined: '2022-06-20',
		active: true,
		role: 'engineer',
	},
	{
		id: '4',
		name: 'Edsger Dijkstra',
		email: 'edsger@example.com',
		age: 72,
		joined: '2018-01-09',
		active: false,
		role: 'engineer',
	},
	{
		id: '5',
		name: 'Barbara Liskov',
		email: 'barbara@example.com',
		age: 54,
		joined: '2020-09-30',
		active: true,
		role: 'manager',
	},
	{
		id: '6',
		name: 'Donald Knuth',
		email: 'donald@example.com',
		age: 63,
		joined: '2023-02-11',
		active: true,
		role: 'engineer',
	},
	{
		id: '7',
		name: 'Susan Kare',
		email: 'susan@example.com',
		age: 47,
		joined: '2021-12-01',
		active: true,
		role: 'designer',
	},
	{
		id: '8',
		name: 'Margaret Hamilton',
		email: 'margaret@example.com',
		age: 58,
		joined: '2017-07-17',
		active: false,
		role: 'manager',
	},
	{
		id: '9',
		name: 'Dieter Rams',
		email: 'dieter@example.com',
		age: 69,
		joined: '2024-04-05',
		active: true,
		role: 'designer',
	},
	{
		id: '10',
		name: 'Katherine Johnson',
		email: 'katherine@example.com',
		age: 39,
		joined: '2022-10-23',
		active: true,
		role: 'engineer',
	},
	{
		id: '11',
		name: 'Paula Scher',
		email: 'paula@example.com',
		age: 44,
		joined: '2020-05-18',
		active: false,
		role: 'designer',
	},
	{
		id: '12',
		name: 'Ken Thompson',
		email: 'ken@example.com',
		age: 51,
		joined: '2019-08-27',
		active: true,
		role: 'engineer',
	},
];

export const employeeFeatures = tableFeatures({
	columnFilteringFeature,
	columnVisibilityFeature,
	globalFilteringFeature,
	rowPaginationFeature,
	rowSortingFeature,
	// Types `meta.filter` on every column, so no cast is needed in the column definitions.
	columnMeta: {} as BrnDataGridColumnMeta,
	// v9 resolves filter functions by name from this registry, and picks `weakEquals` before the first
	// page of rows arrives, so both the string and the empty-table fallback are registered.
	filterFns: { includesString: filterFn_includesString, weakEquals: filterFn_weakEquals },
});

const columnHelper = createColumnHelper<typeof employeeFeatures, Employee>();

/** One column per filter type: text, number, date, boolean and select. */
export const employeeColumns = [
	columnHelper.accessor('name', {
		header: 'Name',
		meta: { filter: { type: 'string', label: 'Name' } },
	}),
	columnHelper.accessor('age', {
		header: 'Age',
		meta: { filter: { type: 'number', label: 'Age' } },
	}),
	columnHelper.accessor('joined', {
		header: 'Joined',
		meta: { filter: { type: 'date', label: 'Joined' } },
	}),
	columnHelper.accessor('active', {
		header: 'Active',
		cell: (info) => (info.getValue() ? 'Yes' : 'No'),
		meta: { filter: { type: 'boolean', label: 'Active' } },
	}),
	columnHelper.accessor('role', {
		header: 'Role',
		meta: {
			filter: {
				type: 'select',
				label: 'Role',
				options: [
					{ label: 'Engineer', value: 'engineer' },
					{ label: 'Designer', value: 'designer' },
					{ label: 'Manager', value: 'manager' },
				],
			},
		},
	}),
];

type Check = (value: unknown, expected: string) => boolean;

/** The `filter[id][operator]` params the REST adapter sends, evaluated in memory. */
const CHECKS: Record<string, Check> = {
	contains: (value, expected) => String(value).toLowerCase().includes(expected.toLowerCase()),
	notContains: (value, expected) => !String(value).toLowerCase().includes(expected.toLowerCase()),
	startsWith: (value, expected) => String(value).toLowerCase().startsWith(expected.toLowerCase()),
	endsWith: (value, expected) => String(value).toLowerCase().endsWith(expected.toLowerCase()),
	equals: (value, expected) => String(value) === expected,
	notEquals: (value, expected) => String(value) !== expected,
	in: (value, expected) => expected.split(',').includes(String(value)),
	gt: (value, expected) => compare(value, expected) > 0,
	gte: (value, expected) => compare(value, expected) >= 0,
	lt: (value, expected) => compare(value, expected) < 0,
	lte: (value, expected) => compare(value, expected) <= 0,
	isEmpty: (value) => value === '' || value === null || value === undefined,
	notEmpty: (value) => !(value === '' || value === null || value === undefined),
	isNull: (value) => value === null || value === undefined,
	notNull: (value) => value !== null && value !== undefined,
};

function compare(value: unknown, expected: string): number {
	return typeof value === 'number' ? value - Number(expected) : String(value).localeCompare(expected);
}

/** Applies the REST query to the in-memory rows, as a backend would. */
function queryEmployees(params: URLSearchParams): { rows: Employee[]; total: number } {
	let rows = [...EMPLOYEES];
	// Plain filters (`filter[age][gte]=18`) are AND-ed; a two-condition group
	// (`filter[name][0][contains]=ada&filter[name][1][contains]=grace&filter[name][logic]=or`) follows its logic.
	const groups = new Map<string, { logic: string; checks: ((row: Employee) => boolean)[] }>();
	for (const [key, expected] of params) {
		const match = /^filter\[(\w+)\](?:\[(\d)\])?(?:\[(\w+)\])?$/.exec(key);
		if (!match || match[3] === 'case') continue;
		const [, field, index, operator = 'contains'] = match;
		if (operator === 'logic') {
			const group = groups.get(field) ?? { logic: 'and', checks: [] };
			groups.set(field, { ...group, logic: expected });
			continue;
		}
		const check = CHECKS[operator];
		if (!check) continue;
		const test = (row: Employee) => check(row[field as keyof Employee], expected);
		if (index === undefined) {
			rows = rows.filter(test);
		} else {
			const group = groups.get(field) ?? { logic: 'and', checks: [] };
			group.checks.push(test);
			groups.set(field, group);
		}
	}
	for (const { logic, checks } of groups.values()) {
		rows = rows.filter((row) => (logic === 'or' ? checks.some((c) => c(row)) : checks.every((c) => c(row))));
	}
	const q = params.get('q')?.toLowerCase();
	if (q) rows = rows.filter((row) => `${row.name} ${row.email}`.toLowerCase().includes(q));

	const sortBy = params.get('sortBy') as keyof Employee | null;
	if (sortBy) {
		const direction = params.get('sortDir') === 'desc' ? -1 : 1;
		rows.sort((a, b) => direction * compare(a[sortBy], String(b[sortBy])));
	}

	const page = Number(params.get('page') ?? '1') - 1;
	const pageSize = Number(params.get('pageSize') ?? '5');
	return { rows: rows.slice(page * pageSize, (page + 1) * pageSize), total: rows.length };
}

/** A REST adapter backed by the in-memory rows instead of a real endpoint. */
export function createEmployeeAdapter() {
	return createRestAdapter<Employee>({
		baseUrl: '/api/employees',
		fetchFn: async (url, signal) => {
			signal.throwIfAborted();
			return queryEmployees(new URLSearchParams(url.split('?')[1] ?? ''));
		},
	});
}
