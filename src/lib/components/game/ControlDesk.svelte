<!-- src/lib/components/game/ControlDesk.svelte -->
<script lang="ts">
	import type { ManagementPanelId } from '$lib/game/keyboardShortcuts';
	import type { I18nBundle } from '$lib/i18n';
	import type { ManagementPanelMenuItem } from './gameNavigation';
	import GameIcon from './GameIcon.svelte';

	type SimulationSpeed = 1 | 2 | 5;

	interface Props {
		managementItems: ManagementPanelMenuItem[];
		buildDisabled: boolean;
		advanceDisabled: boolean;
		pauseDisabled?: boolean;
		railBuildDisabled?: boolean;
		disabledReason?: string | null;
		i18n: I18nBundle;
		onBuild: () => void;
		onOpenManagement: (id: ManagementPanelId) => void;
		paused?: boolean;
		simulationSpeed?: SimulationSpeed;
		onTogglePause?: () => void;
		onSelectSpeed?: (speed: SimulationSpeed) => void;
		onOpenShortcuts: () => void;
		/** Shows the rail-build toggle next to Build — industry map only. */
		showRailBuild?: boolean;
		railBuildActive?: boolean;
		onToggleRailBuild?: () => void;
	}

	let {
		managementItems,
		buildDisabled,
		advanceDisabled,
		pauseDisabled = advanceDisabled,
		railBuildDisabled = false,
		disabledReason = null,
		i18n,
		onBuild,
		onOpenManagement,
		paused = false,
		simulationSpeed = 1,
		onTogglePause = () => {},
		onSelectSpeed = () => {},
		onOpenShortcuts,
		showRailBuild = false,
		railBuildActive = false,
		onToggleRailBuild
	}: Props = $props();
</script>

