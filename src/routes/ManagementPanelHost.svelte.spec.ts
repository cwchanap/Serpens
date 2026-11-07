import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	createTwoIndustryCityGame,
	withRecurringRoutes
} from '$lib/game/interCityLogistics.testUtils';
import { decisionContextCashPressure } from '$lib/game/decisionContext';
import { getStaffXpForLevel } from '$lib/game/staffLeveling';
import { buildDailyResultView } from '$lib/game/reports';
import { simulateDay } from '$lib/game/simulateDay';
import { createNewGame } from '$lib/game/state';
import type { DecisionItem, GameState, ProductId, RecurringRoute } from '$lib/game/types';
import type { GameRouteCommitResult } from '$lib/game/commandResult';
import type { RecurringRouteInput } from '$lib/game/interCityLogistics';
import { createI18n, type I18nBundle } from '$lib/i18n';
import type { ManagementPanelId } from '$lib/game/keyboardShortcuts';
import { createRoutePreviewGame } from './routePreviewGame';
import {
	createManagementUi,
	type ManagementUi,
	type ManagementUiCommands
} from './managementUi.svelte';
import { createMutationAvailability, type MutationAvailability } from './gameRouteController';
import ManagementPanelHost from './ManagementPanelHost.svelte';

vi.mock('$lib/game/financeMetrics', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/game/financeMetrics')>();
	return { ...original, getFinanceMetrics: vi.fn(original.getFinanceMetrics) };
});
vi.mock('$lib/components/game/logisticsPanel', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/components/game/logisticsPanel')>();
	return { ...original, buildLogisticsPanelView: vi.fn(original.buildLogisticsPanelView) };
});

interface HostProps {
	ui: ManagementUi;
	game: GameState | null;
	fallback: GameState;
	mode: 'sandbox' | 'scenario';
	i18n: I18nBundle;
	availability: MutationAvailability;
	disabledReason: string | null;
	commands: ManagementUiCommands;
	plannerProductIds: readonly ProductId[];
	onPlanProduct: (productId: ProductId) => void;
	onRouteRemoved: (routeId: string) => void;
}

function managementCommands(): ManagementUiCommands {
	const unavailable = async () => ({ status: 'unavailable' }) as GameRouteCommitResult;
	return {
		updatePolicy: vi.fn(unavailable),
		setPolicyOverride: vi.fn(unavailable),
		clearPolicyOverrideField: vi.fn(unavailable),
		resetPolicyOverrideScope: vi.fn(unavailable),
		setManagerDelegation: vi.fn(unavailable),
		removeManagerDelegation: vi.fn(unavailable),
		resolveDecision: vi.fn(unavailable),
		hireStaff: vi.fn(unavailable),
		assignStaff: vi.fn(unavailable),
		unassignStaff: vi.fn(unavailable),
		releaseStaff: vi.fn(unavailable),
		promoteStaff: vi.fn(unavailable),
		setRetailSupplySource: vi.fn(unavailable),
		borrowWorkingCapital: vi.fn(unavailable),
		repayFinanceLoan: vi.fn(unavailable),
		payOffFinanceLoan: vi.fn(unavailable),
		refinanceFinanceLoan: vi.fn(unavailable),
		dispatchManualTransfer: vi.fn(unavailable),
		createRecurringRoute: vi.fn(unavailable),
		updateRecurringRoute: vi.fn(unavailable),
		pauseRecurringRoute: vi.fn(unavailable),
		resumeRecurringRoute: vi.fn(unavailable),
		reprioritizeRecurringRoute: vi.fn(unavailable),
		removeRecurringRoute: vi.fn(unavailable)
	};
}

