<script lang="ts">
	import { asset } from '$app/paths';
	import { getStoreArt } from '$lib/assets/gameArt';
	import StoreStockTable from '$lib/components/game/StoreStockTable.svelte';
	import { getArchetype } from '$lib/game/archetypes';
	import type {
		ArchetypeId,
		CityTile,
		DailyStoreReport,
		OpeningOption,
		Store,
		StoreProductPatch
	} from '$lib/game/types';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';

	interface Props {
		tile: CityTile | null;
		store: Store | null;
		openingOptions: OpeningOption[];
		gameStarted: boolean;
		disabledReason: string | null;
		latestStoreReport: DailyStoreReport | null;
		onFoundStore: (archetypeId: ArchetypeId, tileId: string) => void;
		onOpenStore: (archetypeId: ArchetypeId, tileId: string) => void;
		onUpdateStoreProduct: (storeId: string, categoryId: string, patch: StoreProductPatch) => void;
		onClose: () => void;
	}

	let {
		tile,
		store,
		openingOptions,
		gameStarted,
		disabledReason,
		latestStoreReport,
		onFoundStore,
		onOpenStore,
		onUpdateStoreProduct,
		onClose
	}: Props = $props();

	type StoreInspectorTab = 'details' | 'stock';

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	const defaultDisabledReason = $derived.by(() => {
		if (!tile) {
			return 'Select a tile';
		}

		if (store) {
			return 'Occupied location';
		}

		if (tile.locked) {
			return 'Locked location';
		}

		return 'Unavailable location';
	});

	const storeArt = $derived(store ? getStoreArt(store.archetypeId) : null);
	const storeArtSrc = $derived(storeArt ? asset(storeArt.path) : '');
	const tileLabel = $derived(tile?.feature ? label(tile.feature) : tile ? label(tile.terrain) : '');
	let pendingOption = $state<OpeningOption | null>(null);
	let pendingTileId = $state<string | null>(null);
	let activeStoreTab = $state<StoreInspectorTab>('details');
	const pendingIsCurrent = $derived(Boolean(pendingOption && tile && pendingTileId === tile.id));
	const pendingArchetype = $derived(pendingOption ? getArchetype(pendingOption.archetypeId) : null);
	const pendingArt = $derived(pendingOption ? getStoreArt(pendingOption.archetypeId) : null);
	const pendingArtSrc = $derived(pendingArt ? asset(pendingArt.path) : '');

	function label(value: string): string {
		return value.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase());
	}

	function chooseOpeningOption(option: OpeningOption): void {
		if (!tile || option.disabledReason) {
			return;
		}

		pendingOption = option;
		pendingTileId = tile.id;
	}

	function cancelOpening(): void {
		pendingOption = null;
		pendingTileId = null;
	}

	function confirmOpening(): void {
		if (!pendingOption || !pendingTileId || !pendingIsCurrent) {
			return;
		}

		const archetypeId = pendingOption.archetypeId;
		const tileId = pendingTileId;
		cancelOpening();

		if (gameStarted) {
			onOpenStore(archetypeId, tileId);
		} else {
			onFoundStore(archetypeId, tileId);
		}

		onClose();
	}

	function closeInspector(): void {
		cancelOpening();
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

<aside class="inspector" aria-label="Tile inspector" {@attach blockMapInteraction}>
	<button type="button" class="close" aria-label="Close tile inspector" onclick={closeInspector}
		>×</button
	>
	{#if !tile}
		<h2>Select a city tile</h2>
		{#if gameStarted}
			<section aria-label="Expansion action">
				<p class="disabled-copy">{disabledReason ?? defaultDisabledReason}</p>
			</section>
		{/if}
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
			</div>
			{#if gameStarted && disabledReason}
				<section aria-label="Expansion action">
					<p class="disabled-copy">{disabledReason}</p>
				</section>
			{/if}
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

			{#if tile.locked}
				<section aria-label="Store type choices">
					<h3>Store type</h3>
					<p class="disabled-copy">Locked location</p>
				</section>
			{:else}
				<section aria-label="Store type choices">
					<h3>Store type</h3>
					{#if openingOptions.length > 0}
						<div class="store-type-actions">
							{#each openingOptions as option (option.archetypeId)}
								{@const archetype = getArchetype(option.archetypeId)}
								{@const art = getStoreArt(option.archetypeId)}
								<button
									type="button"
									disabled={option.disabledReason !== null}
									onclick={() => chooseOpeningOption(option)}
								>
									<span class="store-type-thumb">
										<img
											src={asset(art.path)}
											alt={art.alt}
											width="96"
											height="72"
											loading="lazy"
											decoding="async"
										/>
									</span>
									<span class="store-type-copy">
										<span>Open {archetype.name} here</span>
										<small>
											Setup {currency.format(option.forecast.setupCost)} · Revenue {currency.format(
												option.forecast.projectedDailyRevenue
											)}/day
										</small>
										{#if option.disabledReason}
											<small>{option.disabledReason}</small>
										{/if}
									</span>
								</button>
							{/each}
						</div>
					{:else}
						<p class="disabled-copy">No store types available</p>
					{/if}
				</section>
			{/if}
		{/if}
	{/if}

	{#if pendingOption && pendingArchetype && pendingArt && pendingIsCurrent}
		<div class="confirm-backdrop">
			<div class="confirm-popup" role="dialog" aria-modal="true" aria-label="Confirm store opening">
				<div class="confirm-heading">
					<div>
						<p>Confirm store</p>
						<h3>Open {pendingArchetype.name}?</h3>
					</div>
					<button
						type="button"
						class="confirm-close"
						aria-label="Cancel store opening"
						onclick={cancelOpening}
					>
						×
					</button>
				</div>
				<div class="confirm-store">
					<span class="confirm-thumb">
						<img
							src={pendingArtSrc}
							alt={pendingArt.alt}
							width="140"
							height="105"
							loading="lazy"
							decoding="async"
						/>
					</span>
					<div>
						<p>{tile ? label(tile.neighborhood) : 'Selected tile'}</p>
						<dl>
							<div>
								<dt>Setup</dt>
								<dd>{currency.format(pendingOption.forecast.setupCost)}</dd>
							</div>
							<div>
								<dt>Revenue</dt>
								<dd>{currency.format(pendingOption.forecast.projectedDailyRevenue)}/day</dd>
							</div>
						</dl>
					</div>
				</div>
				<div class="confirm-actions">
					<button type="button" class="secondary" onclick={cancelOpening}>Cancel</button>
					<button type="button" class="primary" onclick={confirmOpening}>Confirm opening</button>
				</div>
			</div>
		</div>
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
	dt,
	.disabled-copy {
		color: #b8b3a7;
	}

	.heading p,
	.heading span,
	dt,
	.disabled-copy {
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

	.store-panel {
		grid-area: 1 / 1;
		display: grid;
		visibility: hidden;
		pointer-events: none;
	}

	.store-panel.active {
		visibility: visible;
		pointer-events: auto;
	}

	.store-details {
		gap: 0.75rem;
	}

	.store-stock-panel {
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

	.store-type-actions {
		display: grid;
		gap: 0.5rem;
	}

	.store-tabs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
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

	.store-type-actions button {
		display: grid;
		grid-template-columns: 4.25rem minmax(0, 1fr);
		align-items: center;
		gap: 0.65rem;
		min-height: 4.4rem;
		padding: 0.5rem;
	}

	.store-type-thumb {
		display: block;
		width: 4.25rem;
		aspect-ratio: 4 / 3;
		overflow: hidden;
		border: 1px solid #3f4a42;
		border-radius: 6px;
		background: #eee4d3;
	}

	.store-type-thumb img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.store-type-copy {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
	}

	.store-type-actions small {
		color: #b8b3a7;
		font-size: 0.76rem;
		line-height: 1.25;
	}

	button:hover:not(:disabled),
	button:focus-visible:not(:disabled) {
		border-color: #d59b45;
		background: #3a2b18;
		outline: none;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}

	.confirm-backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgb(10 10 9 / 0.72);
		z-index: 60;
	}

	.confirm-popup {
		display: grid;
		gap: 0.75rem;
		width: min(100%, 22rem);
		border: 1px solid #5e503b;
		border-radius: 8px;
		background: #201f1c;
		padding: 0.85rem;
		box-shadow: 0 18px 50px rgb(0 0 0 / 0.45);
	}

	.confirm-heading,
	.confirm-store,
	.confirm-actions {
		display: flex;
		gap: 0.75rem;
	}

	.confirm-heading {
		align-items: flex-start;
		justify-content: space-between;
	}

	.confirm-heading p,
	.confirm-store p {
		margin: 0 0 0.2rem;
		color: #b8b3a7;
		font-size: 0.76rem;
	}

	.confirm-close {
		flex: 0 0 auto;
		width: 1.9rem;
		height: 1.9rem;
		border-radius: 999px;
		padding: 0;
		text-align: center;
	}

	.confirm-store {
		align-items: center;
	}

	.confirm-thumb {
		display: block;
		flex: 0 0 7rem;
		aspect-ratio: 4 / 3;
		overflow: hidden;
		border: 1px solid #3f4a42;
		border-radius: 6px;
		background: #eee4d3;
	}

	.confirm-thumb img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.confirm-store dl {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.confirm-actions {
		justify-content: flex-end;
	}

	.confirm-actions button {
		width: auto;
		min-width: 7rem;
		text-align: center;
	}

	.confirm-actions .primary {
		border-color: #d59b45;
		background: #6a4518;
	}
</style>
