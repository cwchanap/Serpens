<script lang="ts">
	import { asset } from '$app/paths';
	import { WORLD_MAP_ART } from '$lib/assets/gameArt';
	import GameIcon from '$lib/components/game/GameIcon.svelte';
	import WorldLogisticsRoutes from '$lib/components/game/WorldLogisticsRoutes.svelte';
	import { localizeWorldCityStatus } from '$lib/i18n/gameCopy';
	import type { LocalizedWorldCityStatus } from '$lib/i18n/localizedTypes';
	import type { I18nBundle } from '$lib/i18n';
	import type { RouteOperationalSummary } from '$lib/game/logisticsReadModels';
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

	const routeStateCounts = $derived.by(() => {
		let active = 0;
		let paused = 0;
		for (const summary of logisticsRouteSummaries) {
			if (summary.route.state === 'active') active += 1;
			else if (summary.route.state === 'paused') paused += 1;
		}
		return { active, paused };
	});

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
					<span class="row">
						<strong id={cityTitleId(status)}>{status.city.name}</strong>
						<span class="ops" aria-hidden="true">
							{#if status.state === 'opened' && status.city.kind === 'retail'}
								{i18n.format.integer(status.storeCount)} · {status.stateLabel}
							{:else if status.state === 'opened'}
								{i18n.format.integer(status.buildingCount)} · {status.stateLabel}
							{:else}
								{status.stateLabel}
							{/if}
						</span>
					</span>
					<span id={cityDescriptionId(status)} class="desc">
						{status.kindLabel} - {status.stateLabel}. {status.city.specialtySummary}
					</span>
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
				<p class="routes-strip">
					{i18n.t('worldMap.routes')} · {i18n.format.integer(routeStateCounts.active)}
					{i18n.t('logisticsPanel.states.active' as never)} ·
					{i18n.format.integer(routeStateCounts.paused)}
					{i18n.t('logisticsPanel.states.paused' as never)}
					<span class="dot active" aria-hidden="true"></span>
					<span class="dot paused" aria-hidden="true"></span>
				</p>
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
				X
			</button>
			<div class="crest" aria-hidden="true">
				<GameIcon name={selectedStatus.city.kind === 'retail' ? 'retail' : 'industry'} />
			</div>
			<p class="eyebrow">{i18n.t(`worldMap.cityEyebrow.${selectedStatus.city.kind}` as never)}</p>
			<h2>{selectedStatus.city.name}</h2>
			<div class="stat-row" aria-hidden="true">
				<div class="stat-box">
					<span class="stat-label"
						>{selectedStatus.city.kind === 'retail'
							? i18n.t('worldMap.stats.stores' as never)
							: i18n.t('worldMap.stats.plants' as never)}</span
					>
					<span class="stat-value">
						{selectedStatus.city.kind === 'retail'
							? i18n.format.integer(selectedStatus.storeCount)
							: i18n.format.integer(selectedStatus.buildingCount)}
					</span>
				</div>
				<div class="stat-box">
					<span class="stat-label">{i18n.t('worldMap.stats.opening' as never)}</span>
					<span class="stat-value">{i18n.format.currency(selectedStatus.city.openingCost)}</span>
				</div>
				<div class="stat-box">
					<span class="stat-label">{i18n.t('worldMap.stats.status' as never)}</span>
					<span class="stat-value">{selectedStatus.stateLabel}</span>
				</div>
			</div>
			<p class="specialty">{selectedStatus.city.specialtySummary}</p>
			{#if selectedStatus.state === 'revealed' && allowedCitySet.has(selectedStatus.city.id)}
				{#if canOpenWorldCity}
					<button
						type="button"
						class="open-city"
						disabled={!selectedStatus.canOpen}
						aria-describedby={selectedStatus.blockedReason
							? inspectorReasonId(selectedStatus)
							: undefined}
						onclick={() => {
							if (selectedStatus.canOpen) onOpenCity(selectedStatus.city.id);
						}}
					>
						{i18n.t('worldMap.openForCash' as never, {
							cash: i18n.format.currency(selectedStatus.city.openingCost)
						})}
					</button>
				{/if}
				{#if selectedStatus.financeOffer && canFinanceWorldCity}
					<button
						type="button"
						class="finance-city"
						onclick={() => onFinanceCity(selectedStatus.city.id)}
					>
						{i18n.t('financePanel.financedPurchase.financeOpening')}
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
	{/if}
</section>

<style>
	.world-map {
		position: relative;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		background: var(--walnut-900);
		color: var(--paper-100);
	}

	.world-map-viewport {
		position: absolute;
		inset: 0;
		overflow: hidden;
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
		top: 8.5rem;
		bottom: 1rem;
		z-index: 3;
		display: grid;
		gap: 0.5rem;
		align-content: start;
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
		grid-template-columns: auto 1fr;
		align-items: center;
		column-gap: 0.55rem;
		gap: 0.15rem 0.55rem;
		width: 100%;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		padding: 0.5rem 0.65rem;
		text-align: left;
		box-shadow: var(--shadow-paper);
	}

	.world-node-card :global(svg) {
		grid-row: 1 / -1;
		align-self: center;
		width: 1.35rem;
		height: 1.35rem;
		color: var(--brass-700);
	}

	.world-node-card :global(.row) {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		min-width: 0;
	}

	.world-node-card :global(.ops) {
		flex: none;
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

	.world-node-card.locked :global(svg) {
		opacity: 0.55;
	}

	.world-node-card :global(.desc) {
		grid-column: 1 / -1;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		line-height: 1.3;
		color: var(--ink-500);
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
	}

	.routes-strip {
		margin: 0 0 0.35rem;
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 999px;
		border: 1px solid var(--ink-700);
	}

	.dot.active {
		background: var(--moss);
	}

	.dot.paused {
		background: var(--brass-300);
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
		gap: 0.65rem;
		width: min(380px, calc(100% - 2rem));
		padding: 1rem;
	}

	.close {
		justify-self: end;
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 999px;
		border: 1px solid var(--brass-500);
		background: var(--paper-50);
		color: var(--ink-700);
		padding: 0;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		line-height: 1;
	}

	.crest {
		justify-self: start;
		width: 4.2rem;
		height: 4.2rem;
		border-radius: 999px;
		border: 1px solid var(--brass-500);
		background: color-mix(in srgb, var(--brass-500) 18%, var(--paper-50));
		display: grid;
		place-items: center;
		color: var(--brass-700);
	}

	.crest :global(svg) {
		width: 2.1rem;
		height: 2.1rem;
	}

	.stat-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}

	.stat-box {
		display: grid;
		gap: 0.15rem;
		border: 1px solid var(--brass-500);
		background: var(--paper-100);
		padding: 0.4rem 0.45rem;
	}

	.stat-label {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.stat-value {
		color: var(--ink-700);
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.specialty {
		margin: 0;
		color: var(--ink-500);
		font-size: 0.85rem;
		line-height: 1.4;
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
		font-size: 1.7rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.world-inspector p {
		margin: 0;
		font-size: 0.92rem;
		line-height: 1.45;
	}

	.open-city {
		border: 1px solid var(--ink-900);
		border-radius: 2px;
		background: var(--moss);
		color: var(--paper-50);
		padding: 0.65rem 0.8rem;
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
</style>
