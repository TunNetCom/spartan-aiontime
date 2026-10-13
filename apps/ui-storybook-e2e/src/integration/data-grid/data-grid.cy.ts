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

describe('data-grid--with-filters', () => {
	beforeEach(() => {
		cy.visit('/iframe.html?id=data-grid--with-filters');
		cy.get('data-grid-filterable-story').should('exist');
	});

	it('renders a sortable header with aria-sort and a filter control per type', () => {
		cy.get('data-grid-filterable-story').within(() => {
			cy.get('thead th').contains('Name').should('have.attr', 'aria-sort', 'none');
			cy.get('[data-slot="data-grid-sort"]').should('have.length.at.least', 6);
			cy.get('[data-slot="data-grid-filter"][data-column="email"]').should('exist');
			cy.get('[data-slot="data-grid-filter"][data-column="age"]').should('exist');
			cy.get('[data-slot="data-grid-filter"][data-column="created"]').should('exist');
			cy.get('[data-slot="data-grid-filter"][data-column="active"]').should('exist');
			cy.get('[data-slot="data-grid-filter"][data-column="status"]').should('exist');
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

	it('filters text with an operator and narrows the rows', () => {
		cy.get('data-grid-filterable-story').within(() => {
			cy.get('[data-slot="data-grid-filter"][data-column="email"] [data-slot="data-grid-value"]').type('example');
			cy.contains('GET /api/users?').should('contain', 'filter');
			cy.get('[data-slot="data-grid-filter"][data-column="email"] [data-slot="data-grid-operator"] select').select(
				'startsWith',
			);
			cy.contains('GET /api/users?').should('contain', 'startsWith');
		});
	});

	it('ranges numbers and picks booleans and select options', () => {
		cy.get('data-grid-filterable-story').within(() => {
			cy.get('[data-slot="data-grid-filter"][data-column="age"] [data-slot="data-grid-value-from"]').type('20');
			cy.get('[data-slot="data-grid-filter"][data-column="age"] [data-slot="data-grid-value-to"]').type('60');
			cy.contains('GET /api/users?').should('contain', 'gte');
			cy.get('[data-slot="data-grid-filter"][data-column="active"] [data-slot="data-grid-value"] select').select(
				'true',
			);
			cy.contains('GET /api/users?').should('contain', 'active');
			cy.get('[data-slot="data-grid-filter"][data-column="status"] [data-slot="data-grid-value"] select').select(
				'open',
			);
			cy.contains('GET /api/users?').should('contain', 'status');
		});
	});

	it('searches globally and manages active-filter chips', () => {
		cy.get('data-grid-filterable-story').within(() => {
			cy.get('[data-slot="data-grid-filter"][data-column="email"] [data-slot="data-grid-value"]').type('example');
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
