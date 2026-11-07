<script lang="ts">
	import HudIcon from '$lib/components/game/HudIcon.svelte';
	import { focusTrap } from '$lib/a11y/focusTrap';
	import ActiveModifiers from '$lib/components/game/ActiveModifiers.svelte';
	import DailyResultSummary from '$lib/components/game/DailyResultSummary.svelte';
	import DecisionQueue from '$lib/components/game/DecisionQueue.svelte';
	import FinancePanel from '$lib/components/game/FinancePanel.svelte';
	import LogisticsPanel from '$lib/components/game/LogisticsPanel.svelte';
	import PolicyPanel from '$lib/components/game/PolicyPanel.svelte';
	import ProductChainsPanel from '$lib/components/game/ProductChainsPanel.svelte';
	import ReportsPanel from '$lib/components/game/ReportsPanel.svelte';
	import RetailSupplySources from '$lib/components/game/RetailSupplySources.svelte';
	import SandboxProgression from '$lib/components/game/SandboxProgression.svelte';
	import Scorecard from '$lib/components/game/Scorecard.svelte';
	import StaffPanel from '$lib/components/game/StaffPanel.svelte';
	import ManagerDelegationPanel from '$lib/components/game/ManagerDelegationPanel.svelte';
	import StoreOverview from '$lib/components/game/StoreOverview.svelte';
	import { buildRetailCitySupplyViews } from '$lib/components/game/retailSupplySources';
	import { buildLogisticsPanelView } from '$lib/components/game/logisticsPanel';
	import { getFinanceMetrics } from '$lib/game/financeMetrics';
	import { isGameRouteCommitted, type GameRouteCommitResult } from '$lib/game/commandResult';
	import { summarizeReports, buildDailyResultView } from '$lib/game/reports';
	import type { ManualTransferInput } from '$lib/game/interCityLogistics';
	import type { FinanceMetrics } from '$lib/game/financeMetrics';
	import type { LogisticsPanelView } from '$lib/components/game/logisticsPanel';
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
	import type { ManagementUi, ManagementUiCommands } from './managementUi.svelte';

	interface Props {
		/** Navigation owner: active panel, menu and the panel-scoped focus atoms. */
		ui: ManagementUi;
		/** Live game; null before the company is founded. */
		game: GameState | null;
		/** Starter preview rendered as the panel surface before a company exists. */
		fallback: GameState;
		mode: 'sandbox' | 'scenario';
		i18n: I18nBundle;
		availability: MutationAvailability;
		disabledReason: string | null;
		commands: ManagementUiCommands;
		plannerProductIds?: readonly ProductId[];
		onPlanProduct?: (productId: ProductId) => void;
		/** Notified with the removed route id, but only after a committed removal. */
		onRouteRemoved: (routeId: string) => void;
	}

	let {
		ui,
		game,
		fallback,
		mode,
		i18n,
		availability,
		disabledReason,
		commands,
		plannerProductIds = [],
		onPlanProduct = () => {},
		onRouteRemoved
	}: Props = $props();

	const panelId = $derived(ui.activePanelId);
	const panelLabel = $derived(ui.activePanel?.label ?? '');
	// Panels open even before a store is founded; the starter preview stands in
	// for the game and the command handlers below no-op until a game exists.
	const panelGame = $derived(game ?? fallback);
	const summary = $derived(summarizeReports(panelGame.reports));
	const dailyResultView = $derived(buildDailyResultView(panelGame.reports));
	const currentCash = $derived(game !== null ? game.cash : null);
	const sandboxProgressionGame = $derived(mode === 'sandbox' ? game : null);
	const retailSupplyDisabled = $derived(game === null || !availability.setRetailSupplySource);
	// Expensive panel projections are gated on their own panel being active.
	const financeMetrics = $derived(panelId === 'finance' ? getFinanceMetrics(panelGame) : null);
	const logisticsView = $derived(
		panelId === 'logistics' ? buildLogisticsPanelView(panelGame, i18n) : null
	);
	const retailSupplyViews = $derived(buildRetailCitySupplyViews(panelGame, i18n));

	let reportDays = $state(14);
	const reportWindow = $derived(panelGame.reports.slice(-reportDays));

	let dialogEl: HTMLElement | undefined = $state();
	$effect(() => {
		// The {#key panelId} block below destroys its contents on every panel
		// switch — including whatever control initiated it (the dashboard card's
		// Reports/Finance actions, or a keyboard shortcut pressed from inside a
		// panel). When that happens focus falls back to <body>. The focusTrap's
		// keydown listener lives on the document, so a body-level Tab IS caught
		// and reclaimed — but only on the next keypress; focus would sit dead on
		// <body> until then. Hand it to the now-current tab right away.
		// `panelId` must be read unconditionally so this effect re-runs on swap —
		// build the selector before the optional chain, because `dialogEl?.`
		// short-circuits and would otherwise skip the read while dialogEl is
		// still undefined.
		const panelTabSelector = `.tower-tabs button[data-panel-id="${panelId}"]`;
		const target = dialogEl?.querySelector<HTMLElement>(panelTabSelector);
		if (!dialogEl || dialogEl.contains(document.activeElement) || !target) return;
		target.focus({ preventScroll: true });
		// `preventScroll` above stops the page from jumping, but the tab strip
		// itself scrolls (sideways at ≤600px) — bring the focused tab into view.
		target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});

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

	function changePolicy(patch: Partial<CompanyPolicy>): void {
		void commands.updatePolicy(patch);
	}

	function setPolicyOverride(scope: PolicyOverrideScope, patch: Partial<CompanyPolicy>): void {
		void commands.setPolicyOverride(scope, patch);
	}

	function clearPolicyOverrideField(scope: PolicyOverrideScope, field: keyof CompanyPolicy): void {
		void commands.clearPolicyOverrideField(scope, field);
	}

	function resetPolicyOverrideScope(scope: PolicyOverrideScope): void {
		void commands.resetPolicyOverrideScope(scope);
	}

	function setManagerDelegation(delegation: ManagerDelegation): void {
		void commands.setManagerDelegation(delegation);
	}

	function removeManagerDelegation(managerId: string): void {
		void commands.removeManagerDelegation(managerId);
	}

	function hireStaff(candidateId: string): void {
		void commands.hireStaff(candidateId);
	}

	function assignStaff(staffId: string, storeId: string): void {
		void commands.assignStaff(staffId, storeId);
	}

	function unassignStaff(staffId: string): void {
		void commands.unassignStaff(staffId);
	}

	function releaseStaff(staffId: string): void {
		void commands.releaseStaff(staffId);
	}

	function promoteStaff(staffId: string): void {
		void commands.promoteStaff(staffId);
	}

	function setRetailSupplySource(retailCityId: string, supplyCityId: string | null): void {
		void commands.setRetailSupplySource(retailCityId, supplyCityId);
	}

	function chooseDecision(decisionId: string, optionId: string): void {
		void commands.resolveDecision(decisionId, optionId);
	}

	function borrow(amount: number, termDays: LoanTermDays): Promise<GameRouteCommitResult> {
		return commands.borrowWorkingCapital(amount, termDays);
	}

	function repay(loanId: string, amount: number): Promise<GameRouteCommitResult> {
		return commands.repayFinanceLoan(loanId, amount);
	}

	function payoff(loanId: string): Promise<GameRouteCommitResult> {
		return commands.payOffFinanceLoan(loanId);
	}

	function refinance(loanId: string, termDays: LoanTermDays): Promise<GameRouteCommitResult> {
		return commands.refinanceFinanceLoan(loanId, termDays);
	}

	function dispatchManualTransfer(input: ManualTransferInput): Promise<GameRouteCommitResult> {
		return commands.dispatchManualTransfer(input);
	}

	function createRecurringRoute(
		input: Parameters<ManagementUiCommands['createRecurringRoute']>[0]
	): Promise<GameRouteCommitResult> {
		return commands.createRecurringRoute(input);
	}

	function updateRecurringRoute(
		routeId: string,
		input: Parameters<ManagementUiCommands['updateRecurringRoute']>[1]
	): Promise<GameRouteCommitResult> {
		return commands.updateRecurringRoute(routeId, input);
	}

	function pauseRecurringRoute(routeId: string): Promise<GameRouteCommitResult> {
		return commands.pauseRecurringRoute(routeId);
	}

	function resumeRecurringRoute(routeId: string): Promise<GameRouteCommitResult> {
		return commands.resumeRecurringRoute(routeId);
	}

	function reprioritizeRecurringRoute(
		routeId: string,
		priority: number
	): Promise<GameRouteCommitResult> {
		return commands.reprioritizeRecurringRoute(routeId, priority);
	}

	async function removeRecurringRoute(routeId: string): Promise<GameRouteCommitResult> {
		if (game === null || !availability.manageLogistics) {
			return { status: 'unavailable' };
		}
		const result = await commands.removeRecurringRoute(routeId);
		// Only a committed removal dismisses the owner's focus and the route's
		// map selection — rejected/unavailable results change neither.
		if (isGameRouteCommitted(result)) {
			ui.acceptRouteRemoved(routeId);
			onRouteRemoved(routeId);
		}
		return result;
	}
