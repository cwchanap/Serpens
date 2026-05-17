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
					{#if activeStoreTab === 'details'}<span class="bookmark tab-bookmark" aria-hidden="true"
						></span>{/if}
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
					{#if activeStoreTab === 'stock'}<span class="bookmark tab-bookmark" aria-hidden="true"
						></span>{/if}
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
					{#if activeStoreTab === 'staff'}<span class="bookmark tab-bookmark" aria-hidden="true"
						></span>{/if}
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
		padding: 1rem 1.1rem 1.1rem;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background-color: var(--paper-100);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		color: var(--ink-700);
		box-shadow:
			inset 0 0 0 2px var(--paper-100),
			inset 0 0 0 3px var(--brass-500),
			var(--shadow-paper);
	}

	.inspector.store-inspector {
		grid-template-rows: auto auto minmax(0, 1fr);
		height: min(37rem, calc(100dvh - 6.9rem));
		overflow: hidden;
	}

	.close {
		position: absolute;
		top: 0.7rem;
		right: 0.7rem;
		width: 1.9rem;
		height: 1.9rem;
		padding: 0;
		border: 1px solid var(--ink-700);
		border-radius: 999px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-weight: 700;
		text-align: center;
	}

	.close:hover {
		background: var(--paper-200);
	}

	.heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding-right: 2.2rem;
	}

	h2,
	h3,
	p,
	dl {
		margin: 0;
	}

	h2 {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 400;
		line-height: 1.1;
		color: var(--ink-700);
	}

	h3 {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.heading p {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.location {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.86rem;
	}

	dt {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	.heading span {
		flex: 0 0 auto;
		border: 1px solid var(--brass-500);
		border-radius: 999px;
		color: var(--ink-700);
		background: var(--paper-50);
		padding: 0.2rem 0.55rem;
		font-family: var(--font-ui);
		font-size: 0.74rem;
		font-weight: 600;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 0.6rem;
	}

	dd {
		margin: 0.2rem 0 0;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-weight: 700;
		color: var(--ink-700);
		overflow-wrap: anywhere;
	}

	.store-tabs {
		display: flex;
		gap: 0.4rem;
		border-bottom: 1px solid var(--brass-500);
	}

	.store-tab {
		position: relative;
		flex: 1 1 auto;
		padding: 0.55rem 0.75rem 0.7rem;
		border: 1px solid var(--paper-edge);
		border-bottom: 0;
		border-radius: 2px 2px 0 0;
		background: var(--paper-50);
		color: var(--ink-500);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: 600;
	}

	.store-tab.active {
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

	.store-tab-panels {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
	}

	.store-panel {
		display: none;
	}

	.store-panel.active {
		display: grid;
		gap: 0.85rem;
	}

	.store-art {
		display: grid;
		place-items: center;
		padding: 0.5rem;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
	}

	.store-art img {
		width: min(160px, 100%);
		height: auto;
	}
</style>
