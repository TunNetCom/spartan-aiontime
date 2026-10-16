describe('data-grid--rest', () => {
	describe('rest', () => {
		beforeEach(() => {
			cy.visit('/iframe.html?id=data-grid--rest');
			cy.get('data-grid-rest-story').should('exist');
		});

		it('renders rows with aria-busy and aria-live regions', () => {
			cy.get('data-grid-rest-story').within(() => {
				cy.contains('42 row(s)').should('exist');
				cy.get('table').should('have.attr', 'aria-busy');
				cy.get('[data-slot="data-grid-status"]').should('have.attr', 'aria-live', 'polite');
			});
		});

		it('paginates to page 2 and shows the next rows', () => {
			cy.get('data-grid-rest-story').within(() => {
				cy.get('tbody tr')
					.first()
					.invoke('text')
					.then((firstPage) => {
						cy.findByRole('button', { name: /^next$/i }).click();
						cy.get('tbody tr')
							.first()
							.invoke('text')
							.should((secondPage) => {
								expect(secondPage).not.to.equal(firstPage);
							});
						cy.contains('GET /api/users?').should('contain', 'page=2');
					});
			});
		});

		it('toggles email sort and reorders rows', () => {
			cy.get('data-grid-rest-story').within(() => {
				cy.findByRole('button', { name: /sort by email/i }).click();
				cy.contains('GET /api/users?').should('contain', 'sortBy=email');
				cy.get('tbody tr')
					.first()
					.invoke('text')
					.then((ascending) => {
						cy.findByRole('button', { name: /sort by email/i }).click();
						cy.contains('GET /api/users?').should('contain', 'sortDir=desc');
						cy.get('tbody tr')
							.first()
							.invoke('text')
							.should((descending) => {
								expect(descending).not.to.equal(ascending);
							});
					});
			});
		});

		it('sends the filter query when typing', () => {
			cy.get('data-grid-rest-story').within(() => {
				cy.findByPlaceholderText(/filter emails/i).type('ada');
				cy.contains('GET /api/users?').should('contain', 'filter');
			});
		});
	});
});

describe('data-grid--loading', () => {
	it('announces busy state with a skeleton while rows never resolve', () => {
		cy.visit('/iframe.html?id=data-grid--loading');
		cy.get('data-grid-loading-story').should('exist');
		cy.get('data-grid-loading-story').within(() => {
			cy.get('table').should('have.attr', 'aria-busy', 'true');
			cy.get('tbody hlm-skeleton').should('exist');
			cy.get('[data-slot="data-grid-status"]').should('contain', 'Loading');
		});
	});
});

describe('data-grid--empty', () => {
	it('shows the empty message with a colspan derived from the columns', () => {
		cy.visit('/iframe.html?id=data-grid--empty');
		cy.get('data-grid-empty-story').should('exist');
		cy.get('data-grid-empty-story').within(() => {
			cy.get('tbody').should('contain', 'No results.');
			cy.get('table').should('have.attr', 'aria-busy', 'false');
			// Two columns -> colspan 2 (was hardcoded to 99).
			cy.get('tbody td[colspan]').should('have.attr', 'colspan', '2');
			cy.get('[role="alert"]').should('not.exist');
		});
	});
});

describe('data-grid--error', () => {
	it('shows the styled alert with a retry button', () => {
		cy.visit('/iframe.html?id=data-grid--error-state');
		cy.get('data-grid-error-story').should('exist');
		cy.get('data-grid-error-story').within(() => {
			cy.get('[role="alert"]').should('contain', 'Failed to load.');
			cy.findByRole('button', { name: /^retry$/i }).should('exist');
			cy.get('tbody').should('not.contain', 'No results.');
		});
	});
});

/** Opens a column's filter popover; the panel renders in the CDK overlay, outside the story host. */
const openFilter = (column: string) => {
	cy.get(`[data-slot="data-grid-filter"][data-column="${column}"] [data-slot="data-grid-filter-trigger"]`).click();
	return cy.get('.cdk-overlay-container [data-slot="data-grid-filter-panel"]').last();
};

