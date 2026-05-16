<script lang="ts">
	import { asset } from '$app/paths';
	import { getStoreArt } from '$lib/assets/gameArt';
	import StoreStaffPanel from '$lib/components/game/StoreStaffPanel.svelte';
	import StoreStockTable from '$lib/components/game/StoreStockTable.svelte';
	import type {
		CityTile,
		DailyStoreReport,
		HiringCandidate,
		StaffMember,
		Store,
		StoreProductPatch
	} from '$lib/game/types';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';

	interface Props {
		tile: CityTile | null;
		store: Store | null;
		staff: StaffMember[];
		hiringCandidates: HiringCandidate[];
		latestStoreReport: DailyStoreReport | null;
		onUpdateStoreProduct: (storeId: string, categoryId: string, patch: StoreProductPatch) => void;
		onHireStaff: (candidateId: string) => void;
		onAssignStaff: (staffId: string, storeId: string) => void;
		onUnassignStaff: (staffId: string) => void;
		onClose: () => void;
	}

	let {
		tile,
		store,
		staff,
		hiringCandidates,
		latestStoreReport,
		onUpdateStoreProduct,
		onHireStaff,
		onAssignStaff,
		onUnassignStaff,
		onClose
	}: Props = $props();

	type StoreInspectorTab = 'details' | 'stock' | 'staff';

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	const storeArt = $derived(store ? getStoreArt(store.archetypeId) : null);
	const storeArtSrc = $derived(storeArt ? asset(storeArt.path) : '');
	const tileLabel = $derived(tile?.feature ? label(tile.feature) : tile ? label(tile.terrain) : '');
	let activeStoreTab = $state<StoreInspectorTab>('details');

	function label(value: string): string {
		return value.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase());
	}

	function closeInspector(): void {
		onClose();
	}

	function selectStoreTab(tab: StoreInspectorTab): void {
		activeStoreTab = tab;
	}

	function stopMapInteraction(event: Event): void {
		event.stopPropagation();
	}

	const blockMapInteraction: Attachment<HTMLElement> = (node) => {
		const cleanups = [
			on(node, 'pointerdown', stopMapInteraction),
			on(node, 'pointerup', stopMapInteraction),
			on(node, 'click', stopMapInteraction)
		];

		return () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		};
	};
</script>

<aside
	class="inspector"
	class:store-inspector={store !== null}
	aria-label="Tile inspector"
	{@attach blockMapInteraction}
