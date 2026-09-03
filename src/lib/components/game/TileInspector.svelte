<script lang="ts">
	import { asset } from '$app/paths';
	import { getProductArt, getStoreArt } from '$lib/assets/gameArt';
	import { getStoreProductStatus } from '$lib/game/stock';
	import { getStoreOrdinal } from '$lib/game/state';
	import {
		MAX_STORE_LEVEL,
		STORE_MILESTONE_CAPACITY_BONUS,
		STORE_MILESTONE_LEVELS,
		canUpgradeStore,
		getStoreUpgradeCost,
		getUnlockedProductCount,
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
		canUpgradeStore?: boolean;
		disabledReason?: string | null;
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
		onClickFeedback = () => {},
		canUpgradeStore: upgradeAllowed = true,
		disabledReason = null
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
					productNumber: i18n.format.integer(getUnlockedProductCount(store.level + 1)),
					staffCapacity: i18n.format.integer(STORE_MILESTONE_CAPACITY_BONUS)
				})
			: i18n.t('tileInspector.nextBenefit.revenue');
	});

	const attentionMessage = $derived(store ? localizeStockTrouble(store.products, i18n) : null);
	const troubleProducts = $derived(
		store ? store.products.filter((product) => getStoreProductStatus(product) !== 'Healthy') : []
	);
	const dailyRevenue = $derived(latestStoreReport?.revenue ?? null);
	// Same real series the LAST 7 DAYS total sums: this store's daily revenue over
	// the trailing 7 reports, oldest first.
	const weekSeries = $derived.by(() => {
		if (!store) return [] as number[];
		const storeId = store.id;
		return game.reports
			.slice(-7)
			.map(
				(report) => report.storeReports.find((entry) => entry.storeId === storeId)?.revenue ?? 0
			);
	});
	const weekRevenue = $derived(weekSeries.reduce((sum, value) => sum + value, 0));

	const levelPips = $derived.by(() => {
		if (!store) return [] as boolean[];
		const level = store.level;
		if (level >= MAX_STORE_LEVEL) {
			return Array.from({ length: MAX_STORE_LEVEL }, () => true);
		}
		const previousMilestone =
			[...STORE_MILESTONE_LEVELS].reverse().find((milestone) => milestone <= level) ?? 0;
		const nextMilestone =
			STORE_MILESTONE_LEVELS.find((milestone) => milestone > level) ?? MAX_STORE_LEVEL;
		return Array.from(
			{ length: nextMilestone - previousMilestone },
			(_, index) => index < level - previousMilestone
		);
	});

	function vitalArcColor(value: number): string {
		if (value >= 70) return 'var(--moss)';
		if (value >= 40) return 'var(--brass-500)';
		return 'var(--wax-red)';
	}

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

