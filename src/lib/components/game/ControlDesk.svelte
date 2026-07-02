<!-- src/lib/components/game/ControlDesk.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { MapViewId } from '$lib/game/mapViewKeepAlive';

	interface ManagementItem {
		id: string;
		label: string;
	}

	interface Props {
		activeMapView: MapViewId;
		managementItems: ManagementItem[];
		buildDisabled: boolean;
		advanceDisabled: boolean;
		onBuild: () => void;
		onSelectView: (view: MapViewId) => void;
		onOpenManagement: (id: string) => void;
		onAdvanceDay: () => void;
		menuContent?: Snippet;
	}

	let {
		activeMapView,
		managementItems,
		buildDisabled,
		advanceDisabled,
		onBuild,
		onSelectView,
		onOpenManagement,
		onAdvanceDay,
		menuContent
	}: Props = $props();

	const views: Array<{ id: MapViewId; label: string; ariaLabel: string }> = [
		{ id: 'retail', label: 'Retail', ariaLabel: 'Retail city map' },
		{ id: 'industry', label: 'Industry', ariaLabel: 'Industry city map' },
		{ id: 'world', label: 'World', ariaLabel: 'World map' }
	];

	let menuOpen = $state(false);

	function toggleMenu(): void {
		menuOpen = !menuOpen;
	}
</script>

<footer class="control-desk plaque" aria-label="Control desk">
	<div class="cluster">
		<button
			type="button"
			class="desk-build"
			aria-label="Build"
			disabled={buildDisabled}
			onclick={onBuild}
		>
			Build <kbd class="keycap">B</kbd>
		</button>
	</div>

	<div class="cluster views" role="group" aria-label="Map view">
		{#each views as view (view.id)}
			<button
				type="button"
				class="view-tab"
				class:active-view={activeMapView === view.id}
				aria-label={view.ariaLabel}
				aria-pressed={activeMapView === view.id}
				onclick={() => onSelectView(view.id)}
			>
				{view.label}
			</button>
		{/each}
	</div>

	<div class="cluster manage" role="group" aria-label="Management">
		{#each managementItems as item (item.id)}
			<button type="button" class="manage-btn" onclick={() => onOpenManagement(item.id)}>
				{item.label}
			</button>
		{/each}
	</div>

	<div class="cluster time">
		<div class="desk-menu">
			<button
				type="button"
				class="btn-icon"
				aria-label="Menu"
				aria-expanded={menuOpen}
				onclick={toggleMenu}
			>
				<svg aria-hidden="true" viewBox="0 0 24 24">
					<path d="M4 7h16" />
					<path d="M4 12h16" />
					<path d="M4 17h16" />
				</svg>
			</button>
			{#if menuOpen && menuContent}
				<div class="desk-popover paper" role="group" aria-label="Menu">
					{@render menuContent()}
				</div>
			{/if}
		</div>
		<button
			type="button"
			class="btn-primary advance"
			aria-label="Advance day"
			disabled={advanceDisabled}
			onclick={onAdvanceDay}
		>
			Advance Day <kbd class="keycap">Space</kbd>
		</button>
	</div>
</footer>

<style>
	.control-desk {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 25;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
		padding: 0.6rem 0.85rem;
	}

	.cluster {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.manage {
		flex-wrap: wrap;
	}

	.time {
		margin-left: auto;
	}

	.desk-build {
		display: inline-flex;
		align-items: center;
		border: 1.5px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-weight: 700;
		padding: 0.55rem 0.85rem;
	}

	.desk-build:hover:not(:disabled),
	.desk-build:focus-visible:not(:disabled) {
		background: var(--paper-200);
	}

	.desk-build:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.views {
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		overflow: hidden;
	}

	.view-tab {
		border: 0;
		border-right: 1px solid var(--brass-500);
		background: var(--paper-50);
		color: var(--ink-500);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.5rem 0.85rem;
	}

	.views .view-tab:last-child {
		border-right: 0;
	}

	.view-tab.active-view {
		background: var(--paper-300);
		color: var(--ink-900);
		font-weight: 700;
	}

	.manage-btn {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 0.45rem 0.7rem;
	}

	.manage-btn:hover,
	.manage-btn:focus-visible {
		background: var(--paper-200);
		border-color: var(--brass-500);
	}

	.desk-menu {
		position: relative;
	}

	.desk-popover {
		position: absolute;
		bottom: calc(100% + 0.5rem);
		right: 0;
		z-index: 26;
		display: grid;
		gap: 0.5rem;
		width: min(20rem, 80vw);
		padding: 0.7rem;
	}

	.advance {
		display: inline-flex;
		align-items: center;
	}

	@media (max-width: 980px) {
		.manage {
			display: none;
		}
	}
</style>
