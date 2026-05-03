<script lang="ts">
	import { asset } from '$app/paths';
	import { SHOP_STOREFRONT_ALT, SHOP_STOREFRONT_PATH } from '$lib/assets/gameArt';
	import { getArchetype } from '$lib/game/archetypes';
	import type { ArchetypeId, CityTile, OpeningForecast, Store } from '$lib/game/types';

	interface Props {
		tile: CityTile | null;
		store: Store | null;
		forecast: OpeningForecast | null;
		recommendations: ArchetypeId[];
		gameStarted: boolean;
		canOpenStore: boolean;
		disabledReason: string | null;
		onFoundStore: (archetypeId: ArchetypeId) => void;
		onOpenStore: () => void;
		onClose: () => void;
	}

	let {
		tile,
		store,
		forecast,
		recommendations,
		gameStarted,
		canOpenStore,
		disabledReason,
		onFoundStore,
		onOpenStore,
		onClose
	}: Props = $props();

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

	const shopStorefrontSrc = asset(SHOP_STOREFRONT_PATH);

	function label(value: string): string {
		return value.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase());
	}
</script>

<aside class="inspector" aria-label="Tile inspector">
	<button type="button" class="close" aria-label="Close tile inspector" onclick={onClose}>×</button>
	{#if !tile}
		<h2>Select a city tile</h2>
		{#if gameStarted}
			<section aria-label="Expansion action">
				<button type="button" class="primary" disabled onclick={onOpenStore}>
					Open store here
				</button>
				<p class="disabled-copy">{disabledReason ?? defaultDisabledReason}</p>
			</section>
		{/if}
	{:else}
		<div class="heading">
			<div>
				<p>{label(tile.neighborhood)}</p>
				<h2>Tile {tile.x}, {tile.y}</h2>
			</div>
			<span>{label(tile.terrain)}</span>
		</div>

		{#if store}
			<section aria-label="Store details">
				<div class="store-art">
					<img
						src={shopStorefrontSrc}
						alt={SHOP_STOREFRONT_ALT}
						width="1024"
						height="1024"
						loading="lazy"
						decoding="async"
					/>
				</div>
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
						<dt>Local demand</dt>
						<dd>{store.localDemand}</dd>
					</div>
				</dl>
			</section>
			{#if gameStarted && !canOpenStore}
				<section aria-label="Expansion action">
					<button type="button" class="primary" disabled onclick={onOpenStore}>
						Open store here
					</button>
					<p class="disabled-copy">{disabledReason ?? defaultDisabledReason}</p>
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

			{#if !gameStarted}
				<section aria-label="Recommended archetypes">
					<h3>Recommended</h3>
					<div class="actions">
						{#each recommendations as archetypeId (archetypeId)}
							{@const archetype = getArchetype(archetypeId)}
							<button
								type="button"
								disabled={tile.locked}
								onclick={() => onFoundStore(archetypeId)}
							>
								Open {archetype.name} here
							</button>
						{/each}
					</div>
					{#if forecast}
						<p class="forecast">
							Setup {currency.format(forecast.setupCost)} · Revenue {currency.format(
								forecast.projectedDailyRevenue
							)}/day
						</p>
					{/if}
					{#if tile.locked}
						<p class="disabled-copy">Locked location</p>
					{/if}
				</section>
			{:else}
				<section aria-label="Expansion action">
					<button type="button" class="primary" disabled={!canOpenStore} onclick={onOpenStore}>
						Open store here
					</button>
					{#if !canOpenStore}
						<p class="disabled-copy">{disabledReason ?? defaultDisabledReason}</p>
					{/if}
				</section>
			{/if}
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
	.forecast,
	.disabled-copy {
		color: #b8b3a7;
	}

	.heading p,
	.heading span,
	dt,
	.forecast,
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

	.store-art {
		aspect-ratio: 16 / 11;
		overflow: hidden;
		border: 1px solid #3f4a42;
		border-radius: 8px;
		background: #111814;
	}

	.store-art img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
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

	.actions {
		display: grid;
		gap: 0.5rem;
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

	.primary {
		border-color: #bf7e2b;
		background: #8a531d;
		text-align: center;
	}
</style>
