<script lang="ts">
	import { focusTrap } from '$lib/a11y/focusTrap';
	import GameIcon from '$lib/components/game/GameIcon.svelte';
	import type { ManagementPanelMenuItem } from '$lib/components/game/gameNavigation';
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
	import { getStoreArt } from '$lib/assets/gameArt';
	import { asset } from '$app/paths';
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
	import type { ProductChainCategorySummary } from '$lib/game/productChainGraph';
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
		managementItems: ManagementPanelMenuItem[];
		onSelectPanel: (panelId: ManagementPanelId) => void;
		panelGame: GameState;
		live: boolean;
		summary: ReportSummary;
		financeMetrics: FinanceMetrics | null;
		chainSummaries: ProductChainCategorySummary[] | null;
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
		managementItems,
		onSelectPanel,
		panelGame,
		live,
		summary,
		financeMetrics,
		chainSummaries,
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

	function requireFinanceMetrics(): FinanceMetrics {
		if (financeMetrics === null) {
			throw new Error('ManagementPanelHost invariant: financeMetrics required for finance panel');
		}
		return financeMetrics;
	}

	function requireChainSummaries(): ProductChainCategorySummary[] {
		if (chainSummaries === null) {
			throw new Error('ManagementPanelHost invariant: chainSummaries required for dashboard panel');
		}
		return chainSummaries;
	}

	function activeLogisticsRouteCount(game: GameState): number {
		return game.logistics.recurringRoutes.filter((route) => route.state === 'active').length;
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
				<span class="ticker" class:placeholder={!live}
					>{i18n.t('topBar.day', {
						day: live ? i18n.format.integer(panelGame.day) : '—'
					})}</span
				>
				<strong class="ticker" class:placeholder={!live}
					>{live ? i18n.format.currency(panelGame.cash) : '—'}</strong
				>
				<button
					type="button"
					class="close-tower"
					aria-label={i18n.t('route.controlTower.closePanel', { panel: panelLabel })}
					onclick={onClose}
				>
					×
				</button>
			</div>
		</div>

		<div class="workspace-grid">
			<div class="workspace-rail" role="group" aria-label={i18n.t('controlDesk.management')}>
				{#each managementItems as item (item.id)}
					<button
						type="button"
						class="btn-icon rail-stamp"
						class:active={item.id === panelId}
						aria-pressed={item.id === panelId}
						aria-label={item.label}
						title={`${item.label} (${item.shortcut})`}
						onclick={() => onSelectPanel(item.id)}
					>
						<GameIcon name={item.icon} />
					</button>
				{/each}
			</div>

			<div class="workspace-content">
				{#key panelId}
					{#if panelId === 'dashboard'}
						{@const summaries = requireChainSummaries()}
						{@const healthyChains = summaries.filter(
							(summary) => summary.health === 'healthy'
						).length}
						<div class="workspace-dashboard">
							<div class="summary-grid">
								<article class="summary-card">
									<h3>{i18n.t('workspaceSummary.stores')}</h3>
									{#if live && panelGame.stores.length > 0}
										{@const storeArt = getStoreArt(panelGame.stores[0]!.archetypeId)}
										<img
											class="summary-thumb"
											src={asset(storeArt.path)}
											alt=""
											width="96"
											height="72"
										/>
									{/if}
									<strong class="summary-value" class:placeholder={!live}
										>{live ? i18n.format.integer(panelGame.stores.length) : '—'}</strong
									>
								</article>
								<article class="summary-card">
									<h3>{i18n.t('workspaceSummary.cash')}</h3>
									<strong class="summary-value" class:placeholder={!live}
										>{live ? i18n.format.currency(panelGame.cash) : '—'}</strong
									>
								</article>
								<article class="summary-card">
									<h3>{i18n.t('workspaceSummary.activeRoutes')}</h3>
									<strong class="summary-value" class:placeholder={!live}
										>{live
											? i18n.format.integer(activeLogisticsRouteCount(panelGame))
											: '—'}</strong
									>
								</article>
								<article class="summary-card">
									<h3>{i18n.t('workspaceSummary.chainHealth')}</h3>
									<strong class="summary-value" class:placeholder={!live}
										>{live
											? `${i18n.format.integer(healthyChains)} / ${i18n.format.integer(summaries.length)}`
											: '—'}</strong
									>
								</article>
							</div>
							<Scorecard {i18n} scorecard={panelGame.scorecard} />
						</div>
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
							<ManagerDelegationPanel
								{i18n}
								game={panelGame}
								onChange={onSetManagerDelegation}
								onRemove={onRemoveManagerDelegation}
								canUpdate={mutations.delegation}
								{disabledReason}
							/>
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
						<ReportsPanel {i18n} {summary} game={panelGame} stores={panelGame.stores} />
					{:else if panelId === 'productChains'}
						<ProductChainsPanel {i18n} game={panelGame} {onPlanProduct} {plannerProductIds} />
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
							{live}
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

	.placeholder,
	.summary-value.placeholder,
	.tower-actions .placeholder {
		color: var(--ink-400);
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
		width: min(74rem, calc(100vw - 2rem));
		max-height: calc(100vh - 2rem);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.25rem;
		animation-delay: 160ms;
	}

	.workspace-grid {
		display: grid;
		grid-template-columns: 5rem minmax(0, 1fr);
		gap: 0.75rem;
		flex: 1 1 auto;
		min-height: 0;
	}

	.workspace-rail {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		padding: 0.75rem;
		overflow-y: auto;
	}

	.workspace-rail .btn-icon {
		width: 3.25rem;
		height: 3.25rem;
		flex: none;
	}

	/* Stamp-style rail tabs: square, with the paper/brass double-frame of the
	 * parchment framing so the workspace rail reads as ink stamps against the
	 * gameplay rail's circular buttons. */
	.workspace-rail .btn-icon.rail-stamp {
		border-radius: 6px;
		box-shadow:
			inset 0 0 0 1px var(--paper-100),
			inset 0 0 0 2px var(--brass-300),
			var(--shadow-paper);
	}

	.workspace-rail .btn-icon.active {
		background: var(--paper-200);
	}

	.workspace-rail .btn-icon.rail-stamp.active {
		border-radius: 6px;
		box-shadow:
			inset 0 0 0 1px var(--paper-100),
			inset 0 0 0 2px var(--brass-500),
			var(--shadow-paper);
	}

	.workspace-content {
		min-width: 0;
		min-height: 0;
		padding: 1rem;
		overflow: auto;
	}

	.workspace-dashboard {
		display: grid;
		gap: 1rem;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr));
		gap: 0.7rem;
	}

	.summary-card {
		display: grid;
		justify-items: center;
		gap: 0.5rem;
		min-width: 0;
		padding: 0.8rem 0.6rem 0.7rem;
		border: 1px solid var(--brass-300);
		border-radius: 2px;
		background: var(--paper-50);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		box-shadow: 0 1px 0 rgba(20, 16, 10, 0.08);
	}

	.summary-card h3 {
		margin: 0;
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		text-align: center;
	}

	.summary-thumb {
		width: 4.5rem;
		height: auto;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
	}

	.summary-value {
		color: var(--ink-700);
		font-family: var(--font-mono);
		font-size: 1.3rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums lining-nums;
		text-align: center;
	}

	.decisions-surfaces,
	.stores-surfaces,
	.staff-surfaces {
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
		display: grid;
		place-items: center;
		width: 2.4rem;
		height: 2.4rem;
		padding: 0;
		border: 1px solid var(--ink-900);
		border-radius: 2px;
		background: var(--wax-red);
		color: var(--paper-50);
		font-family: var(--font-ui);
		font-size: 1.05rem;
		font-weight: 700;
		line-height: 1;
		box-shadow: inset 0 0 0 1px var(--wax-red-2);
	}

	.close-tower:hover,
	.close-tower:focus-visible {
		background: var(--wax-red-2);
	}

	@media (max-width: 980px) {
		.control-tower-overlay {
			max-height: calc(100vh - 1rem);
			padding: 0.85rem;
		}

		.workspace-rail {
			flex-direction: row;
			flex-wrap: wrap;
		}

		.workspace-content {
			padding: 0.6rem;
		}

		.decisions-surfaces,
		.stores-surfaces,
		.staff-surfaces {
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
