<!-- src/lib/components/game/ControlDesk.svelte -->
<script lang="ts">
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

<footer class="control-desk plaque" aria-label={i18n.t('controlDesk.group')}>
	<div class="cluster">
		<button
			type="button"
			class="desk-build"
			aria-label={i18n.t('controlDesk.build')}
			disabled={buildDisabled}
			onclick={onBuild}
		>
			{i18n.t('controlDesk.build')} <kbd class="keycap">B</kbd>
		</button>
		{#if showRailBuild}
			<button
				type="button"
				class="desk-build rail-toggle"
				class:active={railBuildActive}
				aria-pressed={railBuildActive}
				aria-label={i18n.t('railBuild.toolbar')}
				disabled={railBuildDisabled}
				onclick={onToggleRailBuild}
			>
				{i18n.t('railBuild.toolbar')}
			</button>
		{/if}
	</div>
	{#if disabledReason && (buildDisabled || advanceDisabled || railBuildDisabled)}
		<p class="disabled-copy" role="status">{disabledReason}</p>
	{/if}

	<div class="cluster manage" role="group" aria-label={i18n.t('controlDesk.management')}>
		{#each managementItems as item (item.id)}
			<button type="button" class="manage-btn" onclick={() => onOpenManagement(item.id)}>
				{item.label}
				{#if item.shortcut}<kbd class="keycap">{item.shortcut}</kbd>{/if}
			</button>
		{/each}
	</div>

	<div class="cluster time">
		<button
			type="button"
			class="desk-shortcuts"
			aria-label={i18n.t('controlDesk.shortcuts')}
			onclick={onOpenShortcuts}
		>
			{i18n.t('controlDesk.shortcuts')} <kbd class="keycap">?</kbd>
		</button>
		<button
			type="button"
			class="btn-primary advance"
			aria-label={paused ? i18n.t('controlDesk.resume') : i18n.t('controlDesk.pause')}
			disabled={advanceDisabled}
			onclick={onTogglePause}
		>
			{paused ? i18n.t('controlDesk.resume') : i18n.t('controlDesk.pause')}
			<kbd class="keycap">Space</kbd>
		</button>
		<div class="speed-controls" role="group" aria-label={i18n.t('controlDesk.simulationSpeed')}>
			{#each [1, 2, 5] as speed}
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

	.rail-toggle.active {
		background: var(--brass-500);
		color: var(--paper-50);
	}

	.manage-btn {
		display: inline-flex;
		align-items: center;
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

	.advance {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.speed-controls {
		display: inline-flex;
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

	.desk-shortcuts {
		display: inline-flex;
		align-items: center;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 0.45rem 0.7rem;
	}

	.desk-shortcuts:hover,
	.desk-shortcuts:focus-visible {
		background: var(--paper-200);
		border-color: var(--brass-500);
	}

	@media (max-width: 980px) {
		.manage {
			display: none;
		}
	}
</style>
