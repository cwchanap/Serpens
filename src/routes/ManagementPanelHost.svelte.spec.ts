import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { buildRetailCitySupplyViews } from '$lib/components/game/retailSupplySources';
import type { RetailCitySupplyView } from '$lib/components/game/retailSupplySources';
import {
	buildLogisticsPanelView,
	type LogisticsPanelView
} from '$lib/components/game/logisticsPanel';
import { createTwoIndustryCityGame } from '$lib/game/interCityLogistics.testUtils';
import { decisionContextCashPressure } from '$lib/game/decisionContext';
import { getFinanceMetrics, type FinanceMetrics } from '$lib/game/financeMetrics';
import { getStaffXpForLevel } from '$lib/game/staffLeveling';
import { summarizeReports, type ReportSummary } from '$lib/game/reports';
import { createNewGame } from '$lib/game/state';
import type { DecisionItem, GameState, LoanTermDays } from '$lib/game/types';
import type { GameRouteCommitResult } from '$lib/game/commandResult';
import type {
	ManualTransferInput,
	RecurringRouteInput,
	RecurringRouteUpdateInput
} from '$lib/game/interCityLogistics';
import type { I18nBundle } from '$lib/i18n';
import { createI18n } from '$lib/i18n';
import type { ManagementPanelId } from '$lib/game/keyboardShortcuts';
import { createMutationAvailability, type MutationAvailability } from './gameRouteController';
import ManagementPanelHost from './ManagementPanelHost.svelte';

interface ManagementPanelHostProps {
	panelId: ManagementPanelId;
	panelLabel: string;
	panelGame: GameState;
	summary: ReportSummary;
	financeMetrics: FinanceMetrics | null;
	retailSupplyViews: RetailCitySupplyView[];
	mutations: MutationAvailability;
	retailSupplyDisabled: boolean;
	focusedFinanceLoanId: string | null;
	focusedRetailSupplyCityId: string | null;
	logisticsView: LogisticsPanelView;
	manageLogistics: boolean;
	focusedLogisticsRouteId: string | null;
	logisticsRoutePreset: RecurringRouteInput | null;
	i18n: I18nBundle;
	disabledReason: string | null;

	onClose: () => void;
	onChangePolicy: (patch: Partial<GameState['policy']>) => void;
	onHireStaff: (candidateId: string) => void;
	onAssignStaff: (staffId: string, storeId: string) => void;
	onUnassignStaff: (staffId: string) => void;
	onPromoteStaff: (staffId: string) => void;
	onSetRetailSupplySource: (retailCityId: string, supplyCityId: string | null) => void;
	onChooseDecision: (decisionId: string, optionId: string) => void;
	onBorrow: (amount: number, termDays: LoanTermDays) => Promise<GameRouteCommitResult>;
	onRepay: (loanId: string, amount: number) => Promise<GameRouteCommitResult>;
	onPayoff: (loanId: string) => Promise<GameRouteCommitResult>;
	onRefinance: (loanId: string, termDays: LoanTermDays) => Promise<GameRouteCommitResult>;
	onDispatchManualTransfer: (input: ManualTransferInput) => Promise<GameRouteCommitResult>;
	onCreateRecurringRoute: (input: RecurringRouteInput) => Promise<GameRouteCommitResult>;
	onUpdateRecurringRoute: (
		routeId: string,
		input: RecurringRouteUpdateInput
	) => Promise<GameRouteCommitResult>;
	onPauseRecurringRoute: (routeId: string) => Promise<GameRouteCommitResult>;
	onResumeRecurringRoute: (routeId: string) => Promise<GameRouteCommitResult>;
	onReprioritizeRecurringRoute: (
		routeId: string,
		priority: number
	) => Promise<GameRouteCommitResult>;
	onRemoveRecurringRoute: (routeId: string) => Promise<GameRouteCommitResult>;
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
				assignedStoreId: store.id,
				level: 1,
				xp: promotionXp
			},
			{
				...sourceStaff,
				id: 'host-unassigned-staff',
				name: 'Unassigned Host Staff',
				assignedStoreId: null,
				level: 1,
				xp: promotionXp
			}
		],
		decisions: [decision]
	};
}

function mutationAvailability(overrides: Partial<MutationAvailability> = {}): MutationAvailability {
	return {
		...createMutationAvailability({ playMode: 'sandbox', pending: false, definition: null }),
		...overrides
	};
}