{#snippet levelPipRow()}
	<ul class="pips" data-testid="level-pips" aria-hidden="true">
		{#each levelPips as filled, index (index)}
			<li class="pip" class:filled data-testid="level-pip"></li>
		{/each}
	</ul>
{/snippet}

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
				{#if !store}<p>{i18n.labels.neighborhood(tile.neighborhood)}</p>{/if}
				<h2>{i18n.t('tileInspector.tileHeading', { x: tile.x, y: tile.y })}</h2>
			</div>
			<span>{tileLabel}</span>
		</div>

		{#if store}
			<div class="basic-card">
				{#if storeArt}
					<figure class="store-art">
						<img
							src={storeArtSrc}
							alt=""
							data-testid={`store-art-${store.archetypeId}`}
							width="1024"
							height="1024"
							loading="lazy"
							decoding="async"
						/>
						<figcaption class="store-identity">
							{#if tile}<p class="district">{i18n.labels.neighborhood(tile.neighborhood)}</p>{/if}
							<h3>{storeDisplayName(store, getStoreOrdinal(game.stores, store.id), i18n)}</h3>
							{@render levelPipRow()}
							<p class="location">{formatStoreLocation(store.location, i18n)}</p>
						</figcaption>
					</figure>
				{:else}
					<div class="store-identity plain">
						{#if tile}<p class="district">{i18n.labels.neighborhood(tile.neighborhood)}</p>{/if}
						<h3>{storeDisplayName(store, getStoreOrdinal(game.stores, store.id), i18n)}</h3>
						{@render levelPipRow()}
						<p class="location">{formatStoreLocation(store.location, i18n)}</p>
					</div>
				{/if}

				<p class="week" data-testid="week-revenue">
					<span class="week-label">{i18n.t('tileInspector.last7Days')}</span>
					{#if weekSeries.length > 0}
						{@const peak = Math.max(...weekSeries)}
						<span class="week-spark" aria-hidden="true" data-testid="week-spark">
							{#each weekSeries as value, index (index)}
								<span
									class="week-spark-bar"
									style:height={`${peak > 0 ? Math.round((value / peak) * 100) : 0}%`}
								></span>
							{/each}
						</span>
					{/if}
					<span class="week-value">{i18n.format.currency(weekRevenue)}</span>
				</p>

				<dl
					class="gauges"
					aria-label={i18n.t('tileInspector.storeVitals')}
					data-testid="store-gauges"
				>
					<div class="gauge" data-testid="gauge-revenue">
						<dt>{i18n.t('tileInspector.revenuePerDay')}</dt>
						<dd class="medallion">
							<span class="value">
								{dailyRevenue === null ? '—' : i18n.format.currency(dailyRevenue)}
							</span>
						</dd>
					</div>
					<div class="gauge" data-testid="gauge-stock-health">
						<dt>{i18n.t('tileInspector.stockHealth')}</dt>
						<dd class="medallion dial">
							<svg viewBox="0 0 44 44" aria-hidden="true" data-testid="gauge-arc-stock-health">
								<path class="track" d="M6 26a16 16 0 0 1 32 0" pathLength="100"></path>
								{#if store.stockHealth > 0}
									<path
										class="arc"
										d="M6 26a16 16 0 0 1 32 0"
										pathLength="100"
										style:stroke-dasharray="{store.stockHealth} 100"
										style:stroke={vitalArcColor(store.stockHealth)}
									></path>
								{/if}
							</svg>
							<span class="value">{store.stockHealth}</span>
						</dd>
					</div>
					<div class="gauge" data-testid="gauge-staff-morale">
						<dt>{i18n.t('tileInspector.staffMorale')}</dt>
						<dd class="medallion dial">
							<svg viewBox="0 0 44 44" aria-hidden="true" data-testid="gauge-arc-staff-morale">
								<path class="track" d="M6 26a16 16 0 0 1 32 0" pathLength="100"></path>
								{#if store.staffMorale > 0}
									<path
										class="arc"
										d="M6 26a16 16 0 0 1 32 0"
										pathLength="100"
										style:stroke-dasharray="{store.staffMorale} 100"
										style:stroke={vitalArcColor(store.staffMorale)}
									></path>
								{/if}
							</svg>
							<span class="value">{store.staffMorale}</span>
						</dd>
					</div>
				</dl>

				{#if attentionMessage}
					<div class="attention" data-testid="attention-band">
						<p class="attention-copy">
							<span class="seal" data-urgent="true">!</span>
							{attentionMessage}
						</p>
						{#if troubleProducts.length > 0}
							<ul class="attention-products" data-testid="attention-products">
								{#each troubleProducts as product (product.productId)}
									{@const art = getProductArt(product.productId)}
									<li>
										<img
											src={asset(art.path)}
											alt=""
											data-testid={`attention-product-art-${product.productId}`}
											loading="lazy"
											decoding="async"
										/>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
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
						disabled={!upgradeAllowed || !storeCanUpgrade || !canAffordUpgrade}
						onclick={() => {
							if (upgradeAllowed) onUpgradeStore(store.id);
						}}
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
					{#if !upgradeAllowed && disabledReason}
						<p class="level-hint">{disabledReason}</p>
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

	/* --- LAST 7 DAYS revenue row + spark ------------------------------------ */

	.week {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin: 0;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
	}

	.week-spark {
		flex: none;
		display: flex;
		align-items: flex-end;
		gap: 0.15rem;
		height: 1.7rem;
	}

	.week-spark-bar {
		display: block;
		flex: 0 0 0.45rem;
		min-width: 0;
		background: var(--brass-500);
	}

	.week-label {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.week-value {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-weight: 700;
		color: var(--ink-700);
	}

	/* --- Brass gauge medallions ---------------------------------------------- */

	.gauges {
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
	}

	.gauge {
		display: grid;
		justify-items: center;
		gap: 0.4rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.7rem 0.4rem 0.65rem;
		text-align: center;
	}

	.gauge dt {
		order: 2;
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.medallion {
		position: relative;
		display: grid;
		place-items: center;
		width: 4.9rem;
		height: 4.9rem;
		margin: 0;
		border: 2px solid var(--brass-500);
		border-radius: 999px;
		background: var(--paper-100);
		box-shadow: inset 0 0 0 2px var(--paper-50);
	}

	.medallion svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.medallion .track,
	.medallion .arc {
		fill: none;
		stroke-width: 6;
		stroke-linecap: round;
	}

	.medallion .track {
		stroke: var(--brass-100);
	}

	.medallion .value {
		padding: 0 0.35rem;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-weight: 700;
		font-size: 1.08rem;
		color: var(--ink-700);
	}

	/* Scorecard-style open-bottom dial arcs: the value sits in the dial mouth. */
	.medallion.dial .value {
		align-self: end;
		justify-self: center;
		margin-bottom: 0.62rem;
	}

	/* --- Wax-red attention band ----------------------------------------------- */

	.attention {
		display: grid;
		gap: 0.5rem;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--wax-red);
		border-radius: 2px;
		background: color-mix(in srgb, var(--wax-red) 10%, var(--paper-50));
	}

	.attention-copy {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		color: var(--wax-red);
		font-family: var(--font-body);
		font-size: 0.85rem;
	}

	.attention-products {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.attention-products img {
		display: block;
		width: 2.5rem;
		height: 2.5rem;
		object-fit: cover;
		border: 1px solid var(--wax-red);
		border-radius: 2px;
		background: var(--paper-100);
	}

	/* --- Store art + identity + level pips ------------------------------------ */

	.store-art {
		position: relative;
		margin: 0;
		height: 220px;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background: radial-gradient(130% 90% at 50% 8%, var(--walnut-700) 0%, var(--walnut-900) 82%);
		overflow: hidden;
		box-shadow:
			inset 0 0 0 2px var(--walnut-800),
			inset 0 -3rem 3.5rem rgba(10, 7, 3, 0.38);
	}

	.store-art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.store-art::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(to bottom, rgba(16, 12, 7, 0.26), transparent 42%);
	}

	/* Dark ink hero plate: the identity reads pale-on-dark over the art
	   instead of the old pale paper banner. */
	.store-identity {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		display: grid;
		grid-template-columns: 1fr;
		justify-items: start;
		gap: 0.14rem;
		padding: 2.6rem 0.85rem 0.72rem;
		background: linear-gradient(
			to top,
			rgba(14, 10, 5, 0.96) 24%,
			rgba(14, 10, 5, 0.78) 52%,
			rgba(14, 10, 5, 0) 100%
		);
	}

	.district {
		margin: 0;
		color: var(--brass-300);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
	}

	.store-identity h3 {
		color: var(--paper-50);
		font-size: 1.5rem;
		line-height: 1.04;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
	}

	.store-identity .pips {
		margin-top: 0.24rem;
	}

	.store-identity .location {
		margin-top: 0.2rem;
		color: var(--paper-200);
		font-family: var(--font-body);
		font-size: 0.84rem;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
	}

	.store-identity.plain {
		position: static;
		padding: 0;
		background: none;
	}

	.store-identity.plain h3 {
		color: var(--ink-700);
		font-size: 1.15rem;
		text-shadow: none;
	}

	.store-identity.plain .district {
		color: var(--brass-700);
		text-shadow: none;
	}

	.store-identity.plain .location {
		color: var(--ink-500);
		text-shadow: none;
	}

	.pips {
		display: flex;
		gap: 0.3rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.pip {
		width: 0.58rem;
		height: 0.58rem;
		border: 1px solid var(--brass-700);
		border-radius: 999px;
		background: var(--paper-100);
	}

	.pip.filled {
		background: var(--brass-500);
	}

	/* On the dark hero the pips switch to the pale palette (larger dots,
	   bright gold fill vs. open dark ring) so the level row stays legible. */
	.store-identity:not(.plain) .pip {
		width: 0.68rem;
		height: 0.68rem;
		border-color: var(--paper-300);
		background: transparent;
		box-shadow: inset 0 0 0 1px rgba(251, 243, 220, 0.18);
	}

	.store-identity:not(.plain) .pip.filled {
		background: var(--brass-300);
		border-color: var(--brass-300);
	}

	/* --- Level + actions ------------------------------------------------------- */

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
		padding: 0.55rem 0.85rem;
		border: 1px solid var(--ink-900);
		border-radius: 2px;
		background: var(--moss);
		color: var(--paper-50);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		cursor: pointer;
		box-shadow:
			inset 0 0 0 1px var(--moss-2),
			var(--shadow-paper);
	}

	.upgrade:hover:not(:disabled) {
		background: var(--moss-2);
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
