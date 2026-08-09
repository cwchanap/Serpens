import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { buildRetailCitySupplyViews } from '$lib/components/game/retailSupplySources';
import type { RetailCitySupplyView } from '$lib/components/game/retailSupplySources';
import { decisionContextCashPressure } from '$lib/game/decisionContext';
import { getFinanceMetrics, type FinanceMetrics } from '$lib/game/financeMetrics';
import { getStaffXpForLevel } from '$lib/game/staffLeveling';
import { summarizeReports, type ReportSummary } from '$lib/game/reports';
import { createNewGame } from '$lib/game/state';
import type { DecisionItem, GameState, LoanTermDays } from '$lib/game/types';
import type { GameRouteCommitResult } from '$lib/game/commandResult';
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
		i18n,
		disabledReason: 'Unavailable in this challenge.',
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

		await page
			.getByRole('button', {
				name: props.i18n.t('route.controlTower.dismiss', { panel: props.panelLabel })
			})
			.click();

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
			.element(page.getByRole('heading', { name: props.i18n.t('storeOverview.title') }))
			.toBeVisible();
		await expect
			.element(page.getByRole('combobox', { name: props.retailSupplyViews[0]!.selectLabel }))
			.toBeDisabled();
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
			.element(page.getByRole('heading', { name: props.i18n.t('financePanel.title') }))
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

		await expect.element(page.getByRole('button', { name: /Hire / })).toBeDisabled();
		await expect
			.element(page.getByRole('combobox', { name: /currently unassigned/i }))
			.toBeDisabled();
		await expect.element(page.getByRole('button', { name: /Unassign / })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /Promote / })).toBeDisabled();
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
});
