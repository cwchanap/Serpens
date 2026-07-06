<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { on } from 'svelte/events';
	import type { MapViewId } from '$lib/game/mapViewKeepAlive';

	interface Props {
		activeMapView: MapViewId;
		onSelectView: (view: MapViewId) => void;
		menuContent?: Snippet;
		open?: boolean;
	}

	let { activeMapView, onSelectView, menuContent, open = $bindable(false) }: Props = $props();

	const views: Array<{ id: MapViewId; label: string; ariaLabel: string }> = [
		{ id: 'retail', label: 'Retail', ariaLabel: 'Retail city map' },
		{ id: 'industry', label: 'Industry', ariaLabel: 'Industry city map' },
		{ id: 'world', label: 'World', ariaLabel: 'World map' }
	];

	function toggleMenu(): void {
		open = !open;
	}

	function selectView(view: MapViewId): void {
		onSelectView(view);
		open = false;
	}

	// Standard dropdown behaviour: dismiss the popover on any pointer press outside it.
	// The attachment is only applied while `open` is true (conditional-attachment
	// pattern), so the global listener is registered on open and torn down on close — no
	// always-on window listener and no implicit re-run contract inside the body.
	const dismissMenuOnOutsidePointer: Attachment<HTMLElement> = (node) => {
		return on(window, 'pointerdown', (event) => {
			if (!node.contains(event.target as Node)) {
				open = false;
			}
		});
	};
</script>

<div class="game-menu" {@attach open && dismissMenuOnOutsidePointer}>
	<button
		type="button"
		class="btn-icon"
		aria-label="Menu"
		aria-expanded={open}
		onclick={toggleMenu}
	>
		<svg aria-hidden="true" viewBox="0 0 24 24">
			<path d="M4 7h16" />
			<path d="M4 12h16" />
			<path d="M4 17h16" />
		</svg>
	</button>
	{#if open}
		<div class="menu-popover paper" role="group" aria-label="Menu">
			<div class="menu-section">
				<p class="menu-label">Map view</p>
				<div class="views" role="group" aria-label="Map view">
					{#each views as view (view.id)}
						<button
							type="button"
							class="view-tab"
							class:active-view={activeMapView === view.id}
							aria-label={view.ariaLabel}
							aria-pressed={activeMapView === view.id}
							onclick={() => selectView(view.id)}
						>
							{view.label}
						</button>
					{/each}
				</div>
			</div>
			{#if menuContent}
				{@render menuContent()}
			{/if}
		</div>
	{/if}
</div>

<style>
	.game-menu {
		position: relative;
	}

	.menu-popover {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		z-index: 31;
		display: grid;
		gap: 0.5rem;
		width: min(20rem, 80vw);
		padding: 0.7rem;
	}

	.menu-label {
		margin: 0 0 0.4rem;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	.views {
		display: flex;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		overflow: hidden;
	}

	.view-tab {
		flex: 1;
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
</style>