describe('data-grid--with-filters', () => {
	beforeEach(() => {
		cy.visit('/iframe.html?id=data-grid--with-filters');
		cy.get('data-grid-filterable-story').should('exist');
	});

	it('renders a sortable header with aria-sort and a filter button per filterable column', () => {
		cy.get('data-grid-filterable-story').within(() => {
			cy.get('thead th').contains('Name').should('have.attr', 'aria-sort', 'none');
			cy.get('[data-slot="data-grid-sort"]').should('have.length.at.least', 6);
			for (const column of ['name', 'email', 'age', 'created', 'active', 'status']) {
				cy.get(`[data-slot="data-grid-filter"][data-column="${column}"] [data-slot="data-grid-filter-trigger"]`).should(
					'exist',
				);
			}
		});
	});

	it('sorts through the header button and announces the direction', () => {
		cy.get('data-grid-filterable-story').within(() => {
			cy.get('thead th').contains('Name').parents('th').find('[data-slot="data-grid-sort"]').click();
			cy.get('thead th').contains('Name').should('have.attr', 'aria-sort', 'ascending');
			cy.contains('GET /api/users?').should('contain', 'sortBy=name');
			cy.get('thead th').contains('Name').parents('th').find('[data-slot="data-grid-sort"]').click();
			cy.get('thead th').contains('Name').should('have.attr', 'aria-sort', 'descending');
			cy.contains('GET /api/users?').should('contain', 'sortDir=desc');
		});
	});

	it('multi-sorts with shift-click and shows the sort order', () => {
		cy.get('data-grid-filterable-story').within(() => {
			cy.get('thead th').contains('Name').parents('th').find('[data-slot="data-grid-sort"]').click();
			cy.get('thead th').contains('Email').parents('th').find('[data-slot="data-grid-sort"]').click({ shiftKey: true });
			cy.contains('GET /api/users?').should('contain', 'sort=');
			cy.get('[data-slot="data-grid-sort-index"]').should('exist');
		});
	});

	it('filters text through the popover only on Apply', () => {
		openFilter('email').within(() => {
			cy.get('[data-slot="data-grid-operator"] select').select('startsWith');
			cy.get('input[data-slot="data-grid-value"]').type('a');
		});
		cy.contains('GET /api/users?').should('not.contain', 'filter');
		cy.get('[data-slot="data-grid-filter-panel"] [data-slot="data-grid-filter-apply"]').last().click();
		cy.contains('GET /api/users?').should('contain', 'startsWith');
		cy.get('[data-slot="data-grid-filter"][data-column="email"] [data-slot="data-grid-filter-trigger"]').should(
			'have.attr',
			'data-active',
			'true',
		);
	});

	it('ranges numbers', () => {
		openFilter('age').within(() => {
			cy.get('[data-slot="data-grid-value-from"]').type('20');
			cy.get('[data-slot="data-grid-value-to"]').type('60');
			cy.get('[data-slot="data-grid-filter-apply"]').click();
		});
		cy.contains('GET /api/users?').should('contain', 'gte').and('contain', 'lte');
	});

	it('picks booleans and several select options', () => {
		openFilter('active').within(() => {
			cy.get('[data-slot="data-grid-value"] select').select('true');
			cy.get('[data-slot="data-grid-filter-apply"]').click();
		});
		cy.contains('GET /api/users?').should('contain', 'active');
		cy.get('body').type('{esc}');

		openFilter('status').within(() => {
			cy.get('[data-slot="data-grid-operator"] select').select('in');
			cy.get('[data-slot="data-grid-value-set"] [role="checkbox"]').eq(0).click();
			cy.get('[data-slot="data-grid-value-set"] [role="checkbox"]').eq(1).click();
			cy.get('[data-slot="data-grid-filter-apply"]').click();
		});
		cy.contains('GET /api/users?').should('contain', 'status').and('contain', 'open%2Cclosed');
	});

	it('combines two conditions in Advanced mode', () => {
		openFilter('name').within(() => {
			cy.contains('button', 'Advanced').click();
			cy.get('input[data-slot="data-grid-value"]').eq(0).type('a');
			cy.contains('[data-slot="data-grid-filter-logic"] button', 'Or').click();
			cy.get('input[data-slot="data-grid-value"]').eq(1).type('e');
			cy.get('[data-slot="data-grid-filter-apply"]').click();
		});
		cy.contains('GET /api/users?').should('contain', 'logic%5D=or');
	});

	it('clears a column filter from its popover', () => {
		openFilter('email').within(() => {
			cy.get('input[data-slot="data-grid-value"]').type('example');
			cy.get('[data-slot="data-grid-filter-apply"]').click();
		});
		cy.contains('GET /api/users?').should('contain', 'filter');
		cy.get('[data-slot="data-grid-filter-panel"] [data-slot="data-grid-filter-clear"]').last().click();
		cy.contains('GET /api/users?').should('not.contain', 'filter');
	});

	it('searches globally and manages active-filter chips', () => {
		openFilter('email').within(() => {
			cy.get('input[data-slot="data-grid-value"]').type('example');
			cy.get('[data-slot="data-grid-filter-apply"]').click();
		});
		cy.get('body').type('{esc}');
		cy.get('data-grid-filterable-story').within(() => {
			cy.get('[data-slot="data-grid-search"] input').type('open');
			cy.contains('GET /api/users?').should('contain', 'q=open');
			cy.get('[data-slot="data-grid-chip"]').should('have.length.at.least', 2);
			cy.get('[data-slot="data-grid-chip"] button').first().click();
			cy.get('[data-slot="data-grid-clear"]').click();
			cy.contains('GET /api/users?').should('not.contain', 'q=open');
			cy.contains('GET /api/users?').should('not.contain', 'filter');
		});
	});
});

describe('data-grid--sorted', () => {
	it('loads with the pre-applied sort announced on the header', () => {
		cy.visit('/iframe.html?id=data-grid--sorted');
		cy.get('data-grid-sorted-story').should('exist');
		cy.get('data-grid-sorted-story').within(() => {
			cy.get('thead th').contains('Email').should('have.attr', 'aria-sort', 'ascending');
			cy.contains('GET /api/users?').should('contain', 'sortBy=email');
		});
	});
});

