<script lang="ts">
	import StoreProductChainPanel from '$lib/components/game/StoreProductChainPanel.svelte';
	import StoreStaffPanel from '$lib/components/game/StoreStaffPanel.svelte';
	import StoreStockTable from '$lib/components/game/StoreStockTable.svelte';
	import { focusTrap } from '$lib/a11y/focusTrap';
	import { getProductFreshnessPercent } from '$lib/game/products';
	import type { I18nBundle } from '$lib/i18n';
	import { storeDisplayName } from '$lib/i18n/gameCopy';
	import { getStoreOrdinal } from '$lib/game/state';
	import type {
		DailyProductReport,
		DailyStoreReport,
		GameState,
		HiringCandidate,
		ProductId,
		StaffMember,
		Store,
		StoreProductPatch
	} from '$lib/game/types';

	interface Props {
		game: GameState;
		i18n: I18nBundle;
		store: Store;
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		latestStoreReport: DailyStoreReport | null;
		onUpdateStoreProduct: (storeId: string, productId: ProductId, patch: StoreProductPatch) => void;
		onHireStaff: (candidateId: string) => void;
		onAssignStaff: (staffId: string, storeId: string) => void;
		onUnassignStaff: (staffId: string) => void;
		onClose: () => void;
		onClickFeedback?: () => void;
		canUpdateSellingPrice?: boolean;
		canUpdateInventoryTargets?: boolean;
		allowedProductIds?: readonly ProductId[];
		canHireStaff?: boolean;
		canAssignStaff?: boolean;
		canUnassignStaff?: boolean;
		disabledReason?: string | null;
	}

	let {
		game,
		i18n,
		store,
		staff,
		hiringCandidates,
		latestStoreReport,
		onUpdateStoreProduct,
		onHireStaff,
		onAssignStaff,
		onUnassignStaff,
		onClose,
		onClickFeedback = () => {},
		canUpdateSellingPrice = true,
		canUpdateInventoryTargets = true,
		allowedProductIds = store.products.map((product) => product.productId),
		canHireStaff = true,
		canAssignStaff = true,
		canUnassignStaff = true,
		disabledReason = null
	}: Props = $props();

	let storeOrdinal = $derived(getStoreOrdinal(game.stores, store.id));
	let displayName = $derived(storeDisplayName(store, storeOrdinal, i18n));

	interface PressureMessage {
		id: string;
		text: string;
	}

	function getFreshnessPercent(report: DailyProductReport): number | null {
		return getProductFreshnessPercent(report.productId, report.averageAgeDays);
	}

	function buildPressureMessages(): PressureMessage[] {
		const messages: PressureMessage[] = [];
		for (const report of latestStoreReport?.productReports ?? []) {
			const productName = i18n.labels.productCategory(report.productId);
			if (report.wasteUnits > 0) {
				messages.push({
					id: `${report.productId}-waste`,
					text: i18n.t('storeDetail.pressureSummary.waste', {
						productName,
						units: i18n.format.integer(report.wasteUnits)
					})
				});
			}
			if (report.shrinkUnits > 0) {
				messages.push({
					id: `${report.productId}-shrink`,
					text: i18n.t('storeDetail.pressureSummary.shrink', {
						productName,
						units: i18n.format.integer(report.shrinkUnits)
					})
				});
			}
			if (report.stockoutLostDemand > 0) {
				messages.push({
					id: `${report.productId}-stockout`,
					text: i18n.t('storeDetail.pressureSummary.stockout', {
						productName,
						units: i18n.format.integer(report.stockoutLostDemand)
					})
				});
			}
			if (report.markdownAmount > 0) {
				messages.push({
					id: `${report.productId}-markdown`,
					text: i18n.t('storeDetail.pressureSummary.markdown', {
						productName,
						amount: i18n.format.currency(report.markdownAmount)
					})
				});
			}
			if (report.obsolescenceMultiplier < 1) {
				messages.push({
					id: `${report.productId}-obsolescence`,
					text: i18n.t('storeDetail.pressureSummary.obsolescence', {
						productName,
						percent: i18n.format.percent(report.obsolescenceMultiplier)
					})
				});
			}
			const freshnessPercent = getFreshnessPercent(report);
			if (freshnessPercent !== null && freshnessPercent < 100) {
				messages.push({
					id: `${report.productId}-freshness`,
					text: i18n.t('storeDetail.pressureSummary.freshness', {
						productName,
						percent: i18n.format.integer(freshnessPercent)
					})
				});
			}
		}

		const inventoryLossExpense = latestStoreReport ? latestStoreReport.inventoryLossExpense : 0;
		if (inventoryLossExpense > 0) {
			messages.push({
				id: 'inventory-loss',
				text: i18n.t('storeDetail.pressureSummary.inventoryLoss', {
					amount: i18n.format.currency(inventoryLossExpense)
				})
			});
		}
		return messages;
	}

	const pressureMessages = $derived.by(buildPressureMessages);

	type DetailTab = 'stock' | 'chain' | 'staff';

	const tabs: Array<{ id: DetailTab }> = [{ id: 'stock' }, { id: 'chain' }, { id: 'staff' }];

	let activeTab = $state<DetailTab>('stock');

	function selectTab(tab: DetailTab): void {
		onClickFeedback();
		activeTab = tab;
	}

	function handleTabKeydown(event: KeyboardEvent): void {
		if (
			event.key !== 'ArrowLeft' &&
			event.key !== 'ArrowRight' &&
			event.key !== 'ArrowUp' &&
			event.key !== 'ArrowDown'
		) {
			return;
		}

		event.preventDefault();
		const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
		if (currentIndex === -1) return;

		const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
		const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
		const nextTab = tabs[nextIndex];
		if (!nextTab) return;

		selectTab(nextTab.id);
		document.getElementById(`${store.id}-${nextTab.id}-tab`)?.focus();
	}