function compositionGame(): GameState {
	const baseGame = createNewGame('convenience', 20_260_808);
	const store = baseGame.stores[0]!;
	const sourceStaff = baseGame.staff[0]!;
	const promotionXp = getStaffXpForLevel(1);
	const decision: DecisionItem = {
		kind: 'system',
		id: 'host-cash-pressure',
		title: 'Cash pressure',
		context: decisionContextCashPressure(),
		expiresOnDay: 14,
		options: [
			{
				id: 'continue',
				label: 'Continue',
				description: 'Keep the current operating plan.'
			}
		]
	};

	return {
		...baseGame,
		day: 12,
		cash: 123_456,
		staff: [
			{
				...sourceStaff,
				id: 'host-assigned-staff',
				name: 'Assigned Host Staff',
				role: 'manager',
				assignedStoreId: store.id,
				level: 1,
				xp: promotionXp
			},
			{
				...sourceStaff,
				id: 'host-unassigned-staff',
				name: 'Unassigned Host Staff',
				role: 'manager',
				assignedStoreId: null,
				level: 1,
				xp: promotionXp
			}
		],
		decisions: [decision]
	};
}

function routeFixture(overrides: Partial<RecurringRoute> & { id: string }): RecurringRoute {
	return {
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		capacity: 30,
		frequencyDays: 3,
		leadTimeDays: 2,
		transportCostPerUnit: 2,
		priority: 1,
		state: 'active',
		nextDispatchOnDay: 0,
		...overrides
	};
}

function routesGame(): GameState {
	return withRecurringRoutes(createTwoIndustryCityGame(), [
		routeFixture({ id: 'route-1' }),
		routeFixture({
			id: 'route-2',
			originCityId: 'breadbasket-basin',
			destinationCityId: 'industry-city',
			materialId: 'grain'
		})
	]);
}

function mutationAvailability(overrides: Partial<MutationAvailability> = {}): MutationAvailability {
	return {
		...createMutationAvailability({ playMode: 'sandbox', pending: false, definition: null }),
		...overrides
	};
}

function hostProps(
	overrides: Partial<HostProps> & { openAt?: ManagementPanelId | null } = {}
): HostProps {
	const game = compositionGame();
	const i18n = createI18n('en');
	const ui = createManagementUi({ getI18n: () => i18n, onOpen: vi.fn() });
	const { openAt = 'dashboard', ...rest } = overrides;
	if (openAt) ui.open(openAt);
	return {
		ui,
		game,
		fallback: createRoutePreviewGame(),
		mode: 'sandbox',
		i18n,
		availability: mutationAvailability(),
		disabledReason: 'Unavailable in this challenge.',
		commands: managementCommands(),
		plannerProductIds: [],
		onPlanProduct: vi.fn(),
		onRouteRemoved: vi.fn(),
		...rest
	};
}

async function clickRouteRemoveButton(routeId: string): Promise<void> {
	await vi.waitFor(() => {
		const row = document.getElementById(`logistics-route-${routeId}`);
		const button = row?.querySelector<HTMLElement>('button[aria-label="Remove route"]');
		expect(button).toBeTruthy();
		button!.click();
	});
}