function hostProps(overrides: Partial<ManagementPanelHostProps> = {}): ManagementPanelHostProps {
	const panelGame = compositionGame();
	const i18n = createI18n('en');

	return {
		panelId: 'dashboard',
		panelLabel: 'Dashboard',
		panelGame,
		summary: summarizeReports(panelGame.reports),
		financeMetrics: null,
		retailSupplyViews: buildRetailCitySupplyViews(panelGame, i18n),
		mutations: mutationAvailability(),
		retailSupplyDisabled: false,
		focusedFinanceLoanId: null,
		focusedRetailSupplyCityId: null,
		i18n,
		disabledReason: 'Unavailable in this challenge.',
		logisticsView: buildLogisticsPanelView(panelGame, i18n),
		manageLogistics: true,
		focusedLogisticsRouteId: null,
		logisticsRoutePreset: null,
		onClose: vi.fn(),
		onChangePolicy: vi.fn(),
		onHireStaff: vi.fn(),
		onAssignStaff: vi.fn(),
		onUnassignStaff: vi.fn(),
		onPromoteStaff: vi.fn(),
		onSetRetailSupplySource: vi.fn(),
		onChooseDecision: vi.fn(),
		onBorrow: vi.fn(async () => ({ status: 'unavailable' }) as const),
		onRepay: vi.fn(async () => ({ status: 'unavailable' }) as const),
		onPayoff: vi.fn(async () => ({ status: 'unavailable' }) as const),
		onRefinance: vi.fn(async () => ({ status: 'unavailable' }) as const),
		onDispatchManualTransfer: vi.fn(async () => ({ status: 'unavailable' }) as const),
		onCreateRecurringRoute: vi.fn(async () => ({ status: 'unavailable' }) as const),
		onUpdateRecurringRoute: vi.fn(async () => ({ status: 'unavailable' }) as const),
		onPauseRecurringRoute: vi.fn(async () => ({ status: 'unavailable' }) as const),
		onResumeRecurringRoute: vi.fn(async () => ({ status: 'unavailable' }) as const),
		onReprioritizeRecurringRoute: vi.fn(async () => ({ status: 'unavailable' }) as const),
		onRemoveRecurringRoute: vi.fn(async () => ({ status: 'unavailable' }) as const),
		...overrides
	};
}

