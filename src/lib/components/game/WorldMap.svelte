<script lang="ts">
	import { asset } from '$app/paths';
	import {
		WORLD_MAP_ART,
		getStoreArt,
		getIndustrialBuildingArt,
		getProductArt
	} from '$lib/assets/gameArt';
	import HudIcon from './HudIcon.svelte';
	import WorldLogisticsRoutes from '$lib/components/game/WorldLogisticsRoutes.svelte';
	import { localizeWorldCityStatus } from '$lib/i18n/gameCopy';
	import type { LocalizedWorldCityStatus } from '$lib/i18n/localizedTypes';
	import type { I18nBundle } from '$lib/i18n';
	import type { RouteOperationalSummary } from '$lib/game/logisticsReadModels';
	import type { ProductId } from '$lib/game/types';
	import type { WorldCityStatus } from '$lib/game/world';

	interface Props {
		statuses: WorldCityStatus[];
		i18n: I18nBundle;
		selectedCityId: string | null;
		onSelectCity: (cityId: string) => void;
		onOpenCity: (cityId: string) => void;
		onFinanceCity?: (cityId: string) => void;
		onCloseInspector: () => void;
		canOpenWorldCity?: boolean;
		canFinanceWorldCity?: boolean;
		allowedCityIds?: string[];
		selectionDisabled?: boolean;
		selectionDisabledReason?: string | null;
		disabledReason?: string | null;
		logisticsRouteSummaries?: readonly RouteOperationalSummary[];
		selectedLogisticsRouteId?: string | null;
		onSelectLogisticsRoute?: (routeId: string) => void;
	}

	let {
		statuses,
		i18n,
		selectedCityId,
		onSelectCity,
		onOpenCity,
		onFinanceCity = () => {},
		onCloseInspector,
		canOpenWorldCity = true,
		canFinanceWorldCity = true,
		allowedCityIds = statuses.map((status) => status.city.id),
		selectionDisabled = false,
		selectionDisabledReason = null,
		disabledReason = null,
		logisticsRouteSummaries = [],
		selectedLogisticsRouteId = null,
		onSelectLogisticsRoute = () => {}
	}: Props = $props();
	const allowedCitySet = $derived(new Set(allowedCityIds));

	const localizedStatuses = $derived(
		statuses.map((status) => localizeWorldCityStatus(status, i18n))
	);

	const selectedStatus = $derived(
		selectedCityId
			? (localizedStatuses.find((status) => status.city.id === selectedCityId) ?? null)
			: null
	);

	const specialties = $derived(
		selectedStatus
			? Object.entries(selectedStatus.city.retailDemandProfile)
					.filter(([, multiplier]) => multiplier > 1)
					.sort((a, b) => b[1] - a[1])
			: []
	);
	const cityRoutes = $derived(
		logisticsRouteSummaries.filter(
			({ route }) =>
				route.originCityId === selectedCityId || route.destinationCityId === selectedCityId
		).length
	);
	function markerPath(status: LocalizedWorldCityStatus): string {
		if (status.state === 'locked') {
			return WORLD_MAP_ART.markers.locked.path;
		}

		return status.city.kind === 'retail'
			? WORLD_MAP_ART.markers.retail.path
			: WORLD_MAP_ART.markers.industry.path;
	}

	function cityDescriptionId(status: LocalizedWorldCityStatus): string {
		return `world-city-${status.city.id}-description`;
	}

	function cityRequirementId(status: LocalizedWorldCityStatus): string {
		return `world-city-${status.city.id}-requirement`;
	}

	function cityTitleId(status: LocalizedWorldCityStatus): string {
		return `world-city-${status.city.id}-title`;
	}

	function cityDescriptionIds(status: LocalizedWorldCityStatus): string {
		return status.state === 'locked' && status.blockedReason
			? `${cityDescriptionId(status)} ${cityRequirementId(status)}`
			: cityDescriptionId(status);
	}

	function inspectorReasonId(status: LocalizedWorldCityStatus): string {
		return `world-city-${status.city.id}-reason`;
	}

	function inspectorId(status: LocalizedWorldCityStatus): string {
		return `world-city-${status.city.id}-inspector`;
	}

	function routeCityName(cityId: string): string {
		return i18n.labels.worldCity(cityId).name;
	}

	function routeStateLabel(summary: RouteOperationalSummary): string {
		return i18n.t(`logisticsPanel.states.${summary.route.state}` as never);
	}

	function routeConditionLabel(summary: RouteOperationalSummary): string {
		return i18n.t(`logisticsPanel.conditions.${summary.condition}` as never);
	}

	function routeButtonLabel(summary: RouteOperationalSummary): string {
		return i18n.t('worldMap.routeSummary' as never, {
			origin: routeCityName(summary.route.originCityId),
			destination: routeCityName(summary.route.destinationCityId),
			material: i18n.labels.material(summary.route.materialId),
			state: routeStateLabel(summary),
			condition: routeConditionLabel(summary)
		});
	}
