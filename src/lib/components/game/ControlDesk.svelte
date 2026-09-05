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
	<!-- One centered floating arrangement: the action medallion group (moss
		 Build leading, then management destinations and Shortcuts) and, clearly
		 separated to its right, the time cluster as its own compact parchment
		 plaque (moss pause square + thin divider + 1×/2×/5× text with brass
		 fill on the active speed). The band itself is transparent (map shows
		 through; see pointer-events below), so the dock reads as medallions and
		 one plaque floating over the map, not a slab. -->
	<div class="dock-row">
		<div class="cluster lead">
			<button
				type="button"
				class="btn-icon btn-icon-primary build-medallion"
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

		<div class="cluster">
			<button
				type="button"
				class="btn-icon"
				aria-label={i18n.t('controlDesk.shortcuts')}
				onclick={onOpenShortcuts}
			>
				<GameIcon name="shortcuts" />
			</button>
		</div>

		<div class="time-plaque">
			<button
				type="button"
				class="pause-button"
				aria-label={paused ? i18n.t('controlDesk.resume') : i18n.t('controlDesk.pause')}
				disabled={pauseDisabled}
				onclick={onTogglePause}
			>
				<GameIcon name={paused ? 'resume' : 'pause'} />
			</button>
			<span class="plaque-divider" aria-hidden="true"></span>
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

	/* The centered arrangement: free space splits evenly on both sides via
	   auto margins, and when the row is wider than the viewport the margins
	   collapse to zero so the row stays left-scrollable (a
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

	/* The Build medallion leads the group: one step larger than the rest, so
	   the primary action reads first (mock: moss medallion leads the rail). */
	.control-desk .btn-icon.build-medallion {
		width: 3.75rem;
		height: 3.75rem;
	}

	:global(.btn-icon.build-medallion svg) {
		width: 1.5rem;
		height: 1.5rem;
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
	   so the centered arrangement stays intact) whenever a desk action is
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

	/* The time cluster gets its own compact parchment plaque (mock Turn-2
	   strip): paper backing with a fine brass border and shadow, separated
	   from the floating medallions so the pause/square + speed-text group
	   reads as one rich control, not more equal-weight medallions. */
	.time-plaque {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		flex: none;
		margin-left: 0.75rem;
		padding: 0.45rem 0.75rem 0.45rem 0.5rem;
		border: 1px solid var(--brass-700);
		border-radius: 4px;
		background-color: var(--paper-50);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		box-shadow: var(--shadow-paper);
	}

	/* Strong moss pause/resume square inside the plaque. */
	.pause-button {
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		padding: 0;
		flex: none;
		border: 1px solid var(--ink-900);
		border-radius: 6px;
		background: var(--moss);
		color: var(--paper-50);
		box-shadow:
			inset 0 0 0 1px var(--moss-2),
			var(--shadow-paper);
	}

	.pause-button:hover:not(:disabled) {
		background: var(--moss-2);
	}

	.pause-button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	/* Thin vertical brass hairline between the pause square and the speeds. */
	.plaque-divider {
		flex: none;
		align-self: stretch;
		width: 1px;
		background: linear-gradient(
			to bottom,
			transparent,
			var(--brass-700) 28%,
			var(--brass-700) 72%,
			transparent
		);
	}

	.rail-toggle.active {
		background: var(--brass-500);
		color: var(--paper-50);
	}

	/* 1×/2×/5× speeds read as brass text on the parchment; the active speed
	   gets the brass fill (mock: active-speed brass fill). */
	.speed-controls {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		gap: 0.2rem;
	}

	.speed-button {
		min-width: 2rem;
		padding: 0.25rem 0.4rem;
		border: 0;
		border-radius: 3px;
		background: transparent;
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.95rem;
		font-weight: 700;
		text-align: center;
	}

	.speed-button:hover:not(:disabled):not(.active) {
		background: color-mix(in srgb, var(--brass-300) 35%, transparent);
		color: var(--ink-700);
	}

	.speed-button.active {
		background: var(--brass-500);
		color: var(--paper-50);
		box-shadow: inset 0 0 0 1px var(--brass-700);
	}

	.speed-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
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
