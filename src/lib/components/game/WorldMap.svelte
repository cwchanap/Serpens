<script lang="ts">
	import { asset } from '$app/paths';
	import { WORLD_MAP_ART } from '$lib/assets/gameArt';
	import { localizeWorldCityStatus } from '$lib/i18n/gameCopy';
	import type { LocalizedWorldCityStatus } from '$lib/i18n/localizedTypes';
	import type { I18nBundle } from '$lib/i18n';
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
		disabledReason = null
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
				<strong id={cityTitleId(status)}>{status.city.name}</strong>
				<span id={cityDescriptionId(status)}>
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
			<p class="eyebrow">{i18n.t(`worldMap.cityEyebrow.${selectedStatus.city.kind}` as never)}</p>
			<h2>{selectedStatus.city.name}</h2>
			<p>{selectedStatus.city.specialtySummary}</p>
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
						onclick={() => {
							if (allowedCitySet.has(selectedStatus.city.id)) {
								onFinanceCity(selectedStatus.city.id);
							}
						}}
					>
						{i18n.t('financePanel.financedPurchase.financeOpening' as never)}
					</button>
				{/if}
				{#if !canOpenWorldCity && (!selectedStatus.financeOffer || !canFinanceWorldCity)}
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
		position: relative;
		aspect-ratio: 1;
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: 100%;
		margin: auto;
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
		width: min(24rem, calc(100% - 2rem));
		overflow: auto;
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
		gap: 0.65rem;
		width: min(360px, calc(100% - 2rem));
		padding: 1rem;
		color: var(--ink-700);
	}

	.close {
		justify-self: end;
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		padding: 0.3rem 0.5rem;
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