</script>

<section class="world-map" aria-label={i18n.t('worldMap.ariaLabel')}>
	<div class="world-map-viewport">
		<img
			data-testid="world-map-background"
			class="world-map-background"
			src={asset(WORLD_MAP_ART.background.path)}
			alt=""
			aria-hidden="true"
			width="1024"
			height="1024"
			decoding="async"
			fetchpriority="high"
		/>
		<WorldLogisticsRoutes
			routes={logisticsRouteSummaries}
			cities={localizedStatuses.map((status) => status.city)}
			selectedRouteId={selectedLogisticsRouteId}
			onSelectRoute={onSelectLogisticsRoute}
		/>
		<div class="world-marker-layer" aria-hidden="true">
			{#each localizedStatuses as status (status.city.id)}
				<img
					data-testid={`world-city-marker-${status.city.id}`}
					class={{
						'world-city-marker': true,
						retail: status.city.kind === 'retail',
						industry: status.city.kind === 'industry',
						opened: status.state === 'opened',
						revealed: status.state === 'revealed',
						locked: status.state === 'locked'
					}}
					src={asset(markerPath(status))}
					alt=""
					aria-hidden="true"
					width="96"
					height="96"
					style={`--world-x: ${status.city.worldX}%; --world-y: ${status.city.worldY}%;`}
				/>
			{/each}
		</div>
	</div>

	<div class="world-node-list" aria-label={i18n.t('worldMap.cities')}>
		<div class="world-city-group" role="group" aria-label={i18n.t('worldMap.cities')}>
			{#each localizedStatuses as status (status.city.id)}
				<button
					type="button"
					class={{
						'world-node-card': true,
						retail: status.city.kind === 'retail',
						industry: status.city.kind === 'industry',
						opened: status.state === 'opened',
						revealed: status.state === 'revealed',
						locked: status.state === 'locked'
					}}
					aria-labelledby={cityTitleId(status)}
					aria-describedby={cityDescriptionIds(status)}
					aria-current={selectedCityId === status.city.id ? 'true' : undefined}
					aria-expanded={selectedCityId === status.city.id}
					aria-controls={selectedCityId === status.city.id ? inspectorId(status) : undefined}
					disabled={selectionDisabled || !allowedCitySet.has(status.city.id)}
					onclick={() => {
						if (!selectionDisabled && allowedCitySet.has(status.city.id))
							onSelectCity(status.city.id);
					}}
				>
					<img
						class="city-list-art"
						src={asset(markerPath(status))}
						alt=""
						width="40"
						height="40"
					/><strong id={cityTitleId(status)}>{status.city.name}</strong>
					<span class="sr-only" id={cityDescriptionId(status)}>
						{status.kindLabel} - {status.stateLabel}. {status.city.specialtySummary}
					</span>
					{#if status.state === 'opened'}
						<span class="city-operating">
							<HudIcon name={status.city.kind === 'retail' ? 'retail' : 'industry'} />
							{i18n.format.integer(
								status.city.kind === 'retail' ? status.storeCount : status.buildingCount
							)}
							<span
								>{status.city.kind === 'retail'
									? i18n.t('worldMap.revenuePerDay', {
											revenue: i18n.format.currency(status.latestRevenue ?? 0)
										})
									: i18n.t('worldMap.stockHeld', {
											stock: i18n.format.integer(status.warehouseStock ?? 0)
										})}</span
							>
						</span>
					{:else if status.state === 'revealed'}
						<span class="city-operating"
							><HudIcon name="lock" />{i18n.format.currency(status.city.openingCost)}</span
						>
					{/if}
					{#if status.state === 'locked' && status.blockedReason}
						<small id={cityRequirementId(status)}>{status.blockedReason}</small>
					{/if}
					{#if !allowedCitySet.has(status.city.id) && disabledReason}
						<small>{disabledReason}</small>
					{/if}
				</button>
			{/each}
		</div>
		{#if logisticsRouteSummaries.length > 0}
			<div class="world-route-group" role="group" aria-label={i18n.t('worldMap.routes')}>
				{#each logisticsRouteSummaries as summary (summary.route.id)}
					<button
						type="button"
						class={{
							'world-node-card': true,
							'world-route-card': true,
							active: summary.route.state === 'active',
							paused: summary.route.state === 'paused',
							selected: selectedLogisticsRouteId === summary.route.id
						}}
						aria-label={routeButtonLabel(summary)}
						aria-current={selectedLogisticsRouteId === summary.route.id ? 'true' : undefined}
						onclick={() => onSelectLogisticsRoute(summary.route.id)}
					>
						<strong>
							{routeCityName(summary.route.originCityId)} → {routeCityName(
								summary.route.destinationCityId
							)}
						</strong>
						<span>{i18n.labels.material(summary.route.materialId)}</span>
						<small>{routeStateLabel(summary)} · {routeConditionLabel(summary)}</small>
					</button>
				{/each}
			</div>
		{/if}
	</div>
	{#if selectionDisabled && selectionDisabledReason}
		<p class="blocked-reason" role="status">{selectionDisabledReason}</p>
	{/if}

	{#if selectedStatus}
		<div
			id={inspectorId(selectedStatus)}
			class="world-inspector paper"
			role="dialog"
			aria-label={i18n.t('worldMap.cityDetails')}
			aria-modal="false"
		>
			<button
				type="button"
				class="close"
				aria-label={i18n.t('worldMap.closeCityDetails')}
				onclick={onCloseInspector}
			>
				×
			</button>
			<div class="city-hero" title={selectedStatus.city.specialtySummary}>
				<img
					class="city-cover"
					src={asset(
						selectedStatus.city.kind === 'retail'
							? getStoreArt('boutique').path
							: getIndustrialBuildingArt('snack-factory')
					)}
					alt=""
					width="380"
					height="140"
				/>
				<p class="eyebrow">
					{i18n.t(`worldMap.cityEyebrow.${selectedStatus.city.kind}` as never)} · {selectedStatus.stateLabel}
				</p>
				<h2>{selectedStatus.city.name}</h2>
			</div>
			<p class="city-description sr-only">{selectedStatus.city.specialtySummary}</p>
			<dl class="city-metrics">
				<div>
					<dt>
						{i18n.t(
							selectedStatus.city.kind === 'retail' ? 'worldMap.peakDemand' : 'worldMap.resources'
						)}
					</dt>
					<dd>
						{selectedStatus.city.kind === 'retail'
							? `${i18n.format.decimal(Math.max(1, ...specialties.map(([, value]) => value)))}×`
							: (selectedStatus.city.industryResourceProfile?.resourceIds.length ?? 0)}
					</dd>
				</div>
				<div>
					<dt>
						{i18n.t(
							selectedStatus.city.kind === 'retail'
								? 'worldMap.storeCapacity'
								: 'worldMap.buildings'
						)}
					</dt>
					<dd>
						{selectedStatus.city.kind === 'retail'
							? `+${selectedStatus.city.storeCapBonus}`
							: selectedStatus.buildingCount}
					</dd>
				</div>
				<div>
					<dt aria-label={i18n.t('worldMap.routes')}>{i18n.t('worldMap.routesShort')}</dt>
					<dd>{cityRoutes}</dd>
				</div>
			</dl>
			{#if specialties.length}<div class="specialties" aria-label={i18n.t('worldMap.specialties')}>
					<span>{i18n.t('worldMap.specialties')}</span>
					{#each specialties as [productId, multiplier] (productId)}<img
							src={asset(getProductArt(productId as ProductId).path)}
							alt={i18n.labels.productCategory(productId as ProductId)}
							title={`${i18n.labels.productCategory(productId as ProductId)} · ${multiplier}×`}
							width="32"
							height="32"
						/>{/each}
				</div>{/if}
			<div class="city-actions">
				{#if selectedStatus.state === 'revealed' && allowedCitySet.has(selectedStatus.city.id)}
					{#if canOpenWorldCity}
						<button
							type="button"
							class="open-city"
							aria-label={i18n.t('worldMap.openForCash', {
								cash: i18n.format.currency(selectedStatus.city.openingCost)
							})}
							disabled={!selectedStatus.canOpen}
							aria-describedby={selectedStatus.blockedReason
								? inspectorReasonId(selectedStatus)
								: undefined}
							onclick={() => {
								if (selectedStatus.canOpen) onOpenCity(selectedStatus.city.id);
							}}
						>
							<HudIcon name="lock" />{i18n.format.currency(selectedStatus.city.openingCost)}
						</button>
					{/if}
					{#if selectedStatus.financeOffer && canFinanceWorldCity}
						<button
							type="button"
							class="finance-city"
							aria-label={i18n.t('financePanel.financedPurchase.financeOpening')}
							title={i18n.t('financePanel.financedPurchase.financeOpening')}
							onclick={() => onFinanceCity(selectedStatus.city.id)}
						>
							<HudIcon name="finance" />
						</button>
					{/if}
					{#if !canOpenWorldCity && (!selectedStatus.financeOffer || !canFinanceWorldCity) && disabledReason}
						<p id={inspectorReasonId(selectedStatus)} class="blocked-reason">
							{disabledReason}
						</p>
					{/if}
					{#if selectedStatus.blockedReason && canOpenWorldCity}
						<p id={inspectorReasonId(selectedStatus)} class="blocked-reason">
							{selectedStatus.blockedReason}
						</p>
					{/if}
				{:else if selectedStatus.state === 'revealed'}
					<p id={inspectorReasonId(selectedStatus)} class="blocked-reason">
						{disabledReason}
					</p>
				{:else if selectedStatus.state === 'locked'}
					<p id={inspectorReasonId(selectedStatus)} class="blocked-reason">
						{selectedStatus.blockedReason}
					</p>
				{:else}
					<p>
						{i18n.t('copy.worldCity.openedSummary' as never, {
							storeCount: i18n.format.integer(selectedStatus.storeCount),
							buildingCount: i18n.format.integer(selectedStatus.buildingCount)
						})}
					</p>
				{/if}
			</div>
		</div>
	{/if}
</section>

<style>
	.world-map {
		container-type: size;
		position: relative;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		background: var(--walnut-900);
		color: var(--paper-100);
	}

	.world-map-viewport {
		position: absolute;
		width: max(100cqw, 100cqh);
		height: max(100cqw, 100cqh);
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
	}

	.world-map-background {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center;
		filter: saturate(0.9) contrast(0.94) brightness(0.82);
	}

	.world-marker-layer {
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
	}

	.world-city-marker {
		position: absolute;
		left: var(--world-x);
		top: var(--world-y);
		width: clamp(2.5rem, 6vw, 4.2rem);
		height: clamp(2.5rem, 6vw, 4.2rem);
		object-fit: contain;
		transform: translate(-50%, -82%);
		filter: drop-shadow(0 0.28rem 0.22rem rgba(18, 13, 8, 0.5));
	}

	.world-city-marker.revealed {
		filter: drop-shadow(0 0 0.45rem rgba(245, 232, 192, 0.88))
			drop-shadow(0 0.28rem 0.22rem rgba(18, 13, 8, 0.5));
	}

	.world-city-marker.locked {
		opacity: 0.64;
		filter: grayscale(0.22) drop-shadow(0 0.22rem 0.18rem rgba(18, 13, 8, 0.45));
	}

	.world-node-list {
		position: absolute;
		left: 1rem;
		top: 6rem;
		bottom: 1rem;
		z-index: 3;
		display: grid;
		gap: 0.5rem;
		width: min(20rem, calc(100% - 2rem));
		overflow: auto;
	}

	.world-city-group,
	.world-route-group {
		display: grid;
		gap: 0.5rem;
	}

	.world-route-group {
		border-top: 1px solid color-mix(in srgb, var(--brass-500) 52%, transparent);
		padding-top: 0.5rem;
	}

	.world-node-card {
		display: grid;
		gap: 0.2rem;
		width: 100%;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		padding: 0.6rem 0.7rem;
		text-align: left;
		box-shadow: var(--shadow-paper);
	}

	.world-node-card:hover,
	.world-node-card:focus-visible,
	.world-node-card[aria-current='true'] {
		border-color: var(--paper-50);
		outline: 2px solid var(--brass-300);
		outline-offset: 1px;
	}

	.world-node-card.industry {
		border-left: 0.35rem solid var(--moss);
	}

	.world-node-card.retail {
		border-left: 0.35rem solid var(--brass-500);
	}

	.world-route-card {
		border-left: 0.35rem solid var(--moss);
	}

	.world-route-card.paused {
		border-left-style: dashed;
		background: var(--paper-200);
	}

	.world-route-card.selected {
		border-color: var(--wax-red);
		outline: 2px solid var(--wax-red);
		outline-offset: 1px;
	}

	.world-node-card.locked {
		color: var(--ink-500);
		background: var(--paper-200);
	}

	strong {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	span,
	small,
	p,
	h2 {
		font-family: var(--font-ui);
		min-width: 0;
		overflow-wrap: anywhere;
	}

	span {
		color: var(--brass-700);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	small {
		font-size: 0.82rem;
		line-height: 1.35;
	}

	.world-inspector {
		position: absolute;
		top: 5.9rem;
		right: 1rem;
		z-index: 4;
		display: grid;
		gap: 12px;
		width: min(380px, calc(100% - 2rem));
		align-content: start;
		max-height: calc(100dvh - 7rem);
		overflow-y: auto;
		padding: 12px;
		color: var(--ink-700);
	}

	.close {
		position: absolute;
		top: 8px;
		right: 8px;
		z-index: 2;
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 50%;
		width: 32px;
		height: 32px;
		background: var(--paper-50);
		color: var(--ink-700);
		padding: 0;
		font-family: var(--font-ui);
		font-size: 0.78rem;
	}

	.eyebrow {
		margin: 0;
		color: var(--brass-700);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 400;
	}

	.world-inspector p {
		margin: 0;
		font-size: 11px;
		line-height: 1.3;
	}

	.open-city {
		border: 1px solid var(--ink-900);
		border-radius: 2px;
		background: var(--moss);
		color: var(--paper-50);
		padding: 8px 12px;
		font-family: var(--font-ui);
		font-size: 0.88rem;
		font-weight: 700;
	}

	.open-city:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.finance-city {
		border: 1px solid var(--brass-700);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		padding: 0.55rem 0.8rem;
		font-family: var(--font-ui);
		font-size: 0.84rem;
		font-weight: 700;
	}

	.blocked-reason {
		color: var(--ink-500);
	}

	@media (max-width: 820px) {
		.world-map {
			min-height: 34rem;
		}

		.world-node-list {
			right: 1rem;
			top: auto;
			width: auto;
			max-height: 45%;
		}

		.world-inspector {
			top: 1rem;
			left: 1rem;
			right: 1rem;
			width: auto;
		}
	}
	@media (max-width: 820px) {
		.world-node-list {
			left: 1rem;
			bottom: 5rem;
			top: calc(50% + 0.5rem);
			max-height: none;
		}
		.world-inspector {
			left: 1rem;
			top: 6rem;
			bottom: calc(50% + 0.5rem);
			max-height: none;
			overflow: auto;
		}
	}
	@media (max-width: 600px) {
		.world-node-list {
			left: 0.5rem;
			right: 0.5rem;
			bottom: 8.7rem;
			max-height: none;
		}
		.world-inspector {
			left: 0.5rem;
			right: 0.5rem;
			top: 8rem;
			max-height: none;
		}
	}

	.world-city-group .world-node-card {
		position: relative;
		padding-left: 3.6rem;
		min-height: 74px;
		align-content: center;
	}
	.city-list-art {
		position: absolute;
		left: 0.5rem;
		top: 0.5rem;
		object-fit: contain;
	}
	.world-node-card > span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.world-node-card > small {
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.world-node-list {
		align-content: start;
	}
	.city-hero {
		position: relative;
		height: 150px;
		margin: -12px -12px 0;
		padding: 100px 12px 8px;
		isolation: isolate;
		background: #201708;
		color: var(--paper-50);
	}
	.city-hero::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		background: linear-gradient(transparent 30%, #201708 100%);
	}
	.city-cover {
		position: absolute;
		inset: 0;
		z-index: -2;
		width: 100%;
		height: 150px;
		object-fit: cover;
		object-position: center;
	}
	.city-metrics {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		margin: 0;
	}
	.city-metrics > div {
		background: var(--paper-50);
		padding: 10px 6px;
		border: 1px solid var(--paper-edge);
		text-align: center;
	}
	.city-metrics dt {
		font: 700 9px var(--font-ui);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--brass-700);
	}
	.city-metrics dd {
		margin: 0.2rem 0 0;
		font: 700 18px var(--font-mono);
	}
	.specialties {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		background: var(--paper-50);
		padding: 8px;
		border: 1px solid var(--paper-edge);
		min-height: 50px;
	}
	.specialties img {
		object-fit: contain;
	}
	.city-hero .eyebrow {
		color: var(--brass-300);
		font-size: 10px;
		letter-spacing: 0.14em;
	}
	.city-hero h2 {
		font: 700 26px/1.1 var(--font-display);
	}
	.city-operating,
	.city-operating span {
		color: var(--ink-700);
		font: 12px var(--font-mono);
		letter-spacing: 0;
		text-transform: none;
	}
	.city-operating {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.city-operating :global(svg) {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}
	.world-node-card strong {
		font-weight: 700;
	}
	.world-node-card.locked small {
		color: var(--wax-red);
		font: 12px var(--font-mono);
	}
	.city-actions {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 8px;
	}
	.city-actions > p {
		grid-column: 1 / -1;
	}
	.city-actions button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 44px;
	}
	.open-city {
		font-family: var(--font-mono);
	}
	.open-city:only-child {
		grid-column: 1 / -1;
	}
	.city-actions :global(svg) {
		width: 18px;
		height: 18px;
	}
	.specialties > span {
		font-size: 9px;
	}
</style>