describe('ManagementPanelHost', () => {
	it('changes the report chart window from the tower header', async () => {
		let game = compositionGame();
		for (let day = 0; day < 20; day++) game = simulateDay(game);
		render(ManagementPanelHost, hostProps({ openAt: 'reports', game }));
		await expect.element(page.getByText('Days 18–31', { exact: true })).toBeVisible();
		const trend = page.getByTestId('revenue-trend');
		expect(trend.element().getAttribute('points')!.split(' ')).toHaveLength(14);
		const week = page.getByRole('button', { name: '7d', exact: true });
		expect(week.element().closest('.tower-header')).not.toBeNull();
		await week.click();
		await expect.element(page.getByText('Days 25–31', { exact: true })).toBeVisible();
		expect(trend.element().getAttribute('points')!.split(' ')).toHaveLength(7);
		await page.getByRole('button', { name: '30d', exact: true }).click();
		await expect.element(page.getByText('Days 12–31', { exact: true })).toBeVisible();
		expect(trend.element().getAttribute('points')!.split(' ')).toHaveLength(20);
	});

	it('keeps the report window within the host lifetime', async () => {
		expect.assertions(4);
		let game = compositionGame();
		for (let day = 0; day < 20; day++) game = simulateDay(game);
		const props = hostProps({ openAt: 'reports', game });

		const view = render(ManagementPanelHost, props);
		await page.getByRole('button', { name: '7d', exact: true }).click();
		await expect
			.element(page.getByRole('button', { name: '7d', exact: true }))
			.toHaveAttribute('aria-pressed', 'true');

		// Swapping panels keeps the host — and its reportDays — mounted.
		props.ui.open('dashboard');
		props.ui.open('reports');
		await expect
			.element(page.getByRole('button', { name: '7d', exact: true }))
			.toHaveAttribute('aria-pressed', 'true');

		// Closing unmounts the host; a fresh mount returns to the default 14.
		await view.unmount();
		render(ManagementPanelHost, props);
		await expect
			.element(page.getByRole('button', { name: '7d', exact: true }))
			.toHaveAttribute('aria-pressed', 'false');
		await expect
			.element(page.getByRole('button', { name: '14d', exact: true }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('switches tower panels without closing and leaves the active tab alone', async () => {
		expect.assertions(3);
		const props = hostProps({ openAt: 'dashboard' });
		render(ManagementPanelHost, props);

		const tabs = page.getByRole('navigation');
		await tabs.getByRole('button', { name: 'Dashboard', exact: true }).click();
		expect(props.ui.activePanelId).toBe('dashboard');
		await tabs.getByRole('button', { name: 'Reports', exact: true }).click();
		expect(props.ui.activePanelId).toBe('reports');
		await expect.element(page.getByRole('dialog', { name: 'Reports' })).toBeVisible();
	});

	it('keeps focus inside the dialog when a card action swaps the keyed panel', async () => {
		expect.assertions(3);
		const props = hostProps({ openAt: 'dashboard' });
		render(ManagementPanelHost, props);

		await page
			.getByTestId('daily-result')
			.getByRole('button', { name: 'Reports', exact: true })
			.click();
		expect(props.ui.activePanelId).toBe('reports');

		const dialog = page.getByRole('dialog', { name: 'Reports' });
		await vi.waitFor(() => {
			expect(document.activeElement?.getAttribute('data-panel-id')).toBe('reports');
		});
		expect(dialog.element().contains(document.activeElement)).toBe(true);
	});

	it('routes the daily result Reports and Finance actions through the owner', async () => {
		expect.assertions(2);
		const props = hostProps({ openAt: 'dashboard' });
		render(ManagementPanelHost, props);
		const card = page.getByTestId('daily-result');

		await card.getByRole('button', { name: 'Reports', exact: true }).click();
		expect(props.ui.activePanelId).toBe('reports');
		props.ui.open('dashboard');
		await card.getByRole('button', { name: 'Finance', exact: true }).click();
		expect(props.ui.activePanelId).toBe('finance');
	});

	it('renders no fabricated cash in the dashboard card before a company exists', async () => {
		expect.assertions(1);
		render(ManagementPanelHost, hostProps({ openAt: 'dashboard', game: null }));

		expect(page.getByTestId('daily-result-current-cash').elements()).toHaveLength(0);
	});

	it('renders the dashboard dialog shell with its label, day, and cash', async () => {
		expect.assertions(4);
		const props = hostProps({ openAt: 'dashboard' });
		render(ManagementPanelHost, props);

		await expect.element(page.getByRole('dialog', { name: 'Dashboard' })).toBeVisible();
		await expect.element(page.getByRole('heading', { level: 2, name: 'Dashboard' })).toBeVisible();
		const status = page.getByRole('group', {
			name: props.i18n.t('route.controlTower.panelStatus', { panel: 'Dashboard' })
		});
		await expect
			.element(
				status.getByText(
					props.i18n.t('topBar.day', {
						day: props.i18n.format.integer(props.game!.day)
					})
				)
			)
			.toBeVisible();
		await expect
			.element(status.getByText(props.i18n.format.currency(props.game!.cash)))
			.toBeVisible();
	});

	it('renders the daily result card above the scorecard from the host-derived view', async () => {
		expect.assertions(5);
		const game = simulateDay(compositionGame());
		const props = hostProps({ openAt: 'dashboard', game });
		render(ManagementPanelHost, props);

		const view = buildDailyResultView(game.reports)!;
		const card = page.getByTestId('daily-result');
		await expect.element(card).toBeVisible();
		await expect.element(page.getByTestId('daily-result-day')).toHaveTextContent(
			props.i18n.t('dailyResult.dayCompletedResult', {
				day: props.i18n.format.integer(view.latest.day)
			})
		);
		await expect
			.element(page.getByTestId('daily-result-revenue'))
			.toHaveTextContent(props.i18n.format.currency(view.latest.revenue));
		const scoreRegion = page.getByRole('region', { name: props.i18n.t('scorecard.title') });
		await expect
			.element(scoreRegion.getByRole('heading', { name: props.i18n.t('scorecard.title') }))
			.toBeVisible();
		expect(
			card.element().compareDocumentPosition(scoreRegion.element()) &
				Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
	});

	it('shows the labeled current cash from game state, not the report cashAfter', async () => {
		expect.assertions(3);
		const game = { ...simulateDay(compositionGame()), cash: 999_987 };
		const props = hostProps({ openAt: 'dashboard', game });
		render(ManagementPanelHost, props);

		const cashAfter = buildDailyResultView(game.reports)!.latest.cashAfter;
		expect(props.i18n.format.currency(cashAfter)).not.toBe(props.i18n.format.currency(999_987));
		await expect
			.element(page.getByTestId('daily-result-current-cash'))
			.toHaveTextContent(props.i18n.format.currency(999_987));
		expect(page.getByTestId('daily-result-current-cash').element().textContent).not.toContain(
			props.i18n.format.currency(cashAfter)
		);
	});

	it('treats a backdrop dismissal as the user close, keeping the finance focus', async () => {
		expect.assertions(5);
		const preset: RecurringRouteInput = {
			originCityId: 'industry-city',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water',
			capacity: 12,
			frequencyDays: 1,
			leadTimeDays: 2,
			transportCostPerUnit: 2,
			priority: 0
		};
		const props = hostProps({ openAt: 'logistics' });
		props.ui.focusFinance('loan-1');
		props.ui.openLogistics('route-1', preset);
		render(ManagementPanelHost, props);

		const backdropDismissButton = await page
			.getByRole('button', {
				name: props.i18n.t('route.controlTower.dismiss', { panel: 'Logistics' })
			})
			.element();
		backdropDismissButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(props.ui.activePanelId).toBeNull();
		// Anchor: the user close clears the logistics handoff...
		expect(props.ui.focusedLogisticsRouteId).toBeNull();
		expect(props.ui.logisticsRoutePreset).toBeNull();
		expect(props.ui.focusedRetailSupplyCityId).toBeNull();
		// ...but does not change focusedFinanceLoanId.
		expect(props.ui.focusedFinanceLoanId).toBe('loan-1');
	});
	it('renders retail supply sources and the store overview in the stores panel', async () => {
		expect.assertions(3);
		const props = hostProps({
			openAt: 'stores',
			availability: mutationAvailability({ setRetailSupplySource: false })
		});
		render(ManagementPanelHost, props);

		await expect
			.element(page.getByRole('heading', { name: props.i18n.t('retailSupplySources.title') }))
			.toBeVisible();
		await expect
			.element(
				page
					.getByRole('region', { name: props.i18n.t('storeOverview.title') })
					.getByRole('heading', { name: props.i18n.t('storeOverview.title') })
			)
			.toBeVisible();
		await expect
			.element(page.getByRole('combobox', { name: 'Local supply source for Harbor City' }))
			.toBeDisabled();
	});

	it('disables the starter supply selector before a company exists', async () => {
		expect.assertions(1);
		render(ManagementPanelHost, hostProps({ openAt: 'stores', game: null }));

		await expect
			.element(page.getByRole('combobox', { name: 'Local supply source for Harbor City' }))
			.toBeDisabled();
	});

	it('forwards a planner source focus without changing the source', async () => {
		const props = hostProps({ openAt: 'stores' });
		props.ui.openStores('harbor-city');
		render(ManagementPanelHost, props);

		const select = page.getByRole('combobox', { name: 'Local supply source for Harbor City' });
		await vi.waitFor(() => {
			expect(select.element()).toBe(document.activeElement);
		});
		expect(props.commands.setRetailSupplySource).not.toHaveBeenCalled();
	});

	it('renders the decision queue and active modifiers in the decisions panel', async () => {
		expect.assertions(2);
		const props = hostProps({ openAt: 'decisions' });
		render(ManagementPanelHost, props);

		await expect
			.element(page.getByRole('heading', { name: props.i18n.t('decisionQueue.title') }))
			.toBeVisible();
		await expect
			.element(page.getByRole('heading', { name: props.i18n.t('activeModifiers.title') }))
			.toBeVisible();
	});

	it('preserves the focused finance loan and renders finance when metrics exist', async () => {
		expect.assertions(2);
		const game = compositionGame();
		const focusedFinanceLoanId = game.finance.loans[0]!.id;
		const props = hostProps({ openAt: 'finance', game });
		props.ui.focusFinance(focusedFinanceLoanId);
		render(ManagementPanelHost, props);

		const dialog = await page.getByRole('dialog', { name: 'Finance' }).element();
		expect(dialog.getAttribute('data-focused-finance-loan')).toBe(focusedFinanceLoanId);
		await expect
			.element(
				page
					.getByRole('region', { name: props.i18n.t('financePanel.title') })
					.getByRole('heading', { name: props.i18n.t('financePanel.title') })
			)
			.toBeVisible();
	});

	it('maps policy mutation availability to the policy control', async () => {
		expect.assertions(1);
		const props = hostProps({
			openAt: 'policies',
			availability: mutationAvailability({ updatePolicy: false })
		});
		render(ManagementPanelHost, props);

		await expect.element(page.getByRole('combobox', { name: 'Pricing' })).toBeDisabled();
	});

	it('keeps company policy editable while scoped policy controls are unavailable', async () => {
		expect.assertions(3);
		const props = hostProps({
			openAt: 'policies',
			availability: mutationAvailability({ scopedPolicy: false })
		});
		render(ManagementPanelHost, props);

		await expect.element(page.getByLabelText('Pricing')).toBeEnabled();
		await page.getByLabelText('Policy scope').selectOptions('city');
		await expect.element(page.getByLabelText('Pricing')).toBeDisabled();
		await expect.element(page.getByText('Unavailable in this challenge.')).toBeVisible();
	});

	it('renders manager delegations inside the existing Staff branch and forwards changes', async () => {
		expect.assertions(3);
		const game = compositionGame();
		const props = hostProps({ openAt: 'staff', game });
		render(ManagementPanelHost, props);
		await page
			.getByText(props.i18n.t('managerDelegationPanel.title'), { exact: true })
			.first()
			.click();

		await expect
			.element(page.getByRole('heading', { name: props.i18n.t('managerDelegationPanel.title') }))
			.toBeVisible();
		const manager = game.staff.find((member) => member.role === 'manager')!;
		await page.getByLabelText(`Enable delegation for ${manager.name}`).click();
		expect(props.commands.setManagerDelegation).toHaveBeenCalledWith(
			expect.objectContaining({ managerId: manager.id, enabled: true })
		);
		await expect
			.element(
				page
					.getByRole('region', { name: props.i18n.t('managerDelegationPanel.title') })
					.getByRole('heading', { name: manager.name, exact: true })
			)
			.toBeVisible();
	});

	it('maps staff mutation availability to representative staff controls', async () => {
		expect.assertions(4);
		const game = compositionGame();
		const props = hostProps({
			openAt: 'staff',
			game,
			availability: mutationAvailability({
				hireStaff: false,
				assignStaff: false,
				unassignStaff: false,
				promoteStaff: false
			})
		});
		render(ManagementPanelHost, props);
		document.querySelector<HTMLElement>('.people-list summary')!.click();

		const candidate = game.hiringCandidates[0]!;
		await expect
			.element(
				page.getByRole('button', {
					name: props.i18n.t('staffPanel.actionLabels.hire', {
						name: candidate.name,
						role: props.i18n.t(`staffPanel.role.${candidate.role}`),
						id: candidate.id
					})
				})
			)
			.toBeDisabled();
		await expect
			.element(page.getByRole('combobox', { name: /currently unassigned/i }))
			.toBeDisabled();
		await expect.element(page.getByRole('button', { name: /Unassign / })).toBeDisabled();
		await expect
			.element(page.getByRole('button', { name: /Promote Unassigned Host Staff/ }))
			.toBeDisabled();
	});

	it('maps decision mutation availability to decision actions', async () => {
		expect.assertions(1);
		const props = hostProps({
			openAt: 'decisions',
			availability: mutationAvailability({ resolveDecision: false })
		});
		render(ManagementPanelHost, props);

		await expect.element(page.getByRole('button', { name: /Continue/ })).toBeDisabled();
	});

	it('renders the logistics operations branch with explicit callbacks', async () => {
		expect.assertions(4);
		const props = hostProps({ openAt: 'logistics' });
		render(ManagementPanelHost, props);

		await expect
			.element(page.getByRole('heading', { name: props.i18n.t('logisticsPanel.title') }))
			.toBeVisible();
		await expect
			.element(
				page.getByRole('heading', { name: props.i18n.t('logisticsPanel.sections.manualTransfer') })
			)
			.toBeVisible();
		await expect
			.element(
				page.getByRole('button', { name: props.i18n.t('logisticsPanel.actions.dispatchTransfer') })
			)
			.toBeEnabled();
		await expect
			.element(
				page.getByRole('heading', { name: props.i18n.t('logisticsPanel.sections.recentTransfers') })
			)
			.toBeVisible();
	});

	it('forwards a planner route preset to the existing form without creating a route', async () => {
		const game = createTwoIndustryCityGame();
		const props = hostProps({ openAt: 'logistics', game });
		props.ui.openLogistics(null, {
			originCityId: 'breadbasket-basin',
			destinationCityId: 'industry-city',
			materialId: 'grain',
			capacity: 12,
			frequencyDays: 1,
			leadTimeDays: 2,
			transportCostPerUnit: 2,
			priority: 0
		});
		render(ManagementPanelHost, props);

		await expect.element(page.getByLabelText('Capacity per dispatch')).toHaveValue(12);
		expect(props.commands.createRecurringRoute).not.toHaveBeenCalled();
	});

	it('clears matching focus and notifies the root only after a committed removal', async () => {
		const game = routesGame();
		const props = hostProps({ openAt: 'logistics', game });
		props.commands.removeRecurringRoute = vi.fn(
			async () => ({ status: 'committed' }) as GameRouteCommitResult
		);
		props.ui.openLogistics('route-1');
		render(ManagementPanelHost, props);

		await clickRouteRemoveButton('route-1');
		expect(props.commands.removeRecurringRoute).toHaveBeenCalledWith('route-1');
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(props.i18n.t('logisticsPanel.ui.routeRemoved'));
		expect(props.ui.focusedLogisticsRouteId).toBeNull();
		expect(props.onRouteRemoved).toHaveBeenCalledWith('route-1');
	});

	it('keeps an unrelated focused route when a different route is removed', async () => {
		const game = routesGame();
		const props = hostProps({ openAt: 'logistics', game });
		props.commands.removeRecurringRoute = vi.fn(
			async () => ({ status: 'committed' }) as GameRouteCommitResult
		);
		props.ui.openLogistics('route-1');
		render(ManagementPanelHost, props);

		await clickRouteRemoveButton('route-2');
		expect(props.commands.removeRecurringRoute).toHaveBeenCalledWith('route-2');
		expect(props.ui.focusedLogisticsRouteId).toBe('route-1');
		expect(props.onRouteRemoved).toHaveBeenCalledWith('route-2');
	});

	it('skips notifications and keeps focus when removal is preflighted away or rejected', async () => {
		const game = routesGame();
		const preflighted = hostProps({ openAt: 'logistics', game: null, fallback: game });
		preflighted.ui.openLogistics('route-1');
		const preflightedView = render(ManagementPanelHost, preflighted);

		// Pre-game: the panel renders the fallback routes, but the host must not
		// command a removal without a live game.
		await clickRouteRemoveButton('route-1');
		expect(preflighted.commands.removeRecurringRoute).not.toHaveBeenCalled();
		expect(preflighted.ui.focusedLogisticsRouteId).toBe('route-1');
		expect(preflighted.onRouteRemoved).not.toHaveBeenCalled();
		await preflightedView.unmount();

		const rejected = hostProps({ openAt: 'logistics', game });
		rejected.ui.openLogistics('route-1');
		rejected.commands.removeRecurringRoute = vi.fn(
			async () =>
				({ status: 'logistics-rejected', reason: 'invalid-quantity' }) as GameRouteCommitResult
		);
		render(ManagementPanelHost, rejected);

		await clickRouteRemoveButton('route-1');
		expect(rejected.commands.removeRecurringRoute).toHaveBeenCalledWith('route-1');
		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent(rejected.i18n.t('logisticsPanel.failures.invalidQuantity'));
		expect(rejected.ui.focusedLogisticsRouteId).toBe('route-1');
		expect(rejected.onRouteRemoved).not.toHaveBeenCalled();
	});

	it('renders the reports panel branch', async () => {
		expect.assertions(1);
		const props = hostProps({ openAt: 'reports' });
		render(ManagementPanelHost, props);

		await expect
			.element(page.getByRole('region', { name: props.i18n.t('reportsPanel.title') }))
			.toBeVisible();
	});

	it('renders the product chains panel branch', async () => {
		expect.assertions(1);
		const props = hostProps({ openAt: 'productChains' });
		render(ManagementPanelHost, props);

		await expect
			.element(page.getByRole('region', { name: props.i18n.t('productChainsPanel.ariaLabel') }))
			.toBeVisible();
	});

	it('avoids the finance and logistics projections while their panels are inactive', async () => {
		expect.assertions(7);
		const { getFinanceMetrics } = await import('$lib/game/financeMetrics');
		const { buildLogisticsPanelView } = await import('$lib/components/game/logisticsPanel');
		vi.mocked(getFinanceMetrics).mockClear();
		vi.mocked(buildLogisticsPanelView).mockClear();

		const props = hostProps({ openAt: 'dashboard' });
		render(ManagementPanelHost, props);
		await expect.element(page.getByRole('dialog', { name: 'Dashboard' })).toBeVisible();
		expect(getFinanceMetrics).not.toHaveBeenCalled();
		expect(buildLogisticsPanelView).not.toHaveBeenCalled();

		props.ui.open('finance');
		await expect.element(page.getByRole('dialog', { name: 'Finance' })).toBeVisible();
		expect(getFinanceMetrics).toHaveBeenCalled();

		props.ui.open('logistics');
		await expect.element(page.getByRole('dialog', { name: 'Logistics' })).toBeVisible();
		expect(buildLogisticsPanelView).toHaveBeenCalled();
	});

	it('renders the sandbox progression ladder only for a live sandbox game', async () => {
		expect.assertions(3);
		const sandboxView = render(ManagementPanelHost, hostProps({ openAt: 'dashboard' }));
		await expect.element(page.getByRole('heading', { name: 'Company progression' })).toBeVisible();
		await sandboxView.unmount();

		// Scenario mode passes a live game too — the ladder must stay hidden.
		const scenarioView = render(
			ManagementPanelHost,
			hostProps({ openAt: 'dashboard', mode: 'scenario' })
		);
		await expect.element(page.getByText('Company progression')).not.toBeInTheDocument();
		await scenarioView.unmount();

		render(ManagementPanelHost, hostProps({ openAt: 'dashboard', game: null }));
		await expect.element(page.getByText('Company progression')).not.toBeInTheDocument();
	});
});