</script>

<div class="tower-backdrop">
	<button
		type="button"
		class="tower-backdrop-button"
		aria-label={i18n.t('route.controlTower.dismiss', { panel: panelLabel })}
		onclick={() => ui.close()}
	></button>
	<div
		class="control-tower-overlay paper"
		class:chain-panel={panelId === 'productChains'}
		role="dialog"
		aria-modal="true"
		aria-label={panelLabel}
		data-focused-finance-loan={panelId === 'finance'
			? (ui.focusedFinanceLoanId ?? undefined)
			: undefined}
		bind:this={dialogEl}
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
						onclick={() => ui.close()}
					>
						×
					</button>
				</div>
			</div>
		{/if}

		<nav class="tower-tabs" aria-label={i18n.t('route.menu.managementPanels')}>
			{#each ui.menu as item (item.id)}
				<button
					type="button"
					aria-label={item.label}
					title={`${item.label} (${item.shortcut})`}
					data-panel-id={item.id}
					aria-current={panelId === item.id ? 'page' : undefined}
					onclick={() => {
						if (panelId !== item.id) ui.open(item.id);
					}}
				>
					<HudIcon name={item.id} /><span>{item.label}</span>
				</button>
			{/each}
		</nav>
		<div class="tower-content">
			{#key panelId}
				{#if panelId === 'dashboard'}
					<div class="dashboard-surfaces">
						{#if sandboxProgressionGame}
							<SandboxProgression game={sandboxProgressionGame} {i18n} />
						{/if}
						<DailyResultSummary
							{i18n}
							view={dailyResultView}
							{currentCash}
							onOpenReports={() => ui.open('reports')}
							onOpenFinance={() => ui.open('finance')}
						/>
						<Scorecard {i18n} scorecard={panelGame.scorecard} />
					</div>
				{:else if panelId === 'policies'}
					<PolicyPanel
						{i18n}
						game={panelGame}
						onChange={changePolicy}
						onSetPolicyOverride={setPolicyOverride}
						onClearPolicyOverrideField={clearPolicyOverrideField}
						onResetPolicyOverrideScope={resetPolicyOverrideScope}
						canUpdate={availability.updatePolicy}
						canUpdateScoped={availability.scopedPolicy}
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
							onHire={hireStaff}
							onAssign={assignStaff}
							onUnassign={unassignStaff}
							onRelease={releaseStaff}
							onPromote={promoteStaff}
							canHire={availability.hireStaff}
							canAssign={availability.assignStaff}
							canUnassign={availability.unassignStaff}
							canRelease={availability.releaseStaff}
							canPromote={availability.promoteStaff}
							{disabledReason}
						/>
						<PolicyPanel
							compact
							{i18n}
							game={panelGame}
							onChange={changePolicy}
							onSetPolicyOverride={setPolicyOverride}
							onClearPolicyOverrideField={clearPolicyOverrideField}
							onResetPolicyOverrideScope={resetPolicyOverrideScope}
							canUpdate={availability.updatePolicy}
							canUpdateScoped={availability.scopedPolicy}
							{disabledReason}
						/>
						<details>
							<summary>{i18n.t('managerDelegationPanel.title')}</summary>
							<ManagerDelegationPanel
								{i18n}
								game={panelGame}
								onChange={setManagerDelegation}
								onRemove={removeManagerDelegation}
								canUpdate={availability.delegation}
								{disabledReason}
							/>
						</details>
					</div>
				{:else if panelId === 'stores'}
					<div class="stores-surfaces">
						<RetailSupplySources
							retailCities={retailSupplyViews}
							disabled={retailSupplyDisabled}
							focusedRetailCityId={ui.focusedRetailSupplyCityId}
							onChange={setRetailSupplySource}
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
							onResolve={chooseDecision}
							canResolve={availability.resolveDecision}
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
						onClose={() => ui.close()}
					/>
				{:else if panelId === 'logistics'}
					<LogisticsPanel
						game={panelGame}
						view={requireLogisticsView()}
						availability={{
							sandboxActions: availability.manageLogistics,
							createRoute: availability.createRecurringRoute,
							updateRoute: availability.updateRecurringRoute,
							pauseResumeRoute:
								availability.pauseRecurringRoute || availability.resumeRecurringRoute
						}}
						focusedRouteId={ui.focusedLogisticsRouteId}
						routePreset={ui.logisticsRoutePreset}
						{disabledReason}
						{i18n}
						onDispatchManualTransfer={dispatchManualTransfer}
						onCreateRecurringRoute={createRecurringRoute}
						onUpdateRecurringRoute={updateRecurringRoute}
						onPauseRecurringRoute={pauseRecurringRoute}
						onResumeRecurringRoute={resumeRecurringRoute}
						onReprioritizeRecurringRoute={reprioritizeRecurringRoute}
						onRemoveRecurringRoute={removeRecurringRoute}
					/>
				{:else if panelId === 'finance'}
					<FinancePanel
						game={panelGame}
						metrics={requireFinanceMetrics()}
						{i18n}
						focusedLoanId={ui.focusedFinanceLoanId}
						mutationPending={availability.pending}
						onBorrow={borrow}
						onRepay={repay}
						onPayoff={payoff}
						onRefinance={refinance}
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

	.staff-surfaces,
	.dashboard-surfaces {
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
