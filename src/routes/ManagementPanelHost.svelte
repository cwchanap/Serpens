<script lang="ts">
	import { focusTrap } from '$lib/a11y/focusTrap';
	import ActiveModifiers from '$lib/components/game/ActiveModifiers.svelte';
	import DecisionQueue from '$lib/components/game/DecisionQueue.svelte';
	import FinancePanel from '$lib/components/game/FinancePanel.svelte';
	import LogisticsPanel from '$lib/components/game/LogisticsPanel.svelte';
	import type { LogisticsPanelView } from '$lib/components/game/logisticsPanel';
	import PolicyPanel from '$lib/components/game/PolicyPanel.svelte';
	import ProductChainsPanel from '$lib/components/game/ProductChainsPanel.svelte';
	import ReportsPanel from '$lib/components/game/ReportsPanel.svelte';
	import RetailSupplySources from '$lib/components/game/RetailSupplySources.svelte';
	import Scorecard from '$lib/components/game/Scorecard.svelte';
	import StaffPanel from '$lib/components/game/StaffPanel.svelte';
	import StoreOverview from '$lib/components/game/StoreOverview.svelte';
	import type { RetailCitySupplyView } from '$lib/components/game/retailSupplySources';
	import type { GameRouteCommitResult } from '$lib/game/commandResult';
	import type {
		ManualTransferInput,
		RecurringRouteInput,
		RecurringRouteUpdateInput
	} from '$lib/game/interCityLogistics';
	import type { FinanceMetrics } from '$lib/game/financeMetrics';
	import type { ManagementPanelId } from '$lib/game/keyboardShortcuts';
	import type { ReportSummary } from '$lib/game/reports';
	import type { CompanyPolicy, GameState, LoanTermDays } from '$lib/game/types';
	import type { I18nBundle } from '$lib/i18n';
	import type { MutationAvailability } from './gameRouteController';

	interface Props {
		panelId: ManagementPanelId;
		panelLabel: string;
		panelGame: GameState;
		summary: ReportSummary;
		financeMetrics: FinanceMetrics | null;
		retailSupplyViews: RetailCitySupplyView[];
		mutations: MutationAvailability;
		retailSupplyDisabled: boolean;
		focusedFinanceLoanId: string | null;
		logisticsView: LogisticsPanelView | null;
		manageLogistics?: boolean;
		focusedLogisticsRouteId?: string | null;
		i18n: I18nBundle;
		disabledReason: string | null;

		onClose: () => void;
		onChangePolicy: (patch: Partial<CompanyPolicy>) => void;
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

	let {
		panelId,
		panelLabel,
		panelGame,
		summary,
		financeMetrics,
		retailSupplyViews,
		mutations,
		retailSupplyDisabled,
		focusedFinanceLoanId,
		logisticsView,
		manageLogistics = false,
		focusedLogisticsRouteId = null,
		i18n,
		disabledReason,
		onClose,
		onChangePolicy,
		onHireStaff,
		onAssignStaff,
		onUnassignStaff,
		onPromoteStaff,
		onSetRetailSupplySource,
		onChooseDecision,
		onBorrow,
		onRepay,
		onPayoff,
		onRefinance,
		onDispatchManualTransfer,
		onCreateRecurringRoute,
		onUpdateRecurringRoute,
		onPauseRecurringRoute,
		onResumeRecurringRoute,
		onReprioritizeRecurringRoute,
		onRemoveRecurringRoute
	}: Props = $props();

	function requireFinanceMetrics(): FinanceMetrics {
		if (financeMetrics === null) {
			throw new Error('ManagementPanelHost invariant: financeMetrics required for finance panel');
		}
		return financeMetrics;
	}

	function requireLogisticsView(): LogisticsPanelView {
		if (logisticsView === null) {
			throw new Error('ManagementPanelHost invariant: logisticsView required for logistics panel');
		}
		return logisticsView;
	}
</script>

<div class="tower-backdrop">
	<button
		type="button"
		class="tower-backdrop-button"
		aria-label={i18n.t('route.controlTower.dismiss', { panel: panelLabel })}
		onclick={onClose}
	></button>
	<div
		class="control-tower-overlay paper"
		role="dialog"
		aria-modal="true"
		aria-label={panelLabel}
		data-focused-finance-loan={panelId === 'finance'
			? (focusedFinanceLoanId ?? undefined)
			: undefined}
		{@attach focusTrap}
	>
		<div class="tower-header">
			<div>
				<p class="eyebrow">{i18n.t('route.controlTower.eyebrow')}</p>
				<h2>{panelLabel}</h2>
			</div>
			<div
				class="tower-actions"
				role="group"
				aria-label={i18n.t('route.controlTower.panelStatus', { panel: panelLabel })}
			>
				<span class="ticker"
					>{i18n.t('topBar.day', { day: i18n.format.integer(panelGame.day) })}</span
				>
				<strong class="ticker">{i18n.format.currency(panelGame.cash)}</strong>
				<button
					type="button"
					class="close-tower btn-danger"
					aria-label={i18n.t('route.controlTower.closePanel', { panel: panelLabel })}
					onclick={onClose}
				>
					{i18n.t('route.controlTower.close')}
				</button>
			</div>
		</div>

		{#if panelId === 'dashboard'}
			<Scorecard {i18n} scorecard={panelGame.scorecard} />
		{:else if panelId === 'policies'}
			<PolicyPanel
				{i18n}
				policy={panelGame.policy}
				onChange={onChangePolicy}
				canUpdate={mutations.updatePolicy}
				{disabledReason}
			/>
		{:else if panelId === 'staff'}
			<StaffPanel
				{i18n}
				stores={panelGame.stores}
				staff={panelGame.staff}
				hiringCandidates={panelGame.hiringCandidates}
				cash={panelGame.cash}
				onHire={onHireStaff}
				onAssign={onAssignStaff}
				onUnassign={onUnassignStaff}
				onPromote={onPromoteStaff}
				canHire={mutations.hireStaff}
				canAssign={mutations.assignStaff}
				canUnassign={mutations.unassignStaff}
				canPromote={mutations.promoteStaff}
				{disabledReason}
			/>
		{:else if panelId === 'stores'}
			<div class="stores-surfaces">
				<RetailSupplySources
					retailCities={retailSupplyViews}
					disabled={retailSupplyDisabled}
					onChange={onSetRetailSupplySource}
				/>
				<StoreOverview
					{i18n}
					stores={panelGame.stores}
					staff={panelGame.staff}
					latestReports={summary.latest?.storeReports ?? []}
				/>
			</div>
		{:else if panelId === 'decisions'}
			<div class="decisions-surfaces">
				<DecisionQueue
					{i18n}
					game={panelGame}
					decisions={panelGame.decisions}
					onResolve={onChooseDecision}
					canResolve={mutations.resolveDecision}
					{disabledReason}
				/>
				<ActiveModifiers {i18n} day={panelGame.day} modifiers={panelGame.events.activeModifiers} />
			</div>
		{:else if panelId === 'reports'}
			<ReportsPanel {i18n} {summary} game={panelGame} stores={panelGame.stores} />
		{:else if panelId === 'productChains'}
			<ProductChainsPanel {i18n} game={panelGame} />
		{:else if panelId === 'logistics'}
			<LogisticsPanel
				game={panelGame}
				view={requireLogisticsView()}
				canMutate={manageLogistics}
				focusedRouteId={focusedLogisticsRouteId}
				{disabledReason}
				{i18n}
				{onDispatchManualTransfer}
				{onCreateRecurringRoute}
				{onUpdateRecurringRoute}
				{onPauseRecurringRoute}
				{onResumeRecurringRoute}
				{onReprioritizeRecurringRoute}
				{onRemoveRecurringRoute}
			/>
		{:else if panelId === 'finance'}
			<FinancePanel
				game={panelGame}
				metrics={requireFinanceMetrics()}
				{i18n}
				focusedLoanId={focusedFinanceLoanId}
				mutationPending={mutations.pending}
				{onBorrow}
				{onRepay}
				{onPayoff}
				{onRefinance}
			/>
		{/if}
	</div>
</div>

<style>
	.control-tower-overlay h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 400;
		line-height: 1.1;
		color: var(--ink-700);
	}

	.ticker {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		color: var(--ink-700);
	}

	.tower-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(20, 16, 10, 0.74);
		backdrop-filter: blur(4px);
	}

	.tower-backdrop-button {
		position: absolute;
		inset: 0;
		padding: 0;
		border: 0;
		background: transparent;
	}

	.control-tower-overlay {
		position: relative;
		z-index: 1;
		width: min(1180px, 100%);
		max-height: calc(100vh - 2rem);
		overflow: auto;
		display: grid;
		gap: 1rem;
		padding: 1.25rem;
		animation-delay: 160ms;
	}

	.decisions-surfaces,
	.stores-surfaces {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: start;
		gap: 1rem;
	}

	.tower-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--brass-500);
	}

	.tower-actions {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}

	.tower-actions span,
	.tower-actions strong {
		color: var(--ink-700);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		white-space: nowrap;
	}

	.tower-actions strong {
		font-weight: 700;
	}

	.close-tower {
		white-space: nowrap;
	}

	@media (max-width: 980px) {
		.control-tower-overlay {
			max-height: calc(100vh - 1rem);
			padding: 0.85rem;
		}

		.decisions-surfaces,
		.stores-surfaces {
			grid-template-columns: 1fr;
		}

		.tower-header {
			align-items: stretch;
			flex-direction: column;
		}

		.tower-actions {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