>
	<button type="button" class="close" aria-label="Close tile inspector" onclick={closeInspector}
		>×</button
	>
	{#if !tile}
		<h2>Select a city tile</h2>
	{:else}
		<div class="heading">
			<div>
				<p>{label(tile.neighborhood)}</p>
				<h2>Tile {tile.x}, {tile.y}</h2>
			</div>
			<span>{tileLabel}</span>
		</div>

		{#if store}
			<div class="store-tabs" role="tablist" aria-label={`${store.name} sections`}>
				<button
					type="button"
					class="store-tab"
					class:active={activeStoreTab === 'details'}
					role="tab"
					id={`${store.id}-details-tab`}
					aria-selected={activeStoreTab === 'details'}
					aria-controls={`${store.id}-details-panel`}
					tabindex={activeStoreTab === 'details' ? 0 : -1}
					onclick={() => selectStoreTab('details')}
				>
					Details
				</button>
				<button
					type="button"
					class="store-tab"
					class:active={activeStoreTab === 'stock'}
					role="tab"
					id={`${store.id}-stock-tab`}
					aria-selected={activeStoreTab === 'stock'}
					aria-controls={`${store.id}-stock-panel`}
					tabindex={activeStoreTab === 'stock' ? 0 : -1}
					onclick={() => selectStoreTab('stock')}
				>
					Stock
				</button>
				<button
					type="button"
					class="store-tab"
					class:active={activeStoreTab === 'staff'}
					role="tab"
					id={`${store.id}-staff-tab`}
					aria-selected={activeStoreTab === 'staff'}
					aria-controls={`${store.id}-staff-panel`}
					tabindex={activeStoreTab === 'staff' ? 0 : -1}
					onclick={() => selectStoreTab('staff')}
				>
					Staff
				</button>
			</div>

			<div class="store-tab-panels">
				<div
					class="store-panel store-details"
					class:active={activeStoreTab === 'details'}
					id={`${store.id}-details-panel`}
					role="tabpanel"
					aria-labelledby={`${store.id}-details-tab`}
					aria-hidden={activeStoreTab !== 'details'}
					inert={activeStoreTab !== 'details'}
				>
					{#if storeArt}
						<div class="store-art">
							<img
								src={storeArtSrc}
								alt={storeArt.alt}
								width="1024"
								height="1024"
								loading="lazy"
								decoding="async"
							/>
						</div>
					{/if}
					<h3>{store.name}</h3>
					<p class="location">{store.location}</p>
					<dl>
						<div>
							<dt>Stock health</dt>
							<dd>{store.stockHealth}</dd>
						</div>
						<div>
							<dt>Staff morale</dt>
							<dd>{store.staffMorale}</dd>
						</div>
						<div>
							<dt>Stock rows</dt>
							<dd>{store.products.length}</dd>
						</div>
					</dl>
				</div>
				<div
					class="store-panel store-stock-panel"
					class:active={activeStoreTab === 'stock'}
					id={`${store.id}-stock-panel`}
					role="tabpanel"
					aria-labelledby={`${store.id}-stock-tab`}
					aria-hidden={activeStoreTab !== 'stock'}
					inert={activeStoreTab !== 'stock'}
				>
					<StoreStockTable
						{store}
						latestReport={latestStoreReport}
						onUpdate={onUpdateStoreProduct}
					/>
				</div>
				<div
					class="store-panel store-staff-panel"
					class:active={activeStoreTab === 'staff'}
					id={`${store.id}-staff-panel`}
					role="tabpanel"
					aria-labelledby={`${store.id}-staff-tab`}
					aria-hidden={activeStoreTab !== 'staff'}
					inert={activeStoreTab !== 'staff'}
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
		{:else}
			<section aria-label="Tile stats">
				<dl>
					<div>
						<dt>Demand</dt>
						<dd>{tile.demand}</dd>
					</div>
					<div>
						<dt>Rent</dt>
						<dd>{currency.format(tile.rent)}</dd>
					</div>
					<div>
						<dt>Foot traffic</dt>
						<dd>{tile.footTraffic}</dd>
					</div>
					<div>
						<dt>Customer fit</dt>
						<dd>{tile.customerFit}</dd>
					</div>
				</dl>
			</section>
		{/if}
	{/if}
</aside>

<style>
	.inspector {
		position: relative;
		display: grid;
		align-content: start;
		gap: 1rem;
		min-width: 0;
		border: 1px solid #343434;
		border-radius: 8px;
		background: #1a1a18;
		padding: 1rem;
		box-shadow: 0 24px 70px rgb(0 0 0 / 0.38);
	}

	.inspector.store-inspector {
		grid-template-rows: auto auto minmax(0, 1fr);
		height: min(37rem, calc(100dvh - 6.9rem));
		overflow: hidden;
	}

	.close {
		position: absolute;
		top: 0.65rem;
		right: 0.65rem;
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		padding: 0;
		text-align: center;
	}

	.heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	h2,
	h3,
	p,
	dl {
		margin: 0;
	}

	h2 {
		font-size: 1.2rem;
		line-height: 1.15;
	}

	h3 {
		font-size: 0.94rem;
	}

	.heading p,
	.location,
	dt {
		color: #b8b3a7;
	}

	.heading p,
	.heading span,
	dt {
		font-size: 0.78rem;
	}

	.heading span {
		flex: 0 0 auto;
		border: 1px solid #504a3f;
		border-radius: 999px;
		color: #f3d28d;
		padding: 0.2rem 0.45rem;
	}

	section {
		display: grid;
		gap: 0.75rem;
	}

	.store-tab-panels {
		display: grid;
	}

	.inspector.store-inspector .store-tab-panels {
		min-height: 0;
		overflow: hidden;
	}

	.store-panel {
		display: none;
	}

	.store-panel.active {
		display: grid;
	}

	.inspector.store-inspector .store-panel.active {
		min-height: 0;
		overflow: auto;
		padding-right: 0.15rem;
	}

	.store-details {
		gap: 0.75rem;
	}

	.store-stock-panel,
	.store-staff-panel {
		align-content: start;
	}

	.store-art {
		justify-self: start;
		width: min(100%, 22rem);
		max-height: 14rem;
		aspect-ratio: 16 / 11;
		overflow: hidden;
		border: 1px solid #3f4a42;
		border-radius: 8px;
		background: #f6efe2;
	}

	.store-art img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	dd {
		margin: 0.18rem 0 0;
		font-weight: 750;
	}

	.store-tabs {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.4rem;
	}

	button {
		width: 100%;
		border: 1px solid #4a4a45;
		border-radius: 6px;
		background: #282724;
		color: #f7f2e8;
		padding: 0.65rem 0.75rem;
		text-align: left;
	}

	.store-tab {
		min-height: 2.3rem;
		padding: 0.45rem 0.65rem;
		text-align: center;
	}

	.store-tab.active {
		border-color: #d59b45;
		background: #4a3217;
		color: #ffe7b7;
	}

	button:hover:not(:disabled),
	button:focus-visible:not(:disabled) {
		border-color: #d59b45;
		background: #3a2b18;
		outline: none;
	}
</style>