describe('data-grid--combined', () => {
	it('loads sorted, filtered and searched with chips and a clear-all action', () => {
		cy.visit('/iframe.html?id=data-grid--combined');
		cy.get('data-grid-combined-story').should('exist');
		cy.get('data-grid-combined-story').within(() => {
			cy.get('thead th').contains('Age').should('have.attr', 'aria-sort', 'descending');
			cy.get('[data-slot="data-grid-chip"]').should('have.length.at.least', 3);
			cy.contains('GET /api/users?').should('contain', 'filter');
			cy.get('[data-slot="data-grid-clear"]').click();
			cy.get('[data-slot="data-grid-chip"]').should('not.exist');
		});
	});
});

describe('data-grid--advanced-filters', () => {
	it('loads a two-condition group and reopens it in Advanced mode', () => {
		cy.visit('/iframe.html?id=data-grid--advanced-filters');
		cy.get('data-grid-advanced-filters-story').should('exist');
		cy.contains('GET /api/users?').should('contain', 'logic%5D=or');
		openFilter('status').within(() => {
			cy.get('[data-slot="data-grid-filter-logic"]').should('exist');
			cy.get('[data-slot="data-grid-operator"] select').should('have.length', 2);
		});
	});
});

describe('data-grid--localized', () => {
	it('renders the texts and operator labels it is given', () => {
		cy.visit('/iframe.html?id=data-grid--localized');
		cy.get('data-grid-localized-story').should('exist');
		cy.get('[data-slot="data-grid-search"] input').should('have.attr', 'placeholder', 'Rechercher…');
		openFilter('name').within(() => {
			cy.get('[data-slot="data-grid-operator"] option').should('contain', 'contient');
		});
	});
});

describe('data-grid--programmatic', () => {
	beforeEach(() => {
		cy.visit('/iframe.html?id=data-grid--programmatic');
		cy.get('data-grid-programmatic-story').should('exist');
	});

	it('writes filters and sorting through the table API', () => {
		cy.get('[data-testid="adults"]').click();
		cy.contains('GET /api/users?').should('contain', 'filter%5Bage%5D%5Bgte%5D=30');
		cy.get('[data-testid="open"]').click();
		cy.contains('GET /api/users?').should('contain', 'filter%5Bstatus%5D%5Bequals%5D=open');
		cy.get('[data-testid="oldest"]').click();
		cy.contains('GET /api/users?').should('contain', 'sortBy=age').and('contain', 'sortDir=desc');
		cy.get('thead th').contains('Age').should('have.attr', 'aria-sort', 'descending');
	});

	it('pages and resets through the table API', () => {
		cy.get('[data-testid="page-2"]').click();
		cy.contains('GET /api/users?').should('contain', 'page=2');
		cy.get('[data-testid="adults"]').click();
		cy.get('[data-testid="reset"]').click();
		cy.contains('GET /api/users?').should('contain', 'page=1').and('not.contain', 'filter');
	});
});

describe('data-grid--composed', () => {
	beforeEach(() => {
		cy.visit('/iframe.html?id=data-grid--composed');
		cy.get('data-grid-composed-story').should('exist');
	});

	it('renders rows from brnDataGrid on a spartan table', () => {
		cy.get('data-grid-composed-story').within(() => {
			cy.get('table[brndatagrid]').should('have.attr', 'aria-busy', 'false');
			cy.get('tbody tr').should('have.length', 5);
			cy.get('[data-slot="data-grid-page"]').should('contain', 'Page 1 of');
		});
	});

	it('sorts, filters and pages with the composed parts', () => {
		cy.get('data-grid-composed-story').within(() => {
			cy.get('thead th').contains('Name').parents('th').find('[data-testid="sort"]').click();
			cy.get('thead th').contains('Name').parents('th').should('have.attr', 'aria-sort', 'ascending');
			cy.get('[data-slot="data-grid-next"]').click();
			cy.get('[data-slot="data-grid-page"]').should('contain', 'Page 2 of');
		});
		openFilter('name').within(() => {
			cy.get('input[data-slot="data-grid-value"]').type('zzzz-no-match');
			cy.get('[data-slot="data-grid-filter-apply"]').click();
		});
		cy.get('data-grid-composed-story tbody tr').should('have.length', 0);
	});
});

describe('data-grid--minimal', () => {
	it('renders without sort, filter or search when those features are not registered', () => {
		cy.visit('/iframe.html?id=data-grid--minimal');
		cy.get('data-grid-minimal-story').should('exist');
		cy.get('data-grid-minimal-story').within(() => {
			cy.get('tbody tr').should('have.length', 10);
			cy.get('[data-slot="data-grid-sort"]').should('not.exist');
			cy.get('[data-slot="data-grid-filter-trigger"]').should('not.exist');
			cy.get('[data-slot="data-grid-search"]').should('not.exist');
			cy.get('[data-slot="data-grid-page"]').should('contain', 'Page 1 of 5');
		});
	});
});
