<script lang="ts">
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
</script>

<section class="world-map" aria-label="World map">
	<svg class="world-map-canvas" viewBox="0 0 100 100" role="img" aria-label="Regional city network">
		{#each statuses as status (status.city.id)}
			<circle
				class={{
					'city-node': true,
					retail: status.city.kind === 'retail',
					industry: status.city.kind === 'industry',
					opened: status.state === 'opened',
					revealed: status.state === 'revealed',
					locked: status.state === 'locked'
				}}
				cx={status.city.worldX}
				cy={status.city.worldY}
				r="4"
			/>
		{/each}
	</svg>

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
				aria-pressed={selectedCityId === status.city.id}
				onclick={() => onSelectCity(status.city.id)}
			>
				<strong>{status.city.name}</strong>
				<span>{kindLabel(status)} - {statusLabel(status)}</span>
				<small>{status.city.specialtySummary}</small>
				{#if status.state === 'locked' && status.blockedReason}
					<small>{status.blockedReason}</small>
				{/if}
			</button>
		{/each}
	</div>

	{#if selectedStatus}
		<div class="world-inspector paper" role="dialog" aria-label="City details" aria-modal="false">
			<button
				type="button"
				class="close"
				aria-label="Close city details"
				onclick={onCloseInspector}
			>
				Close
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
					onclick={() => onOpenCity(selectedStatus.city.id)}
				>
					Open for {selectedStatus.city.openingCost.toLocaleString('en-US')} cash
				</button>
				{#if selectedStatus.blockedReason}
					<p class="blocked-reason">{selectedStatus.blockedReason}</p>
				{/if}
			{:else if selectedStatus.state === 'locked'}
				<p class="blocked-reason">{selectedStatus.blockedReason}</p>
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
		background:
			radial-gradient(
				circle at 28% 52%,
				color-mix(in srgb, var(--brass-500) 16%, transparent),
				transparent 15%
			),
			radial-gradient(
				circle at 72% 36%,
				color-mix(in srgb, var(--moss) 20%, transparent),
				transparent 18%
			),
			var(--walnut-900);
		color: var(--paper-100);
	}

	.world-map-canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.city-node {
		stroke: var(--ink-900);
		stroke-width: 1.4;
	}

	.city-node.retail {
		fill: var(--brass-500);
	}

	.city-node.industry {
		fill: var(--moss);
	}

	.city-node.revealed {
		stroke: var(--paper-50);
	}

	.city-node.locked {
		opacity: 0.36;
	}

	.world-node-list {
		position: absolute;
		left: 1rem;
		bottom: 1rem;
		display: grid;
		gap: 0.5rem;
		width: min(24rem, calc(100% - 2rem));
		max-height: calc(100% - 2rem);
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
	.world-node-card[aria-pressed='true'] {
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
	}

	span,
	small,
	p {
		font-family: var(--font-ui);
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
