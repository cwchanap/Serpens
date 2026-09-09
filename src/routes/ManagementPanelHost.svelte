<script lang="ts">
	import HudIcon from '$lib/components/game/HudIcon.svelte';
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
	import ManagerDelegationPanel from '$lib/components/game/ManagerDelegationPanel.svelte';
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
	import type {
		CompanyPolicy,
		GameState,
		LoanTermDays,
		ManagerDelegation,
		PolicyOverrideScope,
		ProductId
	} from '$lib/game/types';
	import type { I18nBundle } from '$lib/i18n';
	import type { MutationAvailability } from './gameRouteController';

	interface Props {
		panelId: ManagementPanelId;
		panelLabel: string;
		managementItems?: { id: ManagementPanelId; label: string; shortcut: string }[];
		onSelectPanel?: (id: ManagementPanelId) => void;
		panelGame: GameState;
		summary: ReportSummary;
		financeMetrics: FinanceMetrics | null;
		retailSupplyViews: RetailCitySupplyView[];
		mutations: MutationAvailability;
		retailSupplyDisabled: boolean;
		focusedFinanceLoanId: string | null;
		focusedRetailSupplyCityId?: string | null;
		logisticsView: LogisticsPanelView | null;
		manageLogistics?: boolean;
		focusedLogisticsRouteId?: string | null;
		logisticsRoutePreset?: RecurringRouteInput | null;
		i18n: I18nBundle;
		disabledReason: string | null;

		onClose: () => void;
		onChangePolicy: (patch: Partial<CompanyPolicy>) => void;
		onSetPolicyOverride: (scope: PolicyOverrideScope, patch: Partial<CompanyPolicy>) => void;
		onClearPolicyOverrideField: (scope: PolicyOverrideScope, field: keyof CompanyPolicy) => void;
		onResetPolicyOverrideScope: (scope: PolicyOverrideScope) => void;
		onSetManagerDelegation: (delegation: ManagerDelegation) => void;
		onRemoveManagerDelegation: (managerId: string) => void;
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
		onPlanProduct?: (productId: ProductId) => void;
		plannerProductIds?: readonly ProductId[];
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
		managementItems = [],
		onSelectPanel = () => {},
		panelGame,
		summary,
		financeMetrics,
		retailSupplyViews,
		mutations,
		retailSupplyDisabled,
		focusedFinanceLoanId,
		focusedRetailSupplyCityId = null,
		logisticsView,
		manageLogistics = false,
		focusedLogisticsRouteId = null,
		logisticsRoutePreset = null,
		i18n,
		disabledReason,
		onClose,
		onChangePolicy,
		onSetPolicyOverride,
		onClearPolicyOverrideField,
		onResetPolicyOverrideScope,
		onSetManagerDelegation,
		onRemoveManagerDelegation,
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
		onPlanProduct = () => {},
		plannerProductIds = [],
		onDispatchManualTransfer,
		onCreateRecurringRoute,
		onUpdateRecurringRoute,
		onPauseRecurringRoute,
		onResumeRecurringRoute,
		onReprioritizeRecurringRoute,
		onRemoveRecurringRoute
	}: Props = $props();

	let reportDays = $state(14);
	const reportWindow = $derived(panelGame.reports.slice(-reportDays));

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
		class:chain-panel={panelId === 'productChains'}
		role="dialog"
		aria-modal="true"
		aria-label={panelLabel}
		data-focused-finance-loan={panelId === 'finance'
			? (focusedFinanceLoanId ?? undefined)
			: undefined}
		{@attach focusTrap}
	>
		{#if panelId !== 'productChains'}
			<div class="tower-header">
				<div>
					<p class="eyebrow">
						{panelId === 'reports' && reportWindow.length > 0
							? i18n.t('reportsPanel.dayRange', {
									start: i18n.format.integer(reportWindow[0].day),
									end: i18n.format.integer(reportWindow.at(-1)!.day)
								})
							: i18n.t('route.controlTower.eyebrow')}
					</p>
					<h2>{panelLabel}</h2>
				</div>
				<div
					class="tower-actions"
					role="group"
					aria-label={i18n.t('route.controlTower.panelStatus', { panel: panelLabel })}
				>
					{#if panelId === 'logistics' && logisticsView}
						<span class="ticker"
							><span class="metric-label">{i18n.t('logisticsPanel.ui.delivered')}</span>
							<strong>{i18n.format.integer(logisticsView.totals.deliveredUnits)}</strong></span
						>
						<span class="ticker"
							><span class="metric-label">{i18n.t('logisticsPanel.ui.freight')}</span>
							<strong>{i18n.format.currency(logisticsView.totals.transportCost)}</strong></span
						>
					{:else if panelId === 'staff'}
						<span class="ticker"
							>{i18n.t('staffPanel.hiredCountShort', {
								count: i18n.format.integer(panelGame.staff.length)
							})}</span
						>
						<strong class="ticker">{i18n.format.currency(panelGame.cash)}</strong>
					{:else if panelId === 'reports'}
						<div
							class="report-windows"
							role="group"
							aria-label={i18n.t('reportsPanel.chart.window')}
						>
							{#each [7, 14, 30] as days (days)}
								<button
									type="button"
									aria-pressed={reportDays === days}
									aria-label={i18n.t('reportsPanel.shortDays', { days })}
									onclick={() => (reportDays = days)}
									>{i18n.t('reportsPanel.shortDays', { days })}</button
								>
							{/each}
						</div>
					{:else}
						<span class="ticker"
							>{i18n.t('topBar.day', { day: i18n.format.integer(panelGame.day) })}</span
						>
						<strong class="ticker">{i18n.format.currency(panelGame.cash)}</strong>
					{/if}
					<button
						type="button"
						class="close-tower btn-danger"
						aria-label={i18n.t('route.controlTower.closePanel', { panel: panelLabel })}
						onclick={onClose}
					>
						×
					</button>
				</div>
			</div>
		{/if}

		<nav class="tower-tabs" aria-label={i18n.t('route.menu.managementPanels')}>
			{#each managementItems as item (item.id)}
				<button
					type="button"
					aria-label={item.label}
					title={`${item.label} (${item.shortcut})`}
					aria-current={panelId === item.id ? 'page' : undefined}
					onclick={() => {
						if (panelId !== item.id) onSelectPanel(item.id);
					}}
				>
					<HudIcon name={item.id} /><span>{item.label}</span>
				</button>
			{/each}
		</nav>
		<div class="tower-content">
			{#key panelId}
				{#if panelId === 'dashboard'}
					<Scorecard {i18n} scorecard={panelGame.scorecard} />
				{:else if panelId === 'policies'}
					<PolicyPanel
						{i18n}
						game={panelGame}
						onChange={onChangePolicy}
						{onSetPolicyOverride}
						{onClearPolicyOverrideField}
						{onResetPolicyOverrideScope}
						canUpdate={mutations.updatePolicy}
						canUpdateScoped={mutations.scopedPolicy}
						{disabledReason}
					/>
				{:else if panelId === 'staff'}
					<div class="staff-surfaces">
						<StaffPanel
							compact
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
						<PolicyPanel
							compact
							{i18n}
							game={panelGame}
							onChange={onChangePolicy}
							{onSetPolicyOverride}
							{onClearPolicyOverrideField}
							{onResetPolicyOverrideScope}
							canUpdate={mutations.updatePolicy}
							canUpdateScoped={mutations.scopedPolicy}
							{disabledReason}
						/>
						<details>
							<summary>{i18n.t('managerDelegationPanel.title')}</summary>
							<ManagerDelegationPanel
								{i18n}
								game={panelGame}
								onChange={onSetManagerDelegation}
								onRemove={onRemoveManagerDelegation}
								canUpdate={mutations.delegation}
								{disabledReason}
							/>
						</details>
					</div>
				{:else if panelId === 'stores'}
					<div class="stores-surfaces">
						<RetailSupplySources
							retailCities={retailSupplyViews}
							disabled={retailSupplyDisabled}
							focusedRetailCityId={focusedRetailSupplyCityId}
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
						<ActiveModifiers
							{i18n}
							day={panelGame.day}
							modifiers={panelGame.events.activeModifiers}
							routes={panelGame.logistics.recurringRoutes}
							competitors={panelGame.competitors}
						/>
					</div>
				{:else if panelId === 'reports'}
					<ReportsPanel
						{i18n}
						{summary}
						game={panelGame}
						stores={panelGame.stores}
						chartDays={reportDays}
					/>
				{:else if panelId === 'productChains'}
					<ProductChainsPanel
						{i18n}
						game={panelGame}
						{onPlanProduct}
						{plannerProductIds}
						{onClose}
					/>
				{:else if panelId === 'logistics'}
					<LogisticsPanel
						game={panelGame}
						view={requireLogisticsView()}
						canMutate={manageLogistics}
						focusedRouteId={focusedLogisticsRouteId}
						routePreset={logisticsRoutePreset}
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
			{/key}
		</div>
	</div>
</div>

<style>
	.report-windows {
		display: flex;
	}
	.report-windows button {
		padding: 9px 12px;
		border: 1px solid var(--brass-500);
		background: var(--paper-50);
		color: var(--ink-700);
		font: 700 12.5px var(--font-mono);
	}
	.report-windows button + button {
		border-left: 0;
	}
	.report-windows button[aria-pressed='true'] {
		background: var(--paper-300);
	}
	.metric-label {
		font: 700 10px var(--font-mono);
		color: var(--brass-700);
		letter-spacing: 1px;
		text-transform: uppercase;
	}
	.control-tower-overlay h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 26px;
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
		background: #14100a;
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
		max-height: calc(100vh - 3rem);
		overflow: hidden;
		display: grid;
		grid-template-columns: 76px minmax(0, 1fr);
		grid-template-rows: auto minmax(0, 1fr);
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

	.staff-surfaces {
		display: grid;
		gap: 1rem;
	}
	.tower-header .eyebrow {
		margin: 0;
		font-size: 11px;
		line-height: 14px;
	}
	.tower-header {
		grid-column: 2;
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

	.chain-panel .tower-content {
		grid-row: 1 / -1;
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
		.stores-surfaces,
		.staff-surfaces {
			grid-template-columns: 1fr;
		}

		.staff-surfaces {
			display: grid;
			gap: 1rem;
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
	.tower-tabs {
		grid-column: 1;
		grid-row: 1 / 3;
		display: flex;
		flex-direction: column;
		gap: 6px;
		overflow-y: auto;
		padding: 0 19px 0 0;
		border-right: 1px solid var(--brass-500);
	}
	.tower-tabs button {
		display: grid;
		place-items: center;
		gap: 0.15rem;
		min-height: 52px;
		flex-shrink: 0;
		border: 1px solid var(--paper-edge);
		background: var(--paper-100);
		color: var(--ink-500);
		padding: 0.4rem 0.1rem;
	}
	.tower-tabs span {
		display: none;
	}
	.tower-tabs button[aria-current='page'] {
		background: var(--paper-300);
		color: var(--ink-900);
	}
	.tower-tabs button:focus-visible {
		outline: 2px solid var(--wax-red);
		outline-offset: 2px;
	}
	.tower-content {
		grid-column: 2;
		min-width: 0;
		overflow: auto;
		padding: 0 0 0.4rem;
	}
	.close-tower {
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		border-radius: 2px;
		font-size: 1.4rem;
	}
	@media (max-width: 600px) {
		.tower-backdrop {
			padding: 0.4rem;
		}
		.control-tower-overlay {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto auto minmax(0, 1fr);
			padding: 0.65rem;
			gap: 0.65rem;
			max-height: calc(100dvh - 0.8rem);
		}
		.tower-tabs {
			grid-row: 2;
			padding: 0;
			border-right: 0;
			flex-direction: row;
			overflow-x: auto;
		}
		.tower-tabs button {
			min-width: 3.2rem;
		}
		.tower-header,
		.tower-actions {
			flex-direction: row;
			align-items: center;
			gap: 0.5rem;
		}
		.tower-header,
		.tower-content {
			grid-column: 1;
		}
		.chain-panel {
			grid-template-rows: auto minmax(0, 1fr);
		}
		.chain-panel .tower-tabs {
			grid-row: 1;
		}
		.chain-panel .tower-content {
			grid-row: 2;
		}
		.tower-actions .ticker {
			font-size: 0.7rem;
		}
	}
</style>