<aside class="control-desk" aria-label={i18n.t('controlDesk.group')}>
	<!-- One centered floating cluster: action + management medallions, a slim
		 separator, then the time medallions (shortcuts/pause + 1×/2×/5× pills)
		 all adjacent — no edge-spread across the viewport. The band itself is
		 transparent (map shows through; see pointer-events below), so the dock
		 reads as medallions floating over the map, not a slab. -->
	<div class="dock-row">
		<div class="cluster">
			<button
				type="button"
				class="btn-icon btn-icon-primary"
				aria-label={i18n.t('controlDesk.build')}
				disabled={buildDisabled}
				onclick={onBuild}
			>
				<GameIcon name="build" />
			</button>
			{#if showRailBuild}
				<button
					type="button"
					class="btn-icon rail-toggle"
					class:active={railBuildActive}
					aria-pressed={railBuildActive}
					aria-label={i18n.t('railBuild.toolbar')}
					disabled={railBuildDisabled}
					onclick={onToggleRailBuild}
				>
					<GameIcon name="rail" />
				</button>
			{/if}
		</div>

		<div class="manage" role="group" aria-label={i18n.t('controlDesk.management')}>
			{#each managementItems as item (item.id)}
				<button
					type="button"
					class="btn-icon"
					aria-label={item.label}
					title={`${item.label} (${item.shortcut})`}
					onclick={() => onOpenManagement(item.id)}
				>
					<GameIcon name={item.icon} />
				</button>
			{/each}
		</div>

		<div class="cluster time">
			<span class="separator" aria-hidden="true"></span>
			<button
				type="button"
				class="btn-icon"
				aria-label={i18n.t('controlDesk.shortcuts')}
				onclick={onOpenShortcuts}
			>
				<GameIcon name="shortcuts" />
			</button>
			<button
				type="button"
				class="btn-icon"
				aria-label={paused ? i18n.t('controlDesk.resume') : i18n.t('controlDesk.pause')}
				disabled={pauseDisabled}
				onclick={onTogglePause}
			>
				<GameIcon name={paused ? 'resume' : 'pause'} />
			</button>
			<div class="speed-controls" role="group" aria-label={i18n.t('controlDesk.simulationSpeed')}>
				{#each [1, 2, 5] as speed (speed)}
					<button
						type="button"
						class="speed-button"
						class:active={simulationSpeed === speed}
						aria-label={`${speed}×`}
						aria-pressed={simulationSpeed === speed}
						disabled={advanceDisabled}
						onclick={() => onSelectSpeed(speed as SimulationSpeed)}
					>
						{speed}×
					</button>
				{/each}
			</div>
		</div>
	</div>
</aside>
{#if disabledReason && (buildDisabled || advanceDisabled || railBuildDisabled)}
	<p class="disabled-copy" role="status">{disabledReason}</p>
{/if}

<!-- Horizontal-scroll affordance for the bottom dock: a fixed soft veil over
	the dock's right edge (pointer-events none), so a clipped tail control reads
	as "more content" instead of a dead cut against the map. -->
<div class="dock-edge-fade" aria-hidden="true"></div>

<style>
	/* Mock parity: one horizontal dock of floating circular brass medallions,
	   full-width at every viewport, over the reserved map band below. No
	   continuous paper slab behind the buttons — each carries its own frame
	   and shadow via the shared .btn-icon treatment. */
	.control-desk {
		position: fixed;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 25;
		display: flex;
		flex-direction: row;
		align-items: center;
		padding: 0.75rem 1rem;
		min-height: var(--control-desk-compact-height);
		/* The band carries NO background: the map stays full-bleed beneath the
		   floating medallions. Empty band space passes clicks through to the
		   map (only the medallion buttons re-enable pointer events). */
		pointer-events: none;
		overflow-x: auto;
		overflow-y: hidden;
		/* Scrollable, but no visible bar inside the floating band — the right
		   edge veil is the overflow affordance. */
		scrollbar-width: none;
	}

	.control-desk::-webkit-scrollbar {
		display: none;
	}

	.control-desk button {
		pointer-events: auto;
	}

	/* The single centered cluster: free space splits evenly on both sides via
	   auto margins, and when the cluster is wider than the viewport the
	   margins collapse to zero so the row stays left-scrollable (a
	   justify-content: center dock would clip its leading medallions). */
	.dock-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.625rem;
		flex: none;
		margin-inline: auto;
	}

	.control-desk .btn-icon {
		width: 3.5rem;
		height: 3.5rem;
		flex: none;
	}

	.cluster,
	.manage {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.625rem;
		flex: none;
	}

	/* Floating status chip: shows above the medallion row (never inside it,
	   so the centered cluster stays intact) whenever a desk action is
	   disabled by the current game context. */
	.disabled-copy {
		position: fixed;
		left: 0.75rem;
		bottom: calc(var(--control-desk-compact-height) - 0.35rem);
		z-index: 26;
		margin: 0;
		padding: 0.4rem 0.75rem;
		border: 1px solid var(--brass-500);
		border-radius: 999px;
		background: var(--paper-50);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-weight: 700;
		box-shadow: var(--shadow-paper);
		pointer-events: none;
	}

	.rail-toggle.active {
		background: var(--brass-500);
		color: var(--paper-50);
	}

	/* Slim brass hairline that marks the time cluster off from the action
	   medallions (mock: pause + speeds form their own visual group). */
	.separator {
		flex: none;
		align-self: center;
		width: 1px;
		height: 2.25rem;
		background: color-mix(in srgb, var(--brass-700) 65%, transparent);
	}

	.speed-controls {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		gap: 0.3rem;
	}

	.speed-button {
		border: 1.5px solid var(--brass-500);
		border-radius: 999px;
		background: var(--paper-50);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.9rem;
		font-weight: 700;
		padding: 0.45rem 0.75rem;
	}

	.speed-button.active {
		border-color: var(--brass-700);
		background: var(--paper-200);
	}

	/* Soft veil pinned over the dock's right edge: transparent at the very
	   edge (fully scrolled content clears it via the end padding) and a light
	   walnut shade over whatever is clipped underneath mid-scroll. */
	.dock-edge-fade {
		position: fixed;
		right: 0;
		bottom: 0;
		z-index: 26;
		width: 3rem;
		height: calc(var(--control-desk-compact-height) - 1px);
		pointer-events: none;
		background: linear-gradient(
			to left,
			transparent,
			color-mix(in srgb, var(--walnut-900) 20%, transparent) 55%,
			color-mix(in srgb, var(--walnut-900) 30%, transparent)
		);
	}
</style>
