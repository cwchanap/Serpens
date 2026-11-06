<script lang="ts">
	import ScenarioMenuSection from '$lib/components/game/ScenarioMenuSection.svelte';
	import type { I18nBundle } from '$lib/i18n';
	import type { createScenarioUi } from './scenarioUi.svelte';
	let {
		ui,
		playMode,
		i18n,
		onOpenSaves
	}: {
		ui: ReturnType<typeof createScenarioUi>;
		playMode: 'sandbox' | 'scenario';
		i18n: I18nBundle;
		onOpenSaves(): void;
	} = $props();
</script>

{#if playMode === 'scenario' && ui.hasActiveRun}
	<ScenarioMenuSection
		{i18n}
		title={ui.title}
		versionLabel={ui.versionLabel}
		pending={ui.pending}
		onDetails={ui.openCatalog}
		onRestart={ui.restartActiveScenario}
		onCatalog={ui.openCatalog}
		onSandbox={ui.returnToSandbox}
		onAbandon={ui.abandonActiveScenario}
	/>
{:else}
	<button type="button" onclick={ui.openCatalog}>{i18n.t('scenarioCatalog.catalog')}</button>
	<button type="button" onclick={onOpenSaves}>{i18n.t('gameMenu.saves')}</button>
{/if}
