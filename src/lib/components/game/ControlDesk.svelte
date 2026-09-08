<!-- src/lib/components/game/ControlDesk.svelte -->
<script lang="ts">
	import HudIcon from './HudIcon.svelte';
	import type { ManagementPanelId } from '$lib/game/keyboardShortcuts';
	import type { I18nBundle } from '$lib/i18n';

	interface ManagementItem {
		id: ManagementPanelId;
		label: string;
		shortcut?: string;
	}

	type SimulationSpeed = 1 | 2 | 5;

	interface Props {
		managementItems: ManagementItem[];
		buildDisabled: boolean;
		advanceDisabled: boolean;
		pauseDisabled?: boolean;
		railBuildDisabled?: boolean;
		disabledReason?: string | null;
		i18n: I18nBundle;
		onBuild: () => void;
		onOpenManagement: (id: ManagementPanelId) => void;
		paused?: boolean;
		day?: number;
		worldView?: boolean;
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
		day = 1,
		worldView = false,
		simulationSpeed = 1,
		onTogglePause = () => {},
		onSelectSpeed = () => {},
		onOpenShortcuts,
		showRailBuild = false,
		railBuildActive = false,
		onToggleRailBuild
	}: Props = $props();
</script>

<footer class="control-desk" class:world-view={worldView} aria-label={i18n.t('controlDesk.group')}>
	<div class="dock plaque">
		<div class="cluster">
			<button
				type="button"
				class="desk-build"
				aria-label={i18n.t('controlDesk.build')}
				title={i18n.t('controlDesk.build')}
				disabled={buildDisabled}
				onclick={onBuild}
			>
				<HudIcon name={showRailBuild ? 'industry' : 'build'} /><kbd class="keycap">B</kbd>
			</button>
		</div>
		{#if disabledReason && (buildDisabled || advanceDisabled || railBuildDisabled)}
			<p class="disabled-copy" role="status">{disabledReason}</p>
		{/if}

		<div class="cluster manage" role="group" aria-label={i18n.t('controlDesk.management')}>
			{#each managementItems as item (item.id)}
				<button
					type="button"
					class="manage-btn"
					aria-label={`${item.label} ${item.shortcut ?? ''}`}
					title={`${item.label} (${item.shortcut ?? ''})`}
					onclick={() => onOpenManagement(item.id)}
				>
					<HudIcon name={item.id} />
					{#if item.shortcut}<kbd class="keycap">{item.shortcut}</kbd>{/if}
				</button>
			{/each}
		</div>
		{#if showRailBuild}
			<button
				type="button"
				class="rail-toggle"
				class:active={railBuildActive}
				aria-pressed={railBuildActive}
				aria-label={i18n.t('railBuild.toolbar')}
				title={i18n.t('railBuild.toolbar')}
				disabled={railBuildDisabled}
				onclick={onToggleRailBuild}
			>
				<HudIcon name="rail" />
			</button>
		{/if}
		<button
			type="button"
			class="desk-shortcuts"
			aria-label={i18n.t('controlDesk.shortcuts')}
			onclick={onOpenShortcuts}
		>
			<HudIcon name="shortcuts" />
		</button>
	</div>
	<div class="cluster time plaque">
		<button
			type="button"
			class="btn-primary advance"
			class:running={!paused}
			aria-label={paused ? i18n.t('controlDesk.resume') : i18n.t('controlDesk.pause')}
			disabled={pauseDisabled}
			onclick={onTogglePause}
		>
			<HudIcon name={paused ? 'resume' : 'pause'} />
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
		<span class="day" aria-label={i18n.t('topBar.day', { day })}><HudIcon name="clock" />{day}</span
		>
	</div>
</footer>

<style>
	.day {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: 8px;
		padding-left: 12px;
		border-left: 1px solid var(--brass-500);
		font: 700 18px var(--font-mono);
		white-space: nowrap;
	}
	.day :global(svg) {
		width: 18px;
		height: 18px;
		color: var(--brass-700);
	}

	.control-desk {
		position: fixed;
		inset: 0;
		z-index: 25;
		pointer-events: none;
	}
	.dock {
		position: absolute;
		top: 0.75rem;
		bottom: 0.75rem;
		left: 0.75rem;
		width: 4.875rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 9px 7px;
		overflow-y: auto;
		pointer-events: auto;
	}
	.cluster {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.dock .cluster {
		flex-direction: column;
		width: 100%;
	}
	.manage {
		border-top: 1px solid var(--paper-edge);
		padding-top: 8px;
	}
	.time {
		position: absolute;
		bottom: 1.25rem;
		left: 50%;
		transform: translateX(-50%);
		gap: 12px;
		padding: 10px 14px;
		pointer-events: auto;
	}
	.desk-shortcuts {
		margin-top: auto;
		flex-shrink: 0;
	}
	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		position: relative;
		min-width: 2.75rem;
		min-height: 2.75rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-weight: 700;
	}
	.manage-btn,
	.desk-build {
		width: 3.75rem;
		height: clamp(2.75rem, 5.55dvh, 3.75rem);
		border: 1px solid var(--brass-500);
		box-shadow: inset 0 0 0 3px var(--paper-100);
	}
	.desk-build {
		background: var(--moss);
		color: var(--paper-50);
		box-shadow: inset 0 0 0 3px var(--moss);
	}
	.rail-toggle {
		margin-top: auto;
		flex-shrink: 0;
		width: 44px;
		height: 44px;
	}
	.rail-toggle + .desk-shortcuts {
		margin-top: 0;
	}
	.keycap {
		opacity: 0;
		position: absolute;
		right: 1px;
		bottom: 1px;
		margin: 0;
		font-size: 0.55rem;
		padding: 0 3px;
	}
	button:hover .keycap,
	button:focus-visible .keycap {
		opacity: 1;
	}
	button:hover:not(:disabled),
	button:focus-visible {
		background: var(--paper-200);
		color: var(--ink-900);
		outline: 2px solid var(--brass-500);
		outline-offset: 2px;
	}
	.active {
		background: var(--wax-red);
		color: var(--paper-50);
		border-color: var(--wax-red);
	}
	.speed-button.active {
		background: var(--paper-300);
		color: var(--ink-700);
		border-color: var(--brass-500);
	}
	.advance.running {
		background: var(--moss);
		color: var(--paper-50);
	}
	button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.speed-controls {
		display: flex;
		gap: 0;
	}
	.disabled-copy {
		color: var(--wax-red);
		font-size: 0.65rem;
		overflow-wrap: anywhere;
	}
	@media (max-width: 600px) {
		.dock {
			top: auto;
			right: 0.5rem;
			left: 0.5rem;
			bottom: 4.5rem;
			width: auto;
			height: 3.65rem;
			flex-direction: row;
			padding: 0.3rem;
			overflow-x: auto;
			overflow-y: hidden;
		}
		.dock .cluster {
			flex-direction: row;
			width: auto;
			flex: 0 0 auto;
		}
		.manage {
			border-top: 0;
			border-left: 1px solid var(--paper-edge);
			padding: 0 0 0 0.4rem;
		}
		.manage-btn,
		.desk-build {
			width: 2.75rem;
			height: 2.75rem;
		}
		.time {
			bottom: 0.5rem;
			right: 0.5rem;
			left: auto;
			transform: none;
		}
		.desk-shortcuts {
			margin-top: 0;
		}
		.disabled-copy {
			display: none;
		}
	}
	.world-view {
		display: none;
	}
</style>