describe('ManagementPanelHost', () => {
	it('renders the dashboard dialog shell with its label, day, and cash', async () => {
		expect.assertions(4);
		const props = hostProps();
		render(ManagementPanelHost, props);

		await expect.element(page.getByRole('dialog', { name: props.panelLabel })).toBeVisible();
		await expect
			.element(page.getByRole('heading', { level: 2, name: props.panelLabel }))
			.toBeVisible();
		await expect
			.element(
				page.getByText(
					props.i18n.t('topBar.day', {
						day: props.i18n.format.integer(props.panelGame.day)
					})
				)
			)
			.toBeVisible();
		await expect
			.element(page.getByText(props.i18n.format.currency(props.panelGame.cash)))
			.toBeVisible();
	});

	it('forwards a backdrop close to the route callback', async () => {
		expect.assertions(1);
		const onClose = vi.fn();
		const props = hostProps({ onClose });
		render(ManagementPanelHost, props);

		const backdropDismissButton = await page
			.getByRole('button', {
				name: props.i18n.t('route.controlTower.dismiss', { panel: props.panelLabel })
			})
			.element();
		backdropDismissButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

		expect(onClose).toHaveBeenCalledOnce();
	});

	it('renders retail supply sources and the store overview in the stores panel', async () => {
		expect.assertions(3);
		const props = hostProps({
			panelId: 'stores',
			panelLabel: 'Stores',
			retailSupplyDisabled: true
		});
		render(ManagementPanelHost, props);

		await expect
			.element(page.getByRole('heading', { name: props.retailSupplyViews[0]!.panelTitle }))
			.toBeVisible();
		await expect
			.element(
				page
					.getByRole('region', { name: props.i18n.t('storeOverview.title') })
					.getByRole('heading', { name: props.i18n.t('storeOverview.title') })
			)
			.toBeVisible();
		await expect
			.element(page.getByRole('combobox', { name: props.retailSupplyViews[0]!.selectLabel }))
			.toBeDisabled();
	});

	it('forwards a planner source focus without changing the source', async () => {
		const onSetRetailSupplySource = vi.fn();
		const props = hostProps({
			panelId: 'stores',
			panelLabel: 'Stores',
			focusedRetailSupplyCityId: 'harbor-city',
			onSetRetailSupplySource
		});
		render(ManagementPanelHost, props);

		const select = page.getByRole('combobox', { name: props.retailSupplyViews[0]!.selectLabel });
		await vi.waitFor(() => {
			expect(select.element()).toBe(document.activeElement);
		});
		expect(onSetRetailSupplySource).not.toHaveBeenCalled();
	});

	it('renders the decision queue and active modifiers in the decisions panel', async () => {
		expect.assertions(2);
		const props = hostProps({ panelId: 'decisions', panelLabel: 'Decisions' });
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
		const panelGame = compositionGame();
		const focusedFinanceLoanId = panelGame.finance.loans[0]!.id;
		const props = hostProps({
			panelId: 'finance',
			panelLabel: 'Finance',
			panelGame,
			financeMetrics: getFinanceMetrics(panelGame),
			focusedFinanceLoanId
		});
		render(ManagementPanelHost, props);

		const dialog = await page.getByRole('dialog', { name: props.panelLabel }).element();
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
			panelId: 'policies',
			panelLabel: 'Policies',
			mutations: mutationAvailability({ updatePolicy: false })
		});
		render(ManagementPanelHost, props);

		await expect.element(page.getByRole('combobox', { name: 'Pricing' })).toBeDisabled();
	});

	it('maps staff mutation availability to representative staff controls', async () => {
		expect.assertions(4);
		const props = hostProps({
			panelId: 'staff',
			panelLabel: 'Staff',
			mutations: mutationAvailability({
				hireStaff: false,
				assignStaff: false,
				unassignStaff: false,
				promoteStaff: false
			})
		});
		render(ManagementPanelHost, props);

		const candidate = props.panelGame.hiringCandidates[0]!;
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
			panelId: 'decisions',
			panelLabel: 'Decisions',
			mutations: mutationAvailability({ resolveDecision: false })
		});
		render(ManagementPanelHost, props);

		await expect.element(page.getByRole('button', { name: /Continue/ })).toBeDisabled();
	});

	it('renders the logistics operations branch with explicit callbacks', async () => {
		expect.assertions(4);
		const props = hostProps({ panelId: 'logistics', panelLabel: 'Logistics' });
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
		const panelGame = createTwoIndustryCityGame();
		const i18n = createI18n('en');
		const onCreateRecurringRoute = vi.fn(async () => ({ status: 'unavailable' }) as const);
		const props = hostProps({
			panelId: 'logistics',
			panelLabel: 'Logistics',
			panelGame,
			summary: summarizeReports(panelGame.reports),
			retailSupplyViews: buildRetailCitySupplyViews(panelGame, i18n),
			logisticsView: buildLogisticsPanelView(panelGame, i18n),
			i18n,
			logisticsRoutePreset: {
				originCityId: 'breadbasket-basin',
				destinationCityId: 'industry-city',
				materialId: 'grain',
				capacity: 12,
				frequencyDays: 1,
				leadTimeDays: 2,
				transportCostPerUnit: 2,
				priority: 0
			},
			onCreateRecurringRoute
		});
		render(ManagementPanelHost, props);

		await expect.element(page.getByLabelText('Capacity per dispatch')).toHaveValue(12);
		expect(onCreateRecurringRoute).not.toHaveBeenCalled();
	});

	it('renders the reports panel branch', async () => {
		expect.assertions(1);
		const props = hostProps({ panelId: 'reports', panelLabel: 'Reports' });
		render(ManagementPanelHost, props);

		await expect
			.element(page.getByRole('region', { name: props.i18n.t('reportsPanel.title') }))
			.toBeVisible();
	});

	it('renders the product chains panel branch', async () => {
		expect.assertions(1);
		const props = hostProps({ panelId: 'productChains', panelLabel: 'Product Chains' });
		render(ManagementPanelHost, props);

		await expect
			.element(page.getByRole('region', { name: props.i18n.t('productChainsPanel.ariaLabel') }))
			.toBeVisible();
	});

	it('throws when the finance panel is opened without finance metrics', () => {
		expect.assertions(1);
		const props = hostProps({ panelId: 'finance', panelLabel: 'Finance', financeMetrics: null });
		expect(() => render(ManagementPanelHost, props)).toThrow(
			'financeMetrics required for finance panel'
		);
	});

	it('throws when the logistics panel is opened without a logistics view', () => {
		expect.assertions(1);
		const props = hostProps({
			panelId: 'logistics',
			panelLabel: 'Logistics',
			logisticsView: null as unknown as LogisticsPanelView
		});
		expect(() => render(ManagementPanelHost, props)).toThrow(
			'logisticsView required for logistics panel'
		);
	});
});
