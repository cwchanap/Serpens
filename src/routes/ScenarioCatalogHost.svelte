<script lang="ts">
	import ScenarioCatalog from '$lib/components/game/ScenarioCatalog.svelte';
	import type { I18nBundle } from '$lib/i18n';
	import type { createScenarioUi } from './scenarioUi.svelte';
	let { ui, i18n }: { ui: ReturnType<typeof createScenarioUi>; i18n: I18nBundle } = $props();
</script>

{#if ui.isCatalogOpen}
	<ScenarioCatalog
		cards={ui.cards}
		{i18n}
		operationError={ui.error}
		pending={ui.pending}
		persistenceReady={ui.ready}
		onStart={ui.startScenarioCard}
		onResume={ui.resumeScenarioCard}
		onRestart={ui.restartScenarioCard}
		onStartCurrent={ui.startCurrentVersionCard}
		onImport={ui.importScenarioCode}
		onCopy={ui.copyScenarioCode}
		onRetry={ui.retry}
		onClose={ui.closeCatalog}
	/>
{/if}
