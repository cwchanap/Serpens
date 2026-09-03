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

<aside class="control-desk plaque" aria-label={i18n.t('controlDesk.group')}>
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
	{#if disabledReason && (buildDisabled || advanceDisabled || railBuildDisabled)}
		<p class="disabled-copy" role="status">{disabledReason}</p>
	{/if}

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
</aside>

<!-- Compact-mode horizontal-scroll affordance: a fixed paper fade over the
	right edge of the full-bleed bottom dock (pointer-events none), so a
	clipped tail control reads as "more content" instead of a dead cut.
	Rendered only at <=980px by the media query below. -->
<div class="dock-edge-fade" aria-hidden="true"></div>

<style>
	.control-desk {
		position: fixed;
		top: 5.5rem;
		bottom: 1rem;
		left: 0;
		width: var(--control-desk-rail-width);
		padding: 0.75rem;
		z-index: 25;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.625rem;
		overflow-y: auto;
	}

	.control-desk .btn-icon {
		width: 3.5rem;
		height: 3.5rem;
		flex: none;
	}

	.cluster {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.625rem;
		flex: none;
	}

	.manage {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.625rem;
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
	}

	.rail-toggle.active {
		background: var(--brass-500);
		color: var(--paper-50);
	}

	/* Column stack: three ~35px text buttons (~110px in a row) cannot fit the
	   rail's 3.5rem content column; vertically they sit under Pause/Resume. */
	.speed-controls {
		display: inline-flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.speed-button {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 700;
		padding: 0.45rem 0.55rem;
	}

	.speed-button.active {
		border-color: var(--brass-500);
		background: var(--paper-200);
	}

	/* Paper fade pinned over the dock's right edge: starts transparent past
	   the end-padding zone so fully scrolled content clears it, and ghosts
	   whatever is clipped under the edge while there is more to scroll. */
	.dock-edge-fade {
		position: fixed;
		right: 0;
		bottom: 0;
		z-index: 26;
		width: 3rem;
		height: calc(var(--control-desk-compact-height) - 1px);
		display: none;
		pointer-events: none;
		background: linear-gradient(
			to left,
			transparent,
			color-mix(in srgb, var(--paper-50) 74%, transparent) 62%,
			var(--paper-50)
		);
	}

	@media (max-width: 980px) {
		.control-desk {
			top: auto;
			right: 0;
			bottom: 0;
			width: auto;
			min-height: var(--control-desk-compact-height);
			/* End padding keeps the last control clear of the fade at full scroll. */
			padding: 0.75rem;
			padding-right: 3.25rem;
			overflow-x: auto;
			overflow-y: hidden;
			flex-direction: row;
			align-items: center;
		}

		.dock-edge-fade {
			display: block;
		}

		.cluster,
		.manage,
		.speed-controls {
			flex-direction: row;
		}

		.time {
			margin-left: auto;
		}

		.manage {
			overflow-y: visible;
		}
	}
</style>