</script>

<div class="detail-backdrop">
	<button
		type="button"
		class="backdrop-button"
		tabindex="-1"
		aria-label={i18n.t('storeDetail.dismiss')}
		onclick={onClose}
	></button>
	<div
		class="detail-modal paper"
		role="dialog"
		aria-modal="true"
		aria-label={displayName}
		{@attach focusTrap}
	>
		<header>
			<div>
				<p class="eyebrow">{i18n.t('storeDetail.eyebrow')}</p>
				<h2>{displayName}</h2>
			</div>
			<button
				type="button"
				class="btn-danger"
				aria-label={i18n.t('storeDetail.closeLabel')}
				onclick={onClose}>{i18n.t('storeDetail.close')}</button
			>
		</header>

		<section
			class="pressure-summary"
			class:neutral={pressureMessages.length === 0}
			aria-labelledby={`${store.id}-pressure-heading`}
			data-testid="product-pressure-summary"
			role="status"
		>
			<h3 id={`${store.id}-pressure-heading`}>{i18n.t('storeDetail.pressureSummary.title')}</h3>
			{#if pressureMessages.length > 0}
				<ul>
					{#each pressureMessages as message (message.id)}
						<li>{message.text}</li>
					{/each}
				</ul>
			{:else}
				<p>{i18n.t('storeDetail.pressureSummary.neutral')}</p>
			{/if}
		</section>

		<div
			class="detail-tabs"
			role="tablist"
			aria-label={i18n.t('storeDetail.sections', { storeName: displayName })}
			tabindex="-1"
			onkeydown={handleTabKeydown}
		>
			{#each tabs as tab (tab.id)}
				<button
					type="button"
					class="detail-tab"
					class:active={activeTab === tab.id}
					role="tab"
					id={`${store.id}-${tab.id}-tab`}
					aria-selected={activeTab === tab.id}
					aria-controls={`${store.id}-${tab.id}-panel`}
					tabindex={activeTab === tab.id ? 0 : -1}
					onclick={() => selectTab(tab.id)}
				>
					{#if activeTab === tab.id}<span class="bookmark tab-bookmark" aria-hidden="true"
						></span>{/if}
					{i18n.t(`storeDetail.tabs.${tab.id}`)}
				</button>
			{/each}
		</div>

		<div class="detail-panels">
			<div
				class="detail-panel"
				class:active={activeTab === 'stock'}
				id={`${store.id}-stock-panel`}
				role="tabpanel"
				aria-labelledby={`${store.id}-stock-tab`}
			>
				<StoreStockTable
					{i18n}
					{store}
					ordinal={storeOrdinal}
					latestReport={latestStoreReport}
					onUpdate={onUpdateStoreProduct}
					{canUpdateSellingPrice}
					{canUpdateInventoryTargets}
					{allowedProductIds}
					{disabledReason}
				/>
			</div>
			<div
				class="detail-panel"
				class:active={activeTab === 'chain'}
				id={`${store.id}-chain-panel`}
				role="tabpanel"
				aria-labelledby={`${store.id}-chain-tab`}
			>
				<StoreProductChainPanel {game} {i18n} {store} onInteractionFeedback={onClickFeedback} />
			</div>
			<div
				class="detail-panel"
				class:active={activeTab === 'staff'}
				id={`${store.id}-staff-panel`}
				role="tabpanel"
				aria-labelledby={`${store.id}-staff-tab`}
			>
				<StoreStaffPanel
					{store}
					ordinal={storeOrdinal}
					{i18n}
					{staff}
					{hiringCandidates}
					onHire={onHireStaff}
					onAssign={onAssignStaff}
					onUnassign={onUnassignStaff}
					canHire={canHireStaff}
					canAssign={canAssignStaff}
					canUnassign={canUnassignStaff}
					{disabledReason}
				/>
			</div>
		</div>
	</div>
</div>

<style>
	.detail-backdrop {
		position: fixed;
		inset: 0;
		z-index: 42;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(20, 16, 10, 0.74);
		backdrop-filter: blur(4px);
	}

	.backdrop-button {
		position: absolute;
		inset: 0;
		border: 0;
		background: transparent;
		padding: 0;
	}

	.detail-modal {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr);
		gap: 1rem;
		width: min(1000px, 100%);
		max-height: calc(100vh - 2rem);
		padding: 1.25rem;
		overflow: hidden;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--brass-500);
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.detail-tabs {
		display: flex;
		gap: 0.4rem;
		border-bottom: 1px solid var(--brass-500);
	}

	.detail-tab {
		position: relative;
		flex: 1 1 auto;
		padding: 0.55rem 0.75rem 0.7rem;
		border: 1px solid var(--paper-edge);
		border-bottom: 0;
		border-radius: 2px 2px 0 0;
		background: var(--paper-50);
		color: var(--ink-500);
		font-family: var(--font-ui);
		font-size: 0.9rem;
		font-weight: 600;
	}

	.detail-tab.active {
		color: var(--ink-900);
		background: var(--paper-200);
		border-color: var(--brass-500);
	}

	.tab-bookmark {
		left: 50%;
		top: -2px;
		transform: translateX(-50%);
		width: 0.6rem;
		height: 1.2rem;
	}

	.detail-panels {
		position: relative;
		min-height: 0;
		overflow: auto;
	}

	.detail-panel {
		display: none;
	}

	.detail-panel.active {
		display: block;
	}

	.pressure-summary {
		display: grid;
		gap: 0.35rem;
		border: 1px solid color-mix(in srgb, var(--wax-red) 55%, var(--paper-edge));
		border-radius: 2px;
		background: color-mix(in srgb, var(--wax-red) 7%, var(--paper-50));
		padding: 0.65rem 0.75rem;
		color: var(--wax-red);
	}

	.pressure-summary.neutral {
		border-color: var(--paper-edge);
		background: var(--paper-50);
		color: var(--ink-500);
	}

	.pressure-summary h3 {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.pressure-summary p,
	.pressure-summary ul {
		margin: 0;
		font-family: var(--font-body);
		font-size: 0.85rem;
	}

	.pressure-summary ul {
		display: grid;
		gap: 0.2rem;
		padding-left: 1rem;
	}
</style>
