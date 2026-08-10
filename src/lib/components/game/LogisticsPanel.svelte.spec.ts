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

	it('keeps recurring endpoint quote fields editable and retains updated values', async () => {
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

	it('invokes edit, reprioritize, pause, and remove route callbacks', async () => {
		expect.assertions(4);
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
	});

	it('invokes resume route callback from the paused view', async () => {
		expect.assertions(1);
		const fixture = routePanelFixture();
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

	it('rejects a manual transfer with an empty quantity before dispatching', async () => {
		expect.assertions(2);
		const onDispatchManualTransfer = vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		);
		renderPanel({ onDispatchManualTransfer });

		await page.getByLabelText('Quantity').fill('');
		await page.getByRole('button', { name: /dispatch transfer/i }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(/positive whole-number quantity/i);
		expect(onDispatchManualTransfer).not.toHaveBeenCalled();
	});

	it('surfaces an insufficient-cash quote rejection without dispatching', async () => {
		expect.assertions(2);
		const onDispatchManualTransfer = vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		);
		const game = { ...createTwoIndustryCityGame(), cash: 1 };
		const i18n = createI18n('en');
		renderPanel({
			game,
			view: buildLogisticsPanelView(game, i18n),
			i18n,
			onDispatchManualTransfer
		});

		await page.getByLabelText('Material').nth(0).selectOptions('water');
		await page.getByRole('button', { name: /dispatch transfer/i }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(/insufficient cash for this transport cost/i);
		expect(onDispatchManualTransfer).not.toHaveBeenCalled();
	});

	it('reports a capacity validation failure', async () => {
		expect.assertions(1);
		renderPanel();

		await page.getByLabelText('Capacity per dispatch').fill('');
		await page.getByRole('button', { name: /create route/i }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(/positive whole-number capacity/i);
	});

	it('reports a frequency validation failure', async () => {
		expect.assertions(1);
		renderPanel();

		await page.getByLabelText('Frequency (days)').fill('');
		await page.getByRole('button', { name: /create route/i }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(/positive whole-number frequency/i);
	});

	it('reports a lead-time validation failure', async () => {
		expect.assertions(1);
		renderPanel();

		await page.getByLabelText(/lead time/i).fill('');
		await page.getByRole('button', { name: /create route/i }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(/positive whole-number lead time/i);
	});

	it('reports a transport-cost validation failure', async () => {
		expect.assertions(1);
		renderPanel();

		await page.getByLabelText(/cost per unit/i).fill('');
		await page.getByRole('button', { name: /create route/i }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(/positive whole-number transport cost/i);
	});

	it('reports a priority validation failure', async () => {
		expect.assertions(1);
		renderPanel();

		await page.getByLabelText('Priority').nth(0).fill('');
		await page.getByRole('button', { name: /create route/i }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(/non-negative whole-number priority/i);
	});

	it('maps a busy result status to status copy', async () => {
		expect.assertions(1);
		const busyFn = vi.fn(async () => ({ status: 'busy' }) as const);
		renderPanel({ onCreateRecurringRoute: busyFn });
		await page.getByRole('button', { name: /create route/i }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent(/already in progress/i);
	});

	it('maps an unavailable result status to status copy', async () => {
		expect.assertions(1);
		const unavailableFn = vi.fn(async () => ({ status: 'unavailable' }) as const);
		renderPanel({ onCreateRecurringRoute: unavailableFn });
		await page.getByRole('button', { name: /create route/i }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent(/unavailable in this mode/i);
	});

	it('maps an unchanged result status to status copy', async () => {
		expect.assertions(1);
		const unchangedFn = vi.fn(async () => ({ status: 'unchanged' }) as const);
		renderPanel({ onCreateRecurringRoute: unchangedFn });
		await page.getByRole('button', { name: /create route/i }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(/no logistics changes were made/i);
	});

	it('maps a committed result status to the route-created copy', async () => {
		expect.assertions(1);
		const committedFn = vi.fn(async () => ({ status: 'committed' }) as const);
		renderPanel({ onCreateRecurringRoute: committedFn });
		await page.getByRole('button', { name: /create route/i }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent(/recurring route created/i);
	});

	it('treats a sandbox-committed result with no changes as unchanged', async () => {
		expect.assertions(1);
		const noChangeFn = vi.fn(
			async () => ({ status: 'sandbox-committed', changed: false }) as const
		);
		renderPanel({ onCreateRecurringRoute: noChangeFn });
		await page.getByRole('button', { name: /create route/i }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(/no logistics changes were made/i);
	});

	it('cancels an edit and restores the create-route button label', async () => {
		expect.assertions(2);
		const fixture = routePanelFixture();
		renderPanel({ game: fixture.game, view: fixture.view });

		await page.getByRole('button', { name: /edit route/i }).click();
		await expect.element(page.getByRole('button', { name: /save route changes/i })).toBeVisible();
		await page.getByRole('button', { name: /cancel edit/i }).click();
		await expect.element(page.getByRole('button', { name: /create route/i })).toBeVisible();
	});

	it('clears the editing session and priority buffer when the edited route is removed', async () => {
		expect.assertions(2);
		const fixture = routePanelFixture();
		const onRemoveRecurringRoute = vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		);
		renderPanel({
			game: fixture.game,
			view: fixture.view,
			onRemoveRecurringRoute
		});

		await page.getByRole('button', { name: /edit route/i }).click();
		await page.getByRole('button', { name: /remove route/i }).click();
		expect(onRemoveRecurringRoute).toHaveBeenCalledWith(fixture.route.id);
		await expect.element(page.getByRole('button', { name: /create route/i })).toBeVisible();
	});

	it('rejects reprioritization with a non-numeric priority value', async () => {
		expect.assertions(2);
		const fixture = routePanelFixture();
		const onReprioritizeRecurringRoute = vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		);
		renderPanel({
			game: fixture.game,
			view: fixture.view,
			onReprioritizeRecurringRoute
		});

		await page.getByLabelText('Priority').nth(1).fill('');
		await page.getByRole('button', { name: /save priority/i }).click();
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(/non-negative whole-number priority/i);
		expect(onReprioritizeRecurringRoute).not.toHaveBeenCalled();
	});

	it('surfaces a busy result from changeRouteState as status copy', async () => {
		expect.assertions(1);
		const fixture = routePanelFixture();
		const onPauseRecurringRoute = vi.fn(async () => ({ status: 'busy' }) as const);
		renderPanel({ game: fixture.game, view: fixture.view, onPauseRecurringRoute });

		await page.getByRole('button', { name: /pause route/i }).click();
		await expect.element(page.getByRole('status')).toHaveTextContent(/already in progress/i);
	});

	it('renders the disabled reason copy when mutations are not allowed', async () => {
		expect.assertions(2);
		const game = createTwoIndustryCityGame();
		const i18n = createI18n('en');
		renderPanel({
			game,
			view: buildLogisticsPanelView(game, i18n),
			i18n,
			canMutate: false,
			disabledReason: 'Logistics are locked in this challenge.'
		});

		await expect.element(page.getByText('Logistics are locked in this challenge.')).toBeVisible();
		await expect.element(page.getByRole('button', { name: /dispatch transfer/i })).toBeDisabled();
	});

	it('does not dispatch when canMutate is false even if the form is submitted', async () => {
		expect.assertions(1);
		const onDispatchManualTransfer = vi.fn(
			async () => ({ status: 'sandbox-committed', changed: true }) as const
		);
		const game = createTwoIndustryCityGame();
		const i18n = createI18n('en');
		renderPanel({
			game,
			view: buildLogisticsPanelView(game, i18n),
			i18n,
			canMutate: false,
			disabledReason: 'Locked.',
			onDispatchManualTransfer
		});

		const dispatchButton = page.getByRole('button', { name: /dispatch transfer/i }).element();
		(dispatchButton as HTMLButtonElement).dispatchEvent(
			new SubmitEvent('submit', { bubbles: true, cancelable: true })
		);
		expect(onDispatchManualTransfer).not.toHaveBeenCalled();
	});

	it('focuses and scrolls the route row into view when focusedRouteId is set', async () => {
		const fixture = routePanelFixture();
		const i18n = createI18n('en');
		renderPanel({
			game: fixture.game,
			view: buildLogisticsPanelView(fixture.game, i18n),
			i18n,
			focusedRouteId: fixture.route.id
		});

		await vi.waitFor(() => {
			const row = document.getElementById(`logistics-route-${fixture.route.id}`);
			expect(row).not.toBeNull();
			expect(row).toBe(document.activeElement);
		});
	});
});
