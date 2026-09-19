<script lang="ts">
	import { asset } from '$app/paths';
	import { getProductArt, getStoreArt } from '$lib/assets/gameArt';
	import HudIcon from './HudIcon.svelte';
	import StaffPortrait from './StaffPortrait.svelte';
	import { getStoreProductStock } from '$lib/game/stock';
	import { ARCHETYPES } from '$lib/game/archetypes';
	import { summarizeStoreStaffing } from '$lib/game/staffing';
	import { getStoreOrdinal, previewStoreUpgrade } from '$lib/game/state';
	import { isGameRouteCommitted, type GameRouteCommitResult } from '$lib/game/commandResult';
	import { MAX_STORE_LEVEL } from '$lib/game/leveling';
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
		onUpgradeStore?: (storeId: string) => Promise<GameRouteCommitResult | null>;
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
		onUpgradeStore = async () => null,
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

	// Display-only projection; shown regardless of cash or command availability.
	const storeHasKnownArchetype = $derived(
		store ? ARCHETYPES.some((archetype) => archetype.id === store.archetypeId) : false
	);
	const upgradePreview = $derived(
		store && storeHasKnownArchetype ? previewStoreUpgrade(store) : null
	);
	const upgradeCost = $derived(upgradePreview?.cost ?? 0);
	const canAffordUpgrade = $derived(store ? game.cash >= upgradeCost : false);
	const storeCanUpgrade = $derived(upgradePreview !== null);
	const upgradeRevenueChanged = $derived(
		upgradePreview !== null &&
			upgradePreview.revenueMultiplierBefore !== upgradePreview.revenueMultiplierAfter
	);
	const upgradeProduct = $derived(upgradePreview?.unlockedProductId ?? null);
	const upgradeProductArt = $derived(upgradeProduct ? getProductArt(upgradeProduct) : null);
	const upgradeProductName = $derived(
		upgradeProduct ? i18n.labels.productCategory(upgradeProduct) : ''
	);
	const upgradeCapacityChanged = $derived(
		upgradePreview !== null &&
			upgradePreview.staffCapacityBefore !== upgradePreview.staffCapacityAfter
	);
	const upgradeStaffingChanged = $derived(
		upgradePreview !== null &&
			(upgradePreview.staffingRequirementBefore.manager !==
				upgradePreview.staffingRequirementAfter.manager ||
				upgradePreview.staffingRequirementBefore.general !==
					upgradePreview.staffingRequirementAfter.general)
	);
	// Only future milestones; the milestone this upgrade unlocks is its own row.
	const upgradeNextMilestone = $derived(
		upgradePreview?.nextProductMilestone &&
			upgradePreview.nextProductMilestone.level !== upgradePreview.nextLevel
			? upgradePreview.nextProductMilestone
			: null
	);

	const attentionMessage = $derived(store ? localizeStockTrouble(store.products, i18n) : null);
	const staffing = $derived(
		store && storeHasKnownArchetype ? summarizeStoreStaffing(game, store) : null
	);
	const onShiftStaff = $derived(
		store ? game.staff.filter((person) => person.assignedStoreId === store.id).slice(0, 5) : []
	);
	const revenueHistory = $derived(
		game.reports
			.slice(-14)
			.map((report) => report.storeReports.find((item) => item.storeId === store?.id)?.revenue ?? 0)
	);
	const revenuePoints = $derived(
		revenueHistory
			.map(
				(value, index) =>
					`${(index / Math.max(1, revenueHistory.length - 1)) * 160},${36 - (value / Math.max(1, ...revenueHistory)) * 32}`
			)
			.join(' ')
	);
	const dailyRevenue = $derived(latestStoreReport?.revenue ?? null);

	type UpgradeAckKind = 'success' | 'unchanged' | 'not-applied';
	let upgradePending = $state(false);
	let upgradeAck = $state<{ kind: UpgradeAckKind; milestoneUnlocked: boolean } | null>(null);

	// One-shot acknowledgement: changing the selected store retires the status,
	// and returning to that store never replays it.
	$effect(() => {
		void store?.id;
		upgradeAck = null;
	});

	const upgradeAckText = $derived(
		upgradeAck === null
			? ''
			: upgradeAck.kind === 'success'
				? i18n.t('tileInspector.upgradeStatus.success')
				: upgradeAck.kind === 'unchanged'
					? i18n.t('tileInspector.upgradeStatus.unchanged')
					: i18n.t('tileInspector.upgradeStatus.notApplied')
	);

	async function handleUpgrade(): Promise<void> {
		if (upgradePending || !upgradeAllowed || !store || !upgradePreview || !canAffordUpgrade) return;
		const sourceStoreId = store.id;
		const sourcePreview = upgradePreview;
		upgradePending = true;
		try {
			const result = await onUpgradeStore(sourceStoreId);
			// A late settle after switching stores is dropped, not acknowledged.
			if (store?.id !== sourceStoreId) return;
			let kind: UpgradeAckKind = 'not-applied';
			if (isGameRouteCommitted(result)) {
				kind = 'success';
			} else if (
				result?.status === 'unchanged' ||
				(result?.status === 'sandbox-committed' && !result.changed)
			) {
				kind = 'unchanged';
			}
			upgradeAck = {
				kind,
				milestoneUnlocked: sourcePreview.unlockedProductId !== null
			};
		} finally {
			upgradePending = false;
		}
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

<aside
	class="inspector"
	aria-label={i18n.t('tileInspector.ariaLabel')}
	{@attach blockMapInteraction}
>
	<div class="dossier paper">
		<button
			type="button"
			class="close"
			aria-label={i18n.t('tileInspector.close')}
			onclick={closeInspector}>×</button
		>
		{#if store && tile}
			<header class="store-heading">
				{#if storeArt}<img
						class="store-art"
						src={storeArtSrc}
						alt=""
						data-testid={`store-art-${store.archetypeId}`}
						width="56"
						height="56"
					/>{/if}
				<div>
					<p class="eyebrow">{formatStoreLocation(store.location, i18n)}</p>
					<h3>{storeDisplayName(store, getStoreOrdinal(game.stores, store.id), i18n)}</h3>
				</div>
				<span
					class="seal level"
					title={i18n.t('tileInspector.level', {
						level: i18n.format.integer(store.level),
						max: i18n.format.integer(MAX_STORE_LEVEL)
					})}
					>{['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][store.level - 1] ??
						store.level}</span
				>
			</header>
			<div class="revenue">
				<div>
					<p class="eyebrow">{i18n.t('tileInspector.revenuePerDay')}</p>
					<strong>{dailyRevenue === null ? '—' : i18n.format.currency(dailyRevenue)}</strong>
				</div>
				<svg viewBox="0 0 160 40" aria-hidden="true"
					><polyline
						points={revenuePoints}
						fill="none"
						stroke="var(--moss)"
						stroke-width="2"
					/></svg
				>
			</div>
			<dl class="vitals" aria-label={i18n.t('tileInspector.storeVitals')}>
				{#each [{ label: i18n.t('tileInspector.stockHealth'), value: store.stockHealth, icon: 'inventory' as const }, { label: i18n.t('tileInspector.staffMorale'), value: store.staffMorale, icon: 'person' as const }] as metric (metric.label)}
					<div
						title={metric.label}
						style:--meter-color={metric.value < 70 ? 'var(--brass-700)' : 'var(--moss)'}
					>
						<dt><HudIcon name={metric.icon} /><span class="sr-only">{metric.label}</span></dt>
						<dd>
							<meter min="0" max="100" value={metric.value} aria-label={metric.label}></meter><span
								>{i18n.format.integer(metric.value)}</span
							>
						</dd>
					</div>
				{/each}
			</dl>
			<div class="product-strip">
				{#each store.products as product (product.productId)}
					{@const quantity = getStoreProductStock(product)}
					<div
						class="product"
						class:low-stock={quantity <= product.reorderThreshold}
						style:--meter-color={quantity <= product.reorderThreshold
							? 'var(--wax-red)'
							: 'var(--moss)'}
						title={`${i18n.labels.productCategory(product.productId)} · ${quantity} / ${product.targetStock}`}
					>
						<img
							src={asset(getProductArt(product.productId).path)}
							alt={i18n.labels.productCategory(product.productId)}
							width="72"
							height="72"
						/>
						<meter
							min="0"
							max={Math.max(1, product.targetStock)}
							value={quantity}
							aria-label={i18n.labels.productCategory(product.productId)}
						></meter>
					</div>
				{/each}
			</div>
			{#if staffing}<div class="staff-coverage">
					<span>{i18n.t('tileInspector.onShift')}</span>
					<div class="portraits" aria-hidden="true">
						{#each onShiftStaff as person (person.id)}<span
								><StaffPortrait personId={person.id} /></span
							>{/each}
					</div>
					<strong
						>{staffing.assigned.manager + staffing.assigned.general} / {staffing.requirement
							.manager + staffing.requirement.general}</strong
					><meter
						class="sr-only"
						min="0"
						max="100"
						value={staffing.coverage}
						aria-label={i18n.t('staffPanel.storeStaffing')}
					></meter>
				</div>{/if}
			{#if upgradePreview}
				<section
					class="upgrade-card"
					data-testid="upgrade-card"
					aria-label={i18n.t('tileInspector.upgradeCard.heading')}
				>
					<h4>{i18n.t('tileInspector.upgradeCard.heading')}</h4>
					<p class="upgrade-step">
						{i18n.t('tileInspector.upgradeCard.levelTransition', {
							from: i18n.format.integer(upgradePreview.currentLevel),
							to: i18n.format.integer(upgradePreview.nextLevel)
						})}
						<span>
							{i18n.t('tileInspector.upgradeCard.cost', {
								cost: i18n.format.currency(upgradePreview.cost)
							})}
						</span>
					</p>
					<ul>
						{#if upgradeRevenueChanged}
							<li data-testid="upgrade-revenue">
								{i18n.t('tileInspector.upgradeCard.revenueMultiplier', {
									before: i18n.format.decimal(upgradePreview.revenueMultiplierBefore),
									after: i18n.format.decimal(upgradePreview.revenueMultiplierAfter)
								})}
							</li>
						{/if}
						{#if upgradeProduct}
							<li data-testid="upgrade-unlock">
								<img
									src={asset(upgradeProductArt?.path ?? '')}
									alt={upgradeProductName}
									width="28"
									height="28"
								/>{i18n.t('tileInspector.upgradeCard.unlocksProduct', {
									product: upgradeProductName
								})}
							</li>
						{/if}
						{#if upgradeCapacityChanged}
							<li>
								{i18n.t('tileInspector.upgradeCard.staffCapacity', {
									before: i18n.format.integer(upgradePreview.staffCapacityBefore),
									after: i18n.format.integer(upgradePreview.staffCapacityAfter)
								})}
							</li>
						{/if}
						{#if upgradeStaffingChanged}
							<li>
								{i18n.t('tileInspector.upgradeCard.staffing', {
									beforeManagers: i18n.format.integer(
										upgradePreview.staffingRequirementBefore.manager
									),
									beforeGeneral: i18n.format.integer(
										upgradePreview.staffingRequirementBefore.general
									),
									afterManagers: i18n.format.integer(
										upgradePreview.staffingRequirementAfter.manager
									),
									afterGeneral: i18n.format.integer(upgradePreview.staffingRequirementAfter.general)
								})}
							</li>
						{/if}
						{#if upgradeNextMilestone}
							<li>
								{i18n.t('tileInspector.upgradeCard.nextMilestone', {
									product: i18n.labels.productCategory(upgradeNextMilestone.productId),
									level: i18n.format.integer(upgradeNextMilestone.level)
								})}
							</li>
						{/if}
					</ul>
				</section>
			{/if}
			<div class="actions">
				<button
					type="button"
					class="upgrade btn-primary"
					disabled={!upgradeAllowed || !storeCanUpgrade || !canAffordUpgrade || upgradePending}
					aria-label={storeCanUpgrade
						? i18n.t('tileInspector.upgrade', { cost: i18n.format.currency(upgradeCost) })
						: i18n.t('tileInspector.maxLevel')}
					onclick={handleUpgrade}
					>{storeCanUpgrade
						? `↑ ${i18n.format.currency(upgradeCost)}`
						: i18n.t('tileInspector.maxLevel')}</button
				><button
					type="button"
					onclick={onOpenDetails}
					aria-label={i18n.t('tileInspector.openDetails')}
					><HudIcon name="details" />{i18n.t('tileInspector.details')}</button
				>
			</div>
			{#if storeCanUpgrade && !canAffordUpgrade}<p class="hint">
					{i18n.t('tileInspector.notEnoughCash')}
				</p>{/if}
			{#if !upgradeAllowed && disabledReason}<p class="hint">{disabledReason}</p>{/if}
			{#if upgradeAck}
				<div
					class="upgrade-ack"
					class:not-applied={upgradeAck.kind === 'not-applied'}
					data-testid="upgrade-status"
				>
					<p role="status">{upgradeAckText}</p>
					{#if upgradeAck.kind === 'success' && upgradeAck.milestoneUnlocked}
						<button type="button" onclick={onOpenDetails} data-testid="upgrade-review-stock">
							<HudIcon name="details" />{i18n.t('tileInspector.upgradeStatus.reviewStock')}
						</button>
					{/if}
				</div>
			{/if}
		{:else if tile}
			<header>
				<p class="eyebrow">
					{i18n.labels.neighborhood(tile.neighborhood)} · <span>{tileLabel}</span>
				</p>
				<h2>{i18n.t('tileInspector.tileHeading', { x: tile.x, y: tile.y })}</h2>
			</header>
			<section aria-label={i18n.t('tileInspector.tileStats')}>
				<dl class="tile-stats">
					{#each [{ label: i18n.t('tileInspector.demand'), value: tile.demand }, { label: i18n.t('tileInspector.rent'), value: i18n.format.currency(tile.rent) }, { label: i18n.t('tileInspector.footTraffic'), value: tile.footTraffic }, { label: i18n.t('tileInspector.customerFit'), value: tile.customerFit }] as metric (metric.label)}<div
						>
							<dt>{metric.label}</dt>
							<dd>{metric.value}</dd>
						</div>{/each}
				</dl>
			</section>
		{:else}<h2>{i18n.t('tileInspector.selectTile')}</h2>{/if}
	</div>
	{#if attentionMessage}<p class="attention plaque">
			<span class="seal">!</span>{attentionMessage}
		</p>{/if}
</aside>

<style>
	.inspector {
		display: grid;
		gap: 12px;
		color: var(--ink-700);
	}
	.dossier {
		padding: 14px;
		display: grid;
		gap: 12px;
	}
	.close {
		position: absolute;
		right: 6px;
		top: 4px;
		z-index: 2;
		width: 20px;
		height: 20px;
		padding: 0 !important;
		border: 0 !important;
		background: transparent !important;
		font-size: 12px !important;
		color: var(--ink-500) !important;
	}
	.store-heading {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 64px;
	}
	.store-heading > div {
		flex: 1;
		min-width: 0;
	}
	.store-art {
		width: 64px;
		height: 64px;
		object-fit: cover;
		border: 1px solid var(--brass-500);
		border-radius: 50%;
	}
	h2,
	h3,
	p,
	dl,
	dd {
		margin: 0;
	}
	h2,
	h3 {
		font-family: var(--font-display);
		font-weight: 400;
	}
	h3 {
		font-size: 24px;
		line-height: 1.05;
	}
	.eyebrow {
		font-size: 10px;
		letter-spacing: 0.12em;
		margin: 0 0 5px;
	}
	.level {
		width: 40px;
		height: 40px;
		flex-shrink: 0;
	}
	.revenue {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 10px 12px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-50);
		min-height: 66px;
		box-sizing: border-box;
	}
	.revenue strong {
		font: 700 26px/1.1 var(--font-mono);
	}
	.revenue svg {
		width: 55%;
		height: 40px;
	}
	.vitals {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.vitals > div,
	.vitals dd {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.vitals dd {
		flex: 1;
		min-width: 0;
		font: 700 14px var(--font-mono);
	}
	.vitals dt {
		width: 16px;
		flex-shrink: 0;
		color: var(--brass-700);
	}
	.vitals meter {
		width: 100%;
		min-width: 0;
		height: 6px;
	}
	.product-strip {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
	}
	.product {
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		padding: 4px 4px 0;
		display: grid;
	}
	.product img {
		width: 100%;
		height: 72px;
		object-fit: contain;
	}
	.product meter {
		width: calc(100% + 8px);
		height: 5px;
		margin: 4px -4px 0;
	}
	.staff-coverage {
		display: flex;
		align-items: center;
		gap: 10px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-50);
		padding: 8px 10px;
		min-width: 0;
		min-height: 54px;
		box-sizing: border-box;
		font: 700 10px var(--font-ui);
	}
	.staff-coverage > span {
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.staff-coverage strong {
		margin-left: auto;
		font: 12px var(--font-mono);
	}
	.portraits {
		display: flex;
		gap: 6px;
		min-width: 0;
		overflow-x: auto;
	}
	.portraits > span {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		color: var(--brass-700);
		background: var(--paper-100);
		border: 1px solid var(--brass-500);
		border-radius: 50%;
		overflow: hidden;
	}
	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.actions button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font: 700 12px var(--font-ui);
		min-height: 40px;
		padding: 6px;
	}
	.actions .upgrade {
		font-family: var(--font-mono);
		background: var(--moss);
		color: var(--paper-50);
	}
	.upgrade-card {
		border: 1px solid var(--paper-edge);
		background: var(--paper-50);
		padding: 10px 12px;
		display: grid;
		gap: 8px;
	}
	.upgrade-card h4 {
		margin: 0;
		font: 700 11px var(--font-ui);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--brass-700);
	}
	.upgrade-step {
		margin: 0;
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 4px 10px;
		font: 700 13px var(--font-mono);
	}
	.upgrade-card ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 6px;
	}
	.upgrade-card li {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		font: 12px var(--font-body);
		min-width: 0;
	}
	.upgrade-card li img {
		width: 28px;
		height: 28px;
		object-fit: contain;
		flex-shrink: 0;
	}
	.actions button :global(svg) {
		width: 16px;
		height: 16px;
	}
	.vitals > div {
		min-width: 0;
		height: 36px;
		box-sizing: border-box;
		padding: 8px 10px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-50);
	}
	.vitals dt :global(svg) {
		width: 16px;
		height: 16px;
	}
	.vitals dd > span {
		flex-shrink: 0;
	}
	meter:not(.sr-only) {
		appearance: none;
		border: none;
		background: none;
	}
	meter::-webkit-meter-bar {
		height: 6px;
		border: none;
		border-radius: 0;
		background: var(--paper-300);
		box-shadow: none;
	}
	meter::-webkit-meter-optimum-value {
		background: var(--meter-color, var(--moss));
	}
	meter::-moz-meter-bar {
		background: var(--meter-color, var(--moss));
	}
	.product meter::-webkit-meter-bar {
		height: 5px;
	}
	.product.low-stock {
		border-color: var(--wax-red);
	}
	.attention {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		font: 14px var(--font-body);
		color: var(--wax-red);
	}
	.hint {
		color: var(--wax-red);
		font: 12px var(--font-body);
	}
	.upgrade-ack {
		border: 1px solid var(--paper-edge);
		background: var(--paper-50);
		padding: 8px 10px;
		display: grid;
		gap: 6px;
		font: 12px var(--font-body);
	}
	.upgrade-ack p {
		margin: 0;
	}
	.upgrade-ack.not-applied p {
		color: var(--wax-red);
	}
	.upgrade-ack button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font: 700 12px var(--font-ui);
		min-height: 36px;
		padding: 6px;
	}
	.upgrade-ack button :global(svg) {
		width: 16px;
		height: 16px;
	}
	.tile-stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.tile-stats dd {
		font-family: var(--font-mono);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
