<script lang="ts">
	import ScenarioResultsDialog from '$lib/components/game/ScenarioResultsDialog.svelte';
	import type { I18nBundle } from '$lib/i18n';
	import type { createScenarioUi } from './scenarioUi.svelte';
	let { ui, i18n }: { ui: ReturnType<typeof createScenarioUi>; i18n: I18nBundle } = $props();
</script>

{#if ui.isResultsOpen && ui.results}
	<ScenarioResultsDialog
		view={ui.results}
		{i18n}
		pending={ui.pending}
		error={ui.error}
		onRestart={ui.restartResultScenario}
		onCatalog={ui.openCatalogFromResults}
		onSandbox={ui.returnToSandboxFromResults}
		onRetry={ui.retry}
		onDismissError={ui.dismissError}
		onClose={ui.closeResults}
	/>
{/if}
