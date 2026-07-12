<script lang="ts">
	import { asset } from '$app/paths';
	import { getStoreArt } from '$lib/assets/gameArt';
	import { getStoreOrdinal } from '$lib/game/state';
	import {
		MAX_STORE_LEVEL,
		STORE_MILESTONE_CAPACITY_BONUS,
		canUpgradeStore,
		getStoreUpgradeCost,
		getUnlockedCategoryCount,
		isMilestoneLevel
	} from '$lib/game/leveling';
	import { formatStoreLocation, localizeStockTrouble, storeDisplayName } from '$lib/i18n/gameCopy';
	import type { I18nBundle } from '$lib/i18n';
	import type { CityTile, DailyStoreReport, GameState, Store } from '$lib/game/types';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';

	interface Props {
		game: GameState;
		tile: CityTile | null;
		store: Store | null;
		latestStoreReport: DailyStoreReport | null;
		i18n: I18nBundle;
		onUpgradeStore?: (storeId: string) => void;
		onOpenDetails: () => void;
		onClose: () => void;
		onClickFeedback?: () => void;
	}

	let {
		game,
		tile,
		store,
		latestStoreReport,
		i18n,
		onUpgradeStore = () => {},
		onOpenDetails,
		onClose,
		onClickFeedback = () => {}
	}: Props = $props();

	const storeArt = $derived(store ? getStoreArt(store.archetypeId) : null);
	const storeArtSrc = $derived(storeArt ? asset(storeArt.path) : '');
	const tileLabel = $derived(
		tile?.feature
			? i18n.labels.tileFeature(tile.feature)
			: tile
				? i18n.labels.terrain(tile.terrain)
				: ''
	);

	const upgradeCost = $derived(store ? getStoreUpgradeCost(store.level) : 0);
	const canAffordUpgrade = $derived(store ? game.cash >= upgradeCost : false);
	const storeCanUpgrade = $derived(store ? canUpgradeStore(store.level) : false);
	const nextBenefit = $derived.by(() => {
		if (!store || !storeCanUpgrade) return i18n.t('tileInspector.maxLevel');
		return isMilestoneLevel(store.level + 1)
			? i18n.t('tileInspector.nextBenefit.unlockProductStaff', {
					productNumber: i18n.format.integer(getUnlockedCategoryCount(store.level + 1)),
					staffCapacity: i18n.format.integer(STORE_MILESTONE_CAPACITY_BONUS)
				})
			: i18n.t('tileInspector.nextBenefit.revenue');
	});

	const attentionMessage = $derived(store ? localizeStockTrouble(store.products, i18n) : null);
	const dailyRevenue = $derived(latestStoreReport?.revenue ?? null);

	function closeInspector(): void {
		onClickFeedback();
		onClose();
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
	aria-label={i18n.t('tileInspector.ariaLabel')}
	{@attach blockMapInteraction}
>
	<button
		type="button"
		class="close"
		aria-label={i18n.t('tileInspector.close')}
		onclick={closeInspector}>×</button
	>
	{#if !tile}
		<h2>{i18n.t('tileInspector.selectTile')}</h2>
	{:else}
		<div class="heading">
			<div>
				<p>{i18n.labels.neighborhood(tile.neighborhood)}</p>
				<h2>{i18n.t('tileInspector.tileHeading', { x: tile.x, y: tile.y })}</h2>
			</div>
			<span>{tileLabel}</span>
		</div>

		{#if store}
			<div class="basic-card">
				{#if storeArt}
					<div class="store-art">
						<img
							src={storeArtSrc}
							alt=""
							data-testid={`store-art-${store.archetypeId}`}
							width="1024"
							height="1024"
							loading="lazy"
							decoding="async"
						/>
					</div>
				{/if}
				<h3>{storeDisplayName(store, getStoreOrdinal(game.stores, store.id), i18n)}</h3>
				<p class="location">{formatStoreLocation(store.location, i18n)}</p>

				<dl class="gauges" aria-label={i18n.t('tileInspector.storeVitals')}>
					<div class="gauge">
						<dt>{i18n.t('tileInspector.revenuePerDay')}</dt>
						<dd>{dailyRevenue === null ? '—' : i18n.format.currency(dailyRevenue)}</dd>
					</div>
					<div class="gauge">
						<dt>{i18n.t('tileInspector.stockHealth')}</dt>
						<dd>{store.stockHealth}</dd>
					</div>
					<div class="gauge">
						<dt>{i18n.t('tileInspector.staffMorale')}</dt>
						<dd>{store.staffMorale}</dd>
					</div>
				</dl>

				{#if attentionMessage}
					<p class="attention"><span class="seal" data-urgent="true">!</span> {attentionMessage}</p>
				{/if}

				<div class="store-level">
					<p class="level-label">
						{i18n.t('tileInspector.level', {
							level: i18n.format.integer(store.level),
							max: i18n.format.integer(MAX_STORE_LEVEL)
						})}
					</p>
					<p class="level-next">{i18n.t('tileInspector.nextLabel', { benefit: nextBenefit })}</p>
					<button
						type="button"
						class="upgrade"
						disabled={!storeCanUpgrade || !canAffordUpgrade}
						onclick={() => onUpgradeStore(store.id)}
					>
						{storeCanUpgrade
							? i18n.t('tileInspector.upgrade', {
									cost: i18n.format.currency(upgradeCost)
								})
							: i18n.t('tileInspector.maxLevel')}
					</button>
					{#if storeCanUpgrade && !canAffordUpgrade}
						<p class="level-hint">{i18n.t('tileInspector.notEnoughCash')}</p>
					{/if}
				</div>

				<button type="button" class="open-details" onclick={onOpenDetails}
					>{i18n.t('tileInspector.openDetails')}</button
				>
			</div>
		{:else}
			<section aria-label={i18n.t('tileInspector.tileStats')}>
				<dl>
					<div>
						<dt>{i18n.t('tileInspector.demand')}</dt>
						<dd>{tile.demand}</dd>
					</div>
					<div>
						<dt>{i18n.t('tileInspector.rent')}</dt>
						<dd>{i18n.format.currency(tile.rent)}</dd>
					</div>
					<div>
						<dt>{i18n.t('tileInspector.footTraffic')}</dt>
						<dd>{tile.footTraffic}</dd>
					</div>
					<div>
						<dt>{i18n.t('tileInspector.customerFit')}</dt>
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

	.basic-card {
		display: grid;
		gap: 0.85rem;
	}

	.gauges {
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}

	.gauge {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.45rem 0.5rem;
		text-align: center;
	}

	.gauge dt {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.gauge dd {
		margin: 0.25rem 0 0;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-weight: 700;
		color: var(--ink-700);
	}

	.attention {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		color: var(--wax-red);
		font-family: var(--font-body);
		font-size: 0.85rem;
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

	.store-level {
		display: grid;
		gap: 0.4rem;
		padding: 0.75rem;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-50);
	}

	.level-label {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: var(--ink-700);
	}

	.level-next {
		font-family: var(--font-body);
		font-size: 0.8rem;
		color: var(--ink-500);
	}

	.level-hint {
		font-family: var(--font-body);
		font-size: 0.78rem;
		color: var(--ink-500);
	}

	.upgrade {
		padding: 0.45rem 0.85rem;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
	}

	.upgrade:hover:not(:disabled) {
		background: var(--paper-200);
	}

	.upgrade:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.open-details {
		width: 100%;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-weight: 700;
		padding: 0.55rem 0.75rem;
	}

	.open-details:hover,
	.open-details:focus-visible {
		background: var(--paper-200);
	}
</style>
