import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import { createRecurringRoute, quoteInterCityRates } from '$lib/game/interCityLogistics';
import { createTwoIndustryCityGame } from '$lib/game/interCityLogistics.testUtils';
import type { GameRouteCommitResult } from '$lib/game/commandResult';
import { buildLogisticsPanelView } from './logisticsPanel';
import LogisticsPanel from './LogisticsPanel.svelte';

function renderPanel(overrides: Record<string, unknown> = {}) {
	const game = createTwoIndustryCityGame();
	const i18n = createI18n('en');
	const props = {
		game,
		view: buildLogisticsPanelView(game, i18n),
		i18n,
		canMutate: true,
		disabledReason: null,
		focusedRouteId: null,
		onDispatchManualTransfer: vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		),
		onCreateRecurringRoute: vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		),
		onUpdateRecurringRoute: vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		),
		onPauseRecurringRoute: vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		),
		onResumeRecurringRoute: vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		),
		onReprioritizeRecurringRoute: vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		),
		onRemoveRecurringRoute: vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		),
		...overrides
	};
	render(LogisticsPanel, props);
	return props;
}

function routePanelFixture() {
	const game = createTwoIndustryCityGame();
	const result = createRecurringRoute(game, {
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		capacity: 12,
		frequencyDays: 3,
		leadTimeDays: 2,
		transportCostPerUnit: 2,
		priority: 1
	});
	if (!result.ok) throw new Error(`fixture route failed: ${result.reason}`);
	const i18n = createI18n('en');
	return {
		game: result.game,
		view: buildLogisticsPanelView(result.game, i18n),
		route: result.route,
		i18n
	};
}

describe('LogisticsPanel', () => {
	it('submits a quoted manual transfer through the explicit callback', async () => {
		expect.assertions(2);
		const props = renderPanel();

		await page.getByLabelText('Material').nth(0).selectOptions('water');
		await page.getByRole('button', { name: /dispatch transfer/i }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent(/Lead time|transport cost/i);
		expect(props.onDispatchManualTransfer).toHaveBeenCalledOnce();
	});

	it('renders a rejected command inline and does not add a history row', async () => {
		expect.assertions(2);
		const onDispatchManualTransfer = vi.fn(
			async (): Promise<GameRouteCommitResult> => ({
				status: 'logistics-rejected',
				reason: 'insufficient-origin-stock'
			})
		);
		const props = renderPanel({ onDispatchManualTransfer });

		await page.getByRole('button', { name: /dispatch transfer/i }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent(/not enough origin stock/i);
		expect(props.view.recentTransfers).toHaveLength(0);
	});

	it('keeps recurring endpoint quote fields editable and invokes route actions', async () => {
		expect.assertions(4);
		renderPanel();

		const leadTime = page.getByLabelText(/lead time/i);
		const cost = page.getByLabelText(/cost per unit/i);
		await expect.element(leadTime).toHaveValue(2);
		await expect.element(cost).toHaveValue(2);
		await leadTime.fill('5');
		await cost.fill('7');
		await expect.element(leadTime).toHaveValue(5);
		await expect.element(cost).toHaveValue(7);
	});

	it('reseeds both recurring quote fields when an endpoint changes', async () => {
		expect.assertions(4);
		renderPanel();
		const quote = quoteInterCityRates('breadbasket-basin', 'industry-city');
		if (!quote) throw new Error('expected a quote for the test endpoints');

		const leadTime = page.getByLabelText(/lead time/i);
		const cost = page.getByLabelText(/cost per unit/i);
		await leadTime.fill('5');
		await cost.fill('7');
		await page.getByLabelText('Origin city').nth(1).selectOptions('breadbasket-basin');
		await page.getByLabelText('Destination city').nth(1).selectOptions('industry-city');

		await expect.element(leadTime).toHaveValue(quote.leadTimeDays);
		await expect.element(cost).toHaveValue(quote.transportCostPerUnit);
		await expect.element(leadTime).not.toHaveValue(5);
		await expect.element(cost).not.toHaveValue(7);
	});

	it('reports same-city before validating cleared quote fields', async () => {
		expect.assertions(1);
		renderPanel();

		await page.getByLabelText('Origin city').nth(1).selectOptions('breadbasket-basin');
		await page.getByRole('button', { name: /create route/i }).click();

		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(/origin and destination must be different cities/i);
	});

	it('invokes create route callback', async () => {
		expect.assertions(1);
		const props = renderPanel();
		await page.getByRole('button', { name: /create route/i }).click();
		expect(props.onCreateRecurringRoute).toHaveBeenCalledOnce();
	});

	it('hides the create-only priority field while editing a route', async () => {
		expect.assertions(1);
		const fixture = routePanelFixture();
		renderPanel({ game: fixture.game, view: fixture.view });

		await page.getByRole('button', { name: /edit route/i }).click();
		expect(document.querySelector('#logistics-route-priority')).toBeNull();
	});

	it('uses the localized associated label for route priority controls', async () => {
		expect.assertions(1);
		const fixture = routePanelFixture();
		const i18n = createI18n('ja');
		renderPanel({
			game: fixture.game,
			view: buildLogisticsPanelView(fixture.game, i18n),
			i18n
		});
		await page.getByRole('button', { name: /航路を編集/ }).click();

		await expect
			.element(page.getByRole('spinbutton', { name: '優先度', exact: true }))
			.toBeInTheDocument();
	});

	it('invokes edit, reprioritize, pause, resume, and remove route callbacks', async () => {
		expect.assertions(5);
		const fixture = routePanelFixture();
		const onUpdateRecurringRoute = vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		);
		const onReprioritizeRecurringRoute = vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		);
		const onPauseRecurringRoute = vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		);
		const onRemoveRecurringRoute = vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		);
		renderPanel({
			game: fixture.game,
			view: fixture.view,
			onUpdateRecurringRoute,
			onReprioritizeRecurringRoute,
			onPauseRecurringRoute,
			onRemoveRecurringRoute
		});

		await page.getByRole('button', { name: /edit route/i }).click();
		await page.getByLabelText('Capacity per dispatch').fill('14');
		await page.getByRole('button', { name: /save route changes/i }).click();
		expect(onUpdateRecurringRoute).toHaveBeenCalledWith(
			fixture.route.id,
			expect.objectContaining({ capacity: 14 })
		);

		await page.getByLabelText('Priority').nth(1).fill('3');
		await page.getByRole('button', { name: /save priority/i }).click();
		expect(onReprioritizeRecurringRoute).toHaveBeenCalledWith(fixture.route.id, 3);
		await page.getByRole('button', { name: /pause route/i }).click();
		expect(onPauseRecurringRoute).toHaveBeenCalledWith(fixture.route.id);
		await page.getByRole('button', { name: /remove route/i }).click();
		expect(onRemoveRecurringRoute).toHaveBeenCalledWith(fixture.route.id);

		const pausedView = {
			...fixture.view,
			routes: fixture.view.routes.map((route) => ({
				...route,
				state: 'paused' as const,
				stateLabel: 'Paused'
			}))
		};
		const onResumeRecurringRoute = vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		);
		renderPanel({ game: fixture.game, view: pausedView, onResumeRecurringRoute });
		await page.getByRole('button', { name: /resume route/i }).click();
		expect(onResumeRecurringRoute).toHaveBeenCalledWith(fixture.route.id);
	});
});
