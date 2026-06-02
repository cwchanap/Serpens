<script lang="ts">
	import { asset } from '$app/paths';
	import { WORLD_MAP_ART } from '$lib/assets/gameArt';
	import type { WorldCityStatus } from '$lib/game/world';

	interface Props {
		statuses: WorldCityStatus[];
		selectedCityId: string | null;
		onSelectCity: (cityId: string) => void;
		onOpenCity: (cityId: string) => void;
		onCloseInspector: () => void;
	}

	let { statuses, selectedCityId, onSelectCity, onOpenCity, onCloseInspector }: Props = $props();

	const selectedStatus = $derived(
		selectedCityId ? (statuses.find((status) => status.city.id === selectedCityId) ?? null) : null
	);

	function statusLabel(status: WorldCityStatus): string {
		if (status.state === 'opened') return 'Opened';
		if (status.state === 'revealed') return 'Ready to open';
		return 'Locked';
	}

	function kindLabel(status: WorldCityStatus): string {
		return status.city.kind === 'retail' ? 'Retail' : 'Industry';
	}

	function markerPath(status: WorldCityStatus): string {
		if (status.state === 'locked') {
			return WORLD_MAP_ART.markers.locked.path;
		}

		return status.city.kind === 'retail'
			? WORLD_MAP_ART.markers.retail.path
			: WORLD_MAP_ART.markers.industry.path;
	}

	function cityDescriptionId(status: WorldCityStatus): string {
		return `world-city-${status.city.id}-description`;
	}

	function cityRequirementId(status: WorldCityStatus): string {
		return `world-city-${status.city.id}-requirement`;
	}

	function cityTitleId(status: WorldCityStatus): string {
		return `world-city-${status.city.id}-title`;
	}

	function cityDescriptionIds(status: WorldCityStatus): string {
		return status.state === 'locked' && status.blockedReason
			? `${cityDescriptionId(status)} ${cityRequirementId(status)}`
			: cityDescriptionId(status);
	}

	function inspectorReasonId(status: WorldCityStatus): string {
		return `world-city-${status.city.id}-reason`;
	}

	function inspectorId(status: WorldCityStatus): string {
		return `world-city-${status.city.id}-inspector`;
	}
</script>

<section class="world-map" aria-label="World map">
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
		{#each statuses as status (status.city.id)}
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

	<div class="world-node-list" aria-label="Cities">
		{#each statuses as status (status.city.id)}
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
				onclick={() => onSelectCity(status.city.id)}
			>
				<strong id={cityTitleId(status)}>{status.city.name}</strong>
				<span id={cityDescriptionId(status)}>
					{kindLabel(status)} - {statusLabel(status)}. {status.city.specialtySummary}
				</span>
				{#if status.state === 'locked' && status.blockedReason}
					<small id={cityRequirementId(status)}>{status.blockedReason}</small>
				{/if}
			</button>
		{/each}
	</div>

	{#if selectedStatus}
		<div
			id={inspectorId(selectedStatus)}
			class="world-inspector paper"
			role="dialog"
			aria-label="City details"
			aria-modal="false"
		>
			<button
				type="button"
				class="close"
				aria-label="Close city details"
				onclick={onCloseInspector}
			>
				X
			</button>
			<p class="eyebrow">
				{selectedStatus.city.kind === 'retail' ? 'Retail city' : 'Industrial city'}
			</p>
			<h2>{selectedStatus.city.name}</h2>
			<p>{selectedStatus.city.specialtySummary}</p>
			{#if selectedStatus.state === 'revealed'}
				<button
					type="button"
					class="open-city"
					disabled={!selectedStatus.canOpen}
					aria-describedby={selectedStatus.blockedReason
						? inspectorReasonId(selectedStatus)
						: undefined}
					onclick={() => onOpenCity(selectedStatus.city.id)}
				>
					Open for {selectedStatus.city.openingCost.toLocaleString('en-US')} cash
				</button>
				{#if selectedStatus.blockedReason}
					<p id={inspectorReasonId(selectedStatus)} class="blocked-reason">
						{selectedStatus.blockedReason}
					</p>
				{/if}
			{:else if selectedStatus.state === 'locked'}
				<p id={inspectorReasonId(selectedStatus)} class="blocked-reason">
					{selectedStatus.blockedReason}
				</p>
			{:else}
				<p>
					{selectedStatus.storeCount} stores - {selectedStatus.buildingCount} industrial buildings
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
