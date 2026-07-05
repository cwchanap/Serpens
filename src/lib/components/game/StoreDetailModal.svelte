<script lang="ts">
	import StoreProductChainPanel from '$lib/components/game/StoreProductChainPanel.svelte';
	import StoreStaffPanel from '$lib/components/game/StoreStaffPanel.svelte';
	import StoreStockTable from '$lib/components/game/StoreStockTable.svelte';
	import { focusTrap } from '$lib/a11y/focusTrap';
	import type {
		DailyStoreReport,
		GameState,
		HiringCandidate,
		StaffMember,
		Store,
		StoreProductPatch
	} from '$lib/game/types';

	interface Props {
		game: GameState;
		store: Store;
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		latestStoreReport: DailyStoreReport | null;
		onUpdateStoreProduct: (storeId: string, categoryId: string, patch: StoreProductPatch) => void;
		onHireStaff: (candidateId: string) => void;
		onAssignStaff: (staffId: string, storeId: string) => void;
		onUnassignStaff: (staffId: string) => void;
		onClose: () => void;
		onClickFeedback?: () => void;
	}

	let {
		game,
		store,
		staff,
		hiringCandidates,
		latestStoreReport,
		onUpdateStoreProduct,
		onHireStaff,
		onAssignStaff,
		onUnassignStaff,
		onClose,
		onClickFeedback = () => {}
	}: Props = $props();

	type DetailTab = 'stock' | 'chain' | 'staff';

	const tabs: Array<{ id: DetailTab; label: string }> = [
		{ id: 'stock', label: 'Stock' },
		{ id: 'chain', label: 'Product Chain' },
		{ id: 'staff', label: 'Staff' }
	];

	let activeTab = $state<DetailTab>('stock');

	function selectTab(tab: DetailTab): void {
		onClickFeedback();
		activeTab = tab;
	}
</script>

<div class="detail-backdrop">
	<button type="button" class="backdrop-button" aria-hidden="true" tabindex="-1" onclick={onClose}
	></button>
	<div
		class="detail-modal paper"
		role="dialog"
		aria-modal="true"
		aria-label={store.name}
		{@attach focusTrap}
	>
		<header>
			<div>
				<p class="eyebrow">Store details</p>
				<h2>{store.name}</h2>
			</div>
			<button type="button" class="btn-danger" aria-label="Close store details" onclick={onClose}
				>Close</button
			>
		</header>

		<div class="detail-tabs" role="tablist" aria-label={`${store.name} sections`}>
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
					{tab.label}
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
				aria-hidden={activeTab !== 'stock'}
				inert={activeTab !== 'stock'}
			>
				<StoreStockTable {store} latestReport={latestStoreReport} onUpdate={onUpdateStoreProduct} />
			</div>
			<div
				class="detail-panel"
				class:active={activeTab === 'chain'}
				id={`${store.id}-chain-panel`}
				role="tabpanel"
				aria-labelledby={`${store.id}-chain-tab`}
				aria-hidden={activeTab !== 'chain'}
				inert={activeTab !== 'chain'}
			>
				<StoreProductChainPanel {game} {store} onInteractionFeedback={onClickFeedback} />
			</div>
			<div
				class="detail-panel"
				class:active={activeTab === 'staff'}
				id={`${store.id}-staff-panel`}
				role="tabpanel"
				aria-labelledby={`${store.id}-staff-tab`}
				aria-hidden={activeTab !== 'staff'}
				inert={activeTab !== 'staff'}
			>
				<StoreStaffPanel
					{store}
					{staff}
					{hiringCandidates}
					onHire={onHireStaff}
					onAssign={onAssignStaff}
					onUnassign={onUnassignStaff}
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
</style>
